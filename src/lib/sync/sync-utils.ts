import { diagramSchema, type Diagram } from '@/lib/domain/diagram';
import { sha256 } from '@/lib/utils/utils';
import type {
    SerializedDiagram,
    ServerWorkspace,
    SyncChange,
    SyncMetadata,
} from './sync-types';

const sortForSerialization = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(sortForSerialization);
    }

    if (value && typeof value === 'object') {
        return Object.keys(value)
            .sort()
            .reduce<Record<string, unknown>>((result, key) => {
                result[key] = sortForSerialization(
                    (value as Record<string, unknown>)[key]
                );
                return result;
            }, {});
    }

    return value;
};

export const serializeDiagram = (diagram: Diagram): SerializedDiagram =>
    JSON.parse(JSON.stringify(diagram)) as SerializedDiagram;

export const deserializeDiagram = (diagram: SerializedDiagram): Diagram =>
    diagramSchema.parse({
        ...diagram,
        createdAt: new Date(diagram.createdAt),
        updatedAt: new Date(diagram.updatedAt),
    });

export const hashSerializedDiagram = async (
    diagram: SerializedDiagram
): Promise<string> => {
    const serialized = JSON.stringify(sortForSerialization(diagram)); const hash = await sha256(serialized);
    return `sha256:${hash}`;
};

export const metadataFromWorkspace = (
    workspace: ServerWorkspace,
    previous: SyncMetadata,
    excludedDiagramIds: Set<string> = new Set()
): SyncMetadata => {
    const diagrams: SyncMetadata['diagrams'] = {};

    for (const [diagramId, entry] of Object.entries(workspace.diagrams)) {
        if (!excludedDiagramIds.has(diagramId)) {
            diagrams[diagramId] = {
                revision: entry.revision,
                hash: entry.hash,
                deleted: false,
            };
        }
    }

    for (const [diagramId, tombstone] of Object.entries(workspace.tombstones)) {
        if (!excludedDiagramIds.has(diagramId)) {
            diagrams[diagramId] = {
                revision: tombstone.revision,
                hash: null,
                deleted: true,
            };
        }
    }

    for (const diagramId of excludedDiagramIds) {
        if (previous.diagrams[diagramId]) {
            diagrams[diagramId] = previous.diagrams[diagramId];
        }
    }

    return {
        ...previous,
        workspaceRevision: workspace.workspaceRevision,
        configRevision: workspace.config.revision,
        defaultDiagramId: workspace.config.defaultDiagramId,
        diagrams,
    };
};

export const createSyncMetadata = (clientId: string): SyncMetadata => ({
    id: 1,
    clientId,
    workspaceRevision: null,
    configRevision: null,
    defaultDiagramId: '',
    diagrams: {},
});

export const buildSyncRequest = async ({
    metadata,
    diagrams,
    defaultDiagramId,
    initialResolution,
}: {
    metadata: SyncMetadata;
    diagrams: Diagram[];
    defaultDiagramId: string;
    initialResolution?: 'use-server' | 'use-browser';
}) => {
    const serializedDiagrams = diagrams.map(serializeDiagram);
    const hashes = new Map(
        await Promise.all(
            serializedDiagrams.map(
                async (diagram) =>
                    [diagram.id, await hashSerializedDiagram(diagram)] as const
            )
        )
    );
    const serializedById = new Map(
        serializedDiagrams.map((diagram) => [diagram.id, diagram])
    );
    const changes: SyncChange[] = [];

    if (metadata.workspaceRevision !== null) {
        for (const diagram of serializedDiagrams) {
            const state = metadata.diagrams[diagram.id];
            if (
                !state ||
                state.deleted ||
                state.hash !== hashes.get(diagram.id)
            ) {
                changes.push({
                    type: 'upsert',
                    diagramId: diagram.id,
                    baseRevision: state?.revision ?? null,
                    data: diagram,
                });
            }
        }

        for (const [diagramId, state] of Object.entries(metadata.diagrams)) {
            if (!state.deleted && !serializedById.has(diagramId)) {
                changes.push({
                    type: 'delete',
                    diagramId,
                    baseRevision: state.revision,
                });
            }
        }
    }

    return {
        request: {
            clientId: metadata.clientId,
            knownWorkspaceRevision: metadata.workspaceRevision,
            knownConfigRevision: metadata.configRevision,
            ...(metadata.workspaceRevision === null
                ? {
                      localWorkspace: {
                          defaultDiagramId,
                          diagrams: serializedDiagrams,
                      },
                  }
                : {}),
            ...(initialResolution ? { initialResolution } : {}),
            changes,
            ...(metadata.workspaceRevision !== null &&
            metadata.configRevision !== null &&
            metadata.defaultDiagramId !== defaultDiagramId
                ? {
                      configChange: {
                          baseRevision: metadata.configRevision,
                          defaultDiagramId,
                      },
                  }
                : {}),
        },
        hashes,
        serializedById,
    };
};
