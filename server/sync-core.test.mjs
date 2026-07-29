import { describe, expect, it } from 'vitest';
import {
    createWorkspace,
    hashDiagram,
    synchronizeWorkspace,
} from './sync-core.mjs';

const NOW = '2026-07-29T10:00:00.000Z';
const LATER = '2026-07-29T10:00:10.000Z';

const diagram = (id, name = id) => ({
    id,
    name,
    databaseType: 'postgresql',
    tables: [],
    relationships: [],
    createdAt: NOW,
    updatedAt: NOW,
});

describe('workspace synchronization', () => {
    it('initializes an empty server with multiple browser diagrams', () => {
        const result = synchronizeWorkspace({
            workspace: null,
            request: {
                knownWorkspaceRevision: null,
                localWorkspace: {
                    defaultDiagramId: 'a',
                    diagrams: [diagram('a'), diagram('b')],
                },
            },
            now: NOW,
        });

        expect(result.changed).toBe(true);
        expect(Object.keys(result.workspace.diagrams)).toEqual(['a', 'b']);
        expect(result.workspace.config.defaultDiagramId).toBe('a');
    });

    it('does not initialize a server from an empty browser', () => {
        const result = synchronizeWorkspace({
            workspace: null,
            request: {
                knownWorkspaceRevision: null,
                localWorkspace: {
                    defaultDiagramId: '',
                    diagrams: [],
                },
            },
            now: NOW,
        });

        expect(result.changed).toBe(false);
        expect(result.response.status).toBe('uninitialized');
    });

    it('merges changes to different diagrams', () => {
        const workspace = createWorkspace({
            diagrams: [diagram('a'), diagram('b')],
            now: NOW,
        });

        const first = synchronizeWorkspace({
            workspace,
            request: {
                knownWorkspaceRevision: 1,
                changes: [
                    {
                        type: 'upsert',
                        diagramId: 'a',
                        baseRevision: 1,
                        data: diagram('a', 'A changed'),
                    },
                ],
            },
            now: LATER,
        });
        const second = synchronizeWorkspace({
            workspace: first.workspace,
            request: {
                knownWorkspaceRevision: 1,
                changes: [
                    {
                        type: 'upsert',
                        diagramId: 'b',
                        baseRevision: 1,
                        data: diagram('b', 'B changed'),
                    },
                ],
            },
            now: LATER,
        });

        expect(second.response.conflicts).toEqual([]);
        expect(second.workspace.diagrams.a.data.name).toBe('A changed');
        expect(second.workspace.diagrams.b.data.name).toBe('B changed');
    });

    it('returns a conflict when the same diagram changed from a stale base', () => {
        const workspace = createWorkspace({
            diagrams: [diagram('a')],
            now: NOW,
        });
        const first = synchronizeWorkspace({
            workspace,
            request: {
                knownWorkspaceRevision: 1,
                changes: [
                    {
                        type: 'upsert',
                        diagramId: 'a',
                        baseRevision: 1,
                        data: diagram('a', 'Browser A'),
                    },
                ],
            },
            now: LATER,
        });
        const second = synchronizeWorkspace({
            workspace: first.workspace,
            request: {
                knownWorkspaceRevision: 1,
                changes: [
                    {
                        type: 'upsert',
                        diagramId: 'a',
                        baseRevision: 1,
                        data: diagram('a', 'Browser B'),
                    },
                ],
            },
            now: LATER,
        });

        expect(second.changed).toBe(false);
        expect(second.response.conflicts).toHaveLength(1);
        expect(second.workspace.diagrams.a.data.name).toBe('Browser A');
    });

    it('propagates deletion with a tombstone and conflicts with a stale edit', () => {
        const workspace = createWorkspace({
            diagrams: [diagram('a')],
            now: NOW,
        });
        const deleted = synchronizeWorkspace({
            workspace,
            request: {
                knownWorkspaceRevision: 1,
                changes: [
                    {
                        type: 'delete',
                        diagramId: 'a',
                        baseRevision: 1,
                    },
                ],
            },
            now: LATER,
        });
        const staleEdit = synchronizeWorkspace({
            workspace: deleted.workspace,
            request: {
                knownWorkspaceRevision: 1,
                changes: [
                    {
                        type: 'upsert',
                        diagramId: 'a',
                        baseRevision: 1,
                        data: diagram('a', 'Offline edit'),
                    },
                ],
            },
            now: LATER,
        });

        expect(deleted.workspace.diagrams.a).toBeUndefined();
        expect(deleted.workspace.tombstones.a.revision).toBe(2);
        expect(staleEdit.response.conflicts[0].deletedOnServer).toBe(true);
    });

    it('requires a choice when unrelated browser and server data first meet', () => {
        const workspace = createWorkspace({
            diagrams: [diagram('server')],
            now: NOW,
        });
        const conflict = synchronizeWorkspace({
            workspace,
            request: {
                knownWorkspaceRevision: null,
                localWorkspace: {
                    defaultDiagramId: 'browser',
                    diagrams: [diagram('browser')],
                },
            },
            now: LATER,
        });
        const resolved = synchronizeWorkspace({
            workspace,
            request: {
                knownWorkspaceRevision: null,
                initialResolution: 'use-browser',
                localWorkspace: {
                    defaultDiagramId: 'browser',
                    diagrams: [diagram('browser')],
                },
            },
            now: LATER,
        });

        expect(conflict.response.status).toBe('initial-conflict');
        expect(Object.keys(resolved.workspace.diagrams)).toEqual(['browser']);
        expect(resolved.workspace.tombstones.server).toBeDefined();
    });

    it('acknowledges identical content even when the base revision is stale', () => {
        const workspace = createWorkspace({
            diagrams: [diagram('a')],
            now: NOW,
        });
        const result = synchronizeWorkspace({
            workspace,
            request: {
                knownWorkspaceRevision: 0,
                changes: [
                    {
                        type: 'upsert',
                        diagramId: 'a',
                        baseRevision: 0,
                        data: diagram('a'),
                    },
                ],
            },
            now: LATER,
        });

        expect(result.response.conflicts).toEqual([]);
        expect(result.workspace.diagrams.a.hash).toBe(
            hashDiagram(diagram('a'))
        );
    });
});
