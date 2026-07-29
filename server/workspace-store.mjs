import {
    copyFile,
    mkdir,
    open,
    readFile,
    rename,
    stat,
} from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { hashDiagram, synchronizeWorkspace } from './sync-core.mjs';

const isoDateSchema = z.string().datetime();
const revisionSchema = z.number().int().nonnegative();
const serializedDiagramSchema = z
    .object({
        id: z.string().min(1),
        name: z.string(),
        databaseType: z.string().min(1),
        createdAt: isoDateSchema,
        updatedAt: isoDateSchema,
    })
    .passthrough();
const diagramEntrySchema = z.object({
    revision: z.number().int().positive(),
    updatedAt: isoDateSchema,
    hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    data: serializedDiagramSchema,
});
const tombstoneSchema = z.object({
    revision: z.number().int().positive(),
    deletedAt: isoDateSchema,
});

export const workspaceSchema = z.object({
    schemaVersion: z.literal(1),
    workspaceRevision: z.number().int().positive(),
    updatedAt: isoDateSchema,
    config: z.object({
        revision: z.number().int().positive(),
        defaultDiagramId: z.string(),
    }),
    diagrams: z.record(diagramEntrySchema),
    tombstones: z.record(tombstoneSchema),
});

const localWorkspaceSchema = z.object({
    defaultDiagramId: z.string(),
    diagrams: z.array(serializedDiagramSchema),
});
const upsertChangeSchema = z.object({
    type: z.literal('upsert'),
    diagramId: z.string().min(1),
    baseRevision: revisionSchema.nullable(),
    data: serializedDiagramSchema,
});
const deleteChangeSchema = z.object({
    type: z.literal('delete'),
    diagramId: z.string().min(1),
    baseRevision: revisionSchema.nullable(),
});

export const syncRequestSchema = z.object({
    clientId: z.string().min(1).max(200),
    knownWorkspaceRevision: revisionSchema.nullable(),
    knownConfigRevision: revisionSchema.nullable().optional(),
    localWorkspace: localWorkspaceSchema.optional(),
    initialResolution: z.enum(['use-server', 'use-browser']).optional(),
    changes: z
        .array(
            z.discriminatedUnion('type', [
                upsertChangeSchema,
                deleteChangeSchema,
            ])
        )
        .default([]),
    configChange: z
        .object({
            baseRevision: revisionSchema,
            defaultDiagramId: z.string(),
        })
        .optional(),
});

const validateWorkspace = (input) => {
    const workspace = workspaceSchema.parse(input);

    for (const [diagramId, entry] of Object.entries(workspace.diagrams)) {
        if (entry.data.id !== diagramId) {
            throw new Error(`Diagram key does not match its ID: ${diagramId}`);
        }
        if (entry.hash !== hashDiagram(entry.data)) {
            throw new Error(`Diagram hash is invalid: ${diagramId}`);
        }
        if (workspace.tombstones[diagramId]) {
            throw new Error(
                `Diagram cannot be active and deleted: ${diagramId}`
            );
        }
    }

    if (
        workspace.config.defaultDiagramId &&
        !workspace.diagrams[workspace.config.defaultDiagramId]
    ) {
        throw new Error('Default diagram does not exist');
    }

    return workspace;
};

const readWorkspace = async (filePath) => {
    const contents = await readFile(filePath, 'utf8');
    return validateWorkspace(JSON.parse(contents));
};

const fileExists = async (filePath) => {
    try {
        await stat(filePath);
        return true;
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
};

export class WorkspaceStore {
    constructor(filePath) {
        this.filePath = resolve(filePath);
        this.backupPath = `${this.filePath}.bak`;
        this.workspace = null;
        this.recovered = false;
        this.loadError = null;
        this.queue = Promise.resolve();
    }

    async initialize() {
        if (!(await fileExists(this.filePath))) {
            return;
        }

        try {
            this.workspace = await readWorkspace(this.filePath);
            return;
        } catch (error) {
            this.loadError = error;
        }

        if (await fileExists(this.backupPath)) {
            try {
                this.workspace = await readWorkspace(this.backupPath);
                this.recovered = true;
                return;
            } catch {
                // Preserve both invalid files and report the original error.
            }
        }
    }

    getStatus() {
        return {
            recovered: this.recovered,
            hasWorkspace: Boolean(this.workspace),
            hasLoadError: Boolean(this.loadError),
        };
    }

    async synchronize(request) {
        return this.enqueue(async () => {
            if (this.loadError && !this.recovered) {
                throw new Error(
                    'The workspace and its backup could not be loaded'
                );
            }

            if (this.recovered) {
                return {
                    status: 'recovered',
                    workspace: structuredClone(this.workspace),
                    conflicts: [],
                };
            }

            const result = synchronizeWorkspace({
                workspace: this.workspace,
                request,
            });

            if (result.changed) {
                await this.writeWorkspace(result.workspace);
                this.workspace = result.workspace;
            }

            return result.response;
        });
    }

    async recover() {
        return this.enqueue(async () => {
            if (!this.recovered || !this.workspace) {
                throw new Error('No valid backup is available for recovery');
            }

            const corruptPath = `${this.filePath}.corrupt-${Date.now()}`;
            if (await fileExists(this.filePath)) {
                await copyFile(this.filePath, corruptPath);
            }

            await this.writeWorkspaceFile(this.workspace, false);
            this.recovered = false;
            this.loadError = null;

            return structuredClone(this.workspace);
        });
    }

    enqueue(operation) {
        const result = this.queue.then(operation);
        this.queue = result.catch(() => undefined);
        return result;
    }

    async writeWorkspace(workspace) {
        validateWorkspace(workspace);
        await this.writeWorkspaceFile(workspace, true);
    }

    async writeWorkspaceFile(workspace, preserveBackup) {
        const directory = dirname(this.filePath);
        await mkdir(directory, { recursive: true });

        const temporaryPath = `${directory}/.${basename(this.filePath)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
        const handle = await open(temporaryPath, 'wx', 0o600);
        try {
            await handle.writeFile(`${JSON.stringify(workspace, null, 2)}\n`);
            await handle.sync();
        } finally {
            await handle.close();
        }

        if (preserveBackup && (await fileExists(this.filePath))) {
            await readWorkspace(this.filePath);
            await copyFile(this.filePath, this.backupPath);
        }

        await rename(temporaryPath, this.filePath);
    }
}
