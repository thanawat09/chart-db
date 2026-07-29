import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseType } from '@/lib/domain/database-type';
import type { Diagram } from '@/lib/domain/diagram';
import {
    buildSyncRequest,
    createSyncMetadata,
    deserializeDiagram,
    hashSerializedDiagram,
    metadataFromWorkspace,
    serializeDiagram,
} from '../sync-utils';
import type { ServerWorkspace } from '../sync-types';

const diagram = (id: string, name = id): Diagram => ({
    id,
    name,
    databaseType: DatabaseType.POSTGRESQL,
    tables: [],
    relationships: [],
    createdAt: new Date('2026-07-29T10:00:00.000Z'),
    updatedAt: new Date('2026-07-29T10:00:00.000Z'),
});

beforeAll(() => {
    vi.stubGlobal('crypto', webcrypto);
});

describe('sync utils', () => {
    it('serializes and restores diagram dates without changing IDs', () => {
        const original = diagram('diagram-a');
        const serialized = serializeDiagram(original);
        const restored = deserializeDiagram(serialized);

        expect(serialized.id).toBe('diagram-a');
        expect(serialized.createdAt).toBe('2026-07-29T10:00:00.000Z');
        expect(restored.createdAt).toBeInstanceOf(Date);
    });

    it('uses the same deterministic hash as the Node service', async () => {
        expect(
            await hashSerializedDiagram(serializeDiagram(diagram('a')))
        ).toBe(
            'sha256:f41bde526cd2420ed6bb7570f5567e113b9448d1ee9fcf2ea4ddfdf4fb0bc1e2'
        );
    });

    it('sends only new, changed, or deleted diagrams after initialization', async () => {
        const unchanged = serializeDiagram(diagram('a'));
        const metadata = createSyncMetadata('browser-a');
        metadata.workspaceRevision = 1;
        metadata.configRevision = 1;
        metadata.defaultDiagramId = 'a';
        metadata.diagrams = {
            a: {
                revision: 1,
                hash: await hashSerializedDiagram(unchanged),
                deleted: false,
            },
            deleted: {
                revision: 2,
                hash: 'sha256:old',
                deleted: false,
            },
        };

        const { request } = await buildSyncRequest({
            metadata,
            diagrams: [diagram('a'), diagram('b')],
            defaultDiagramId: 'a',
        });

        expect(request.changes).toEqual([
            expect.objectContaining({
                type: 'upsert',
                diagramId: 'b',
                baseRevision: null,
            }),
            {
                type: 'delete',
                diagramId: 'deleted',
                baseRevision: 2,
            },
        ]);
    });

    it('preserves old metadata only for a conflicted diagram', () => {
        const metadata = createSyncMetadata('browser-a');
        metadata.diagrams = {
            a: { revision: 1, hash: 'sha256:local', deleted: false },
            stale: { revision: 1, hash: 'sha256:stale', deleted: false },
        };
        const serverDiagram = serializeDiagram(diagram('a', 'server'));
        const workspace: ServerWorkspace = {
            schemaVersion: 1,
            workspaceRevision: 3,
            updatedAt: '2026-07-29T10:00:00.000Z',
            config: { revision: 1, defaultDiagramId: 'a' },
            diagrams: {
                a: {
                    revision: 2,
                    updatedAt: '2026-07-29T10:00:00.000Z',
                    hash: 'sha256:server',
                    data: serverDiagram,
                },
            },
            tombstones: {},
        };

        const result = metadataFromWorkspace(
            workspace,
            metadata,
            new Set(['a'])
        );

        expect(result.diagrams).toEqual({
            a: { revision: 1, hash: 'sha256:local', deleted: false },
        });
    });
});
