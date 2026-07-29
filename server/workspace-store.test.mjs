import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkspaceStore } from './workspace-store.mjs';

const diagram = (id, name = id) => ({
    id,
    name,
    databaseType: 'postgresql',
    tables: [],
    relationships: [],
    createdAt: '2026-07-29T10:00:00.000Z',
    updatedAt: '2026-07-29T10:00:00.000Z',
});

const initializeRequest = (diagrams) => ({
    clientId: 'browser-a',
    knownWorkspaceRevision: null,
    localWorkspace: {
        defaultDiagramId: diagrams[0]?.id ?? '',
        diagrams,
    },
    changes: [],
});

describe('WorkspaceStore', () => {
    it('persists and reloads a workspace', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'chartdb-sync-'));
        const filePath = join(directory, 'workspace.json');
        const store = new WorkspaceStore(filePath);
        await store.initialize();
        await store.synchronize(
            initializeRequest([diagram('a'), diagram('b')])
        );

        const reloaded = new WorkspaceStore(filePath);
        await reloaded.initialize();
        const response = await reloaded.synchronize({
            clientId: 'browser-b',
            knownWorkspaceRevision: null,
            localWorkspace: { defaultDiagramId: '', diagrams: [] },
            changes: [],
        });

        expect(Object.keys(response.workspace.diagrams)).toEqual(['a', 'b']);
    });

    it('creates a backup before replacing a valid workspace', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'chartdb-sync-'));
        const filePath = join(directory, 'workspace.json');
        const store = new WorkspaceStore(filePath);
        await store.initialize();
        await store.synchronize(initializeRequest([diagram('a')]));
        await store.synchronize({
            clientId: 'browser-a',
            knownWorkspaceRevision: 1,
            changes: [
                {
                    type: 'upsert',
                    diagramId: 'a',
                    baseRevision: 1,
                    data: diagram('a', 'changed'),
                },
            ],
        });

        const backup = JSON.parse(await readFile(`${filePath}.bak`, 'utf8'));
        const current = JSON.parse(await readFile(filePath, 'utf8'));

        expect(backup.diagrams.a.data.name).toBe('a');
        expect(current.diagrams.a.data.name).toBe('changed');
    });

    it('serves a valid backup read-only and restores it explicitly', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'chartdb-sync-'));
        const filePath = join(directory, 'workspace.json');
        const store = new WorkspaceStore(filePath);
        await store.initialize();
        await store.synchronize(initializeRequest([diagram('a')]));
        await store.synchronize({
            clientId: 'browser-a',
            knownWorkspaceRevision: 1,
            changes: [
                {
                    type: 'upsert',
                    diagramId: 'a',
                    baseRevision: 1,
                    data: diagram('a', 'changed'),
                },
            ],
        });
        await writeFile(filePath, '{invalid json');

        const recovered = new WorkspaceStore(filePath);
        await recovered.initialize();
        const response = await recovered.synchronize({
            clientId: 'browser-b',
            knownWorkspaceRevision: 1,
            changes: [],
        });

        expect(response.status).toBe('recovered');
        expect(response.workspace.diagrams.a.data.name).toBe('a');

        await recovered.recover();
        const files = await readdir(directory);
        const current = JSON.parse(await readFile(filePath, 'utf8'));

        expect(
            files.some((file) => file.startsWith('workspace.json.corrupt-'))
        ).toBe(true);
        expect(current.diagrams.a.data.name).toBe('a');
        expect(recovered.getStatus().recovered).toBe(false);
    });

    it('refuses writes when both the workspace and backup are invalid', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'chartdb-sync-'));
        const filePath = join(directory, 'workspace.json');
        await writeFile(filePath, '{invalid json');
        await writeFile(`${filePath}.bak`, '{also invalid');

        const store = new WorkspaceStore(filePath);
        await store.initialize();

        await expect(
            store.synchronize(initializeRequest([diagram('a')]))
        ).rejects.toThrow('could not be loaded');
    });
});
