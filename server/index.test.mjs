// @vitest-environment node

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startServer } from './index.mjs';

const runningServers = [];

afterEach(async () => {
    while (runningServers.length > 0) {
        await runningServers.pop().close();
    }
});

const diagram = (id, name = id) => ({
    id,
    name,
    databaseType: 'postgresql',
    tables: [],
    relationships: [],
    createdAt: '2026-07-29T10:00:00.000Z',
    updatedAt: '2026-07-29T10:00:00.000Z',
});

const logIn = async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/sync/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'secret' }),
    });
    expect(response.status).toBe(200);
    return response.json();
};

const sync = async (baseUrl, token, body) => {
    const response = await fetch(`${baseUrl}/api/sync`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    return response.json();
};

const startTestServer = async (filePath) => {
    const running = await startServer({
        development: false,
        config: {
            password: 'secret',
            intervalMs: 1_234,
            filePath,
            host: '127.0.0.1',
            port: 0,
        },
    });
    runningServers.push(running);
    const address = running.server.address();
    return {
        running,
        baseUrl: `http://127.0.0.1:${address.port}`,
    };
};

describe('sync HTTP service', () => {
    it('authenticates and persists multiple diagrams through the API', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'chartdb-http-'));
        const { baseUrl } = await startTestServer(
            join(directory, 'workspace.json')
        );

        const unauthorized = await fetch(`${baseUrl}/api/sync`, {
            method: 'POST',
            body: '{}',
        });
        expect(unauthorized.status).toBe(401);

        const session = await logIn(baseUrl);
        expect(session.intervalMs).toBe(1_234);

        const result = await sync(baseUrl, session.token, {
            clientId: 'browser-a',
            knownWorkspaceRevision: null,
            localWorkspace: {
                defaultDiagramId: 'a',
                diagrams: [diagram('a', 'A'), diagram('b', 'B')],
            },
            changes: [],
        });

        expect(Object.keys(result.workspace.diagrams)).toEqual(['a', 'b']);
    });

    it('syncs two browsers and retains merged data after a restart', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'chartdb-restart-'));
        const filePath = join(directory, 'workspace.json');
        const firstServer = await startTestServer(filePath);
        const sessionA = await logIn(firstServer.baseUrl);
        const sessionB = await logIn(firstServer.baseUrl);

        const initialized = await sync(firstServer.baseUrl, sessionA.token, {
            clientId: 'browser-a',
            knownWorkspaceRevision: null,
            localWorkspace: {
                defaultDiagramId: 'a',
                diagrams: [diagram('a'), diagram('b')],
            },
            changes: [],
        });
        const importedByB = await sync(firstServer.baseUrl, sessionB.token, {
            clientId: 'browser-b',
            knownWorkspaceRevision: null,
            localWorkspace: {
                defaultDiagramId: '',
                diagrams: [],
            },
            changes: [],
        });
        expect(importedByB.workspace.workspaceRevision).toBe(
            initialized.workspace.workspaceRevision
        );

        const editedByA = await sync(firstServer.baseUrl, sessionA.token, {
            clientId: 'browser-a',
            knownWorkspaceRevision: 1,
            changes: [
                {
                    type: 'upsert',
                    diagramId: 'a',
                    baseRevision: 1,
                    data: diagram('a', 'A from browser A'),
                },
            ],
        });
        const editedByB = await sync(firstServer.baseUrl, sessionB.token, {
            clientId: 'browser-b',
            knownWorkspaceRevision: 1,
            changes: [
                {
                    type: 'upsert',
                    diagramId: 'b',
                    baseRevision: 1,
                    data: diagram('b', 'B from browser B'),
                },
            ],
        });
        expect(editedByB.conflicts).toEqual([]);
        expect(editedByB.workspace.diagrams.a.data.name).toBe(
            'A from browser A'
        );
        expect(editedByB.workspace.diagrams.b.data.name).toBe(
            'B from browser B'
        );

        const conflict = await sync(firstServer.baseUrl, sessionB.token, {
            clientId: 'browser-b',
            knownWorkspaceRevision: 1,
            changes: [
                {
                    type: 'upsert',
                    diagramId: 'a',
                    baseRevision: 1,
                    data: diagram('a', 'Stale browser B edit'),
                },
            ],
        });
        expect(conflict.conflicts).toHaveLength(1);
        expect(conflict.workspace.diagrams.a.data.name).toBe(
            'A from browser A'
        );

        const deletedByA = await sync(firstServer.baseUrl, sessionA.token, {
            clientId: 'browser-a',
            knownWorkspaceRevision: editedByA.workspace.workspaceRevision,
            changes: [
                {
                    type: 'delete',
                    diagramId: 'a',
                    baseRevision: 2,
                },
            ],
        });
        expect(deletedByA.workspace.diagrams.a).toBeUndefined();
        expect(deletedByA.workspace.tombstones.a.revision).toBe(3);

        await firstServer.running.close();
        runningServers.splice(runningServers.indexOf(firstServer.running), 1);

        const restartedServer = await startTestServer(filePath);
        const restartedSession = await logIn(restartedServer.baseUrl);
        const afterRestart = await sync(
            restartedServer.baseUrl,
            restartedSession.token,
            {
                clientId: 'browser-c',
                knownWorkspaceRevision: null,
                localWorkspace: {
                    defaultDiagramId: '',
                    diagrams: [],
                },
                changes: [],
            }
        );

        expect(afterRestart.workspace.diagrams.a).toBeUndefined();
        expect(afterRestart.workspace.diagrams.b.data.name).toBe(
            'B from browser B'
        );
        expect(afterRestart.workspace.tombstones.a.revision).toBe(3);
    });
});
