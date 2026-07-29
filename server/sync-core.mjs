import { createHash } from 'node:crypto';

export const stableStringify = (value) =>
    JSON.stringify(sortForSerialization(value));

const sortForSerialization = (value) => {
    if (Array.isArray(value)) {
        return value.map(sortForSerialization);
    }

    if (value && typeof value === 'object') {
        return Object.keys(value)
            .sort()
            .reduce((result, key) => {
                result[key] = sortForSerialization(value[key]);
                return result;
            }, {});
    }

    return value;
};

export const hashDiagram = (diagram) =>
    `sha256:${createHash('sha256')
        .update(stableStringify(diagram))
        .digest('hex')}`;

const nextDiagramRevision = (workspace, diagramId) =>
    Math.max(
        workspace.diagrams[diagramId]?.revision ?? 0,
        workspace.tombstones[diagramId]?.revision ?? 0
    ) + 1;

const buildDiagramEntry = (data, revision, now) => ({
    revision,
    updatedAt: now,
    hash: hashDiagram(data),
    data,
});

export const createWorkspace = ({
    diagrams,
    defaultDiagramId = '',
    now = new Date().toISOString(),
    workspaceRevision = 1,
}) => {
    const diagramEntries = Object.fromEntries(
        diagrams.map((diagram) => [
            diagram.id,
            buildDiagramEntry(diagram, 1, now),
        ])
    );

    return {
        schemaVersion: 1,
        workspaceRevision,
        updatedAt: now,
        config: {
            revision: 1,
            defaultDiagramId: chooseDefaultDiagramId(
                diagramEntries,
                defaultDiagramId
            ),
        },
        diagrams: diagramEntries,
        tombstones: {},
    };
};

const chooseDefaultDiagramId = (diagrams, requestedId) => {
    if (requestedId && diagrams[requestedId]) {
        return requestedId;
    }

    return (
        Object.values(diagrams)
            .sort(
                (a, b) =>
                    Date.parse(a.data.createdAt) -
                        Date.parse(b.data.createdAt) ||
                    a.data.id.localeCompare(b.data.id)
            )
            .at(0)?.data.id ?? ''
    );
};

const localMatchesServer = (workspace, diagrams) => {
    if (diagrams.length !== Object.keys(workspace.diagrams).length) {
        return false;
    }

    return diagrams.every(
        (diagram) =>
            workspace.diagrams[diagram.id]?.hash === hashDiagram(diagram)
    );
};

const replaceWorkspace = (workspace, localWorkspace, now) => {
    const next = structuredClone(workspace);
    const localIds = new Set(
        localWorkspace.diagrams.map((diagram) => diagram.id)
    );

    for (const diagramId of Object.keys(next.diagrams)) {
        if (!localIds.has(diagramId)) {
            const revision = nextDiagramRevision(next, diagramId);
            delete next.diagrams[diagramId];
            next.tombstones[diagramId] = {
                revision,
                deletedAt: now,
            };
        }
    }

    for (const diagram of localWorkspace.diagrams) {
        const revision = nextDiagramRevision(next, diagram.id);
        next.diagrams[diagram.id] = buildDiagramEntry(diagram, revision, now);
        delete next.tombstones[diagram.id];
    }

    next.config = {
        revision: next.config.revision + 1,
        defaultDiagramId: chooseDefaultDiagramId(
            next.diagrams,
            localWorkspace.defaultDiagramId
        ),
    };
    next.workspaceRevision += 1;
    next.updatedAt = now;

    return next;
};

const conflictFor = (change, serverDiagram, tombstone) => ({
    diagramId: change.diagramId,
    localType: change.type,
    serverRevision: serverDiagram?.revision ?? tombstone?.revision ?? null,
    serverDiagram: serverDiagram?.data ?? null,
    deletedOnServer: Boolean(tombstone),
});

const applyUpsert = (workspace, change, now) => {
    const serverDiagram = workspace.diagrams[change.diagramId];
    const tombstone = workspace.tombstones[change.diagramId];
    const incomingHash = hashDiagram(change.data);

    if (serverDiagram?.hash === incomingHash) {
        return { changed: false };
    }

    if (!serverDiagram && !tombstone && change.baseRevision === null) {
        workspace.diagrams[change.diagramId] = buildDiagramEntry(
            change.data,
            1,
            now
        );
        return { changed: true };
    }

    const serverRevision = serverDiagram?.revision ?? tombstone?.revision;
    if (change.baseRevision !== serverRevision) {
        return {
            changed: false,
            conflict: conflictFor(change, serverDiagram, tombstone),
        };
    }

    const revision = nextDiagramRevision(workspace, change.diagramId);
    workspace.diagrams[change.diagramId] = buildDiagramEntry(
        change.data,
        revision,
        now
    );
    delete workspace.tombstones[change.diagramId];

    return { changed: true };
};

const applyDelete = (workspace, change, now) => {
    const serverDiagram = workspace.diagrams[change.diagramId];
    const tombstone = workspace.tombstones[change.diagramId];

    if (tombstone || !serverDiagram) {
        return { changed: false };
    }

    if (change.baseRevision !== serverDiagram.revision) {
        return {
            changed: false,
            conflict: conflictFor(change, serverDiagram, tombstone),
        };
    }

    const revision = nextDiagramRevision(workspace, change.diagramId);
    delete workspace.diagrams[change.diagramId];
    workspace.tombstones[change.diagramId] = {
        revision,
        deletedAt: now,
    };

    return { changed: true };
};

const applyChanges = (workspace, request, now) => {
    let changed = false;
    const conflicts = [];

    for (const change of request.changes ?? []) {
        const result =
            change.type === 'upsert'
                ? applyUpsert(workspace, change, now)
                : applyDelete(workspace, change, now);

        changed ||= result.changed;
        if (result.conflict) {
            conflicts.push(result.conflict);
        }
    }

    const configChange = request.configChange;
    if (
        configChange &&
        configChange.baseRevision === workspace.config.revision &&
        configChange.defaultDiagramId !== workspace.config.defaultDiagramId
    ) {
        workspace.config = {
            revision: workspace.config.revision + 1,
            defaultDiagramId: chooseDefaultDiagramId(
                workspace.diagrams,
                configChange.defaultDiagramId
            ),
        };
        changed = true;
    }

    if (
        !workspace.diagrams[workspace.config.defaultDiagramId] &&
        workspace.config.defaultDiagramId !== ''
    ) {
        workspace.config = {
            revision: workspace.config.revision + 1,
            defaultDiagramId: chooseDefaultDiagramId(workspace.diagrams, ''),
        };
        changed = true;
    }

    return { changed, conflicts };
};

export const synchronizeWorkspace = ({
    workspace,
    request,
    now = new Date().toISOString(),
}) => {
    const localWorkspace = request.localWorkspace ?? {
        diagrams: [],
        defaultDiagramId: '',
    };

    if (!workspace) {
        if (localWorkspace.diagrams.length === 0) {
            return {
                changed: false,
                workspace: null,
                response: {
                    status: 'uninitialized',
                    workspace: null,
                    conflicts: [],
                },
            };
        }

        const initialized = createWorkspace({
            diagrams: localWorkspace.diagrams,
            defaultDiagramId: localWorkspace.defaultDiagramId,
            now,
        });
        return {
            changed: true,
            workspace: initialized,
            response: {
                status: 'ok',
                workspace: initialized,
                conflicts: [],
            },
        };
    }

    if (request.knownWorkspaceRevision === null) {
        if (request.initialResolution === 'use-browser') {
            const replaced = replaceWorkspace(workspace, localWorkspace, now);
            return {
                changed: true,
                workspace: replaced,
                response: {
                    status: 'ok',
                    workspace: replaced,
                    conflicts: [],
                },
            };
        }

        if (
            request.initialResolution === 'use-server' ||
            localWorkspace.diagrams.length === 0 ||
            localMatchesServer(workspace, localWorkspace.diagrams)
        ) {
            return {
                changed: false,
                workspace,
                response: {
                    status: 'ok',
                    workspace,
                    conflicts: [],
                },
            };
        }

        return {
            changed: false,
            workspace,
            response: {
                status: 'initial-conflict',
                workspace,
                conflicts: [],
            },
        };
    }

    const next = structuredClone(workspace);
    const { changed, conflicts } = applyChanges(next, request, now);

    if (changed) {
        next.workspaceRevision += 1;
        next.updatedAt = now;
    }

    const responseWorkspace =
        changed ||
        conflicts.length > 0 ||
        request.knownWorkspaceRevision !== next.workspaceRevision
            ? next
            : null;

    return {
        changed,
        workspace: changed ? next : workspace,
        response: {
            status: 'ok',
            workspace: responseWorkspace,
            conflicts,
        },
    };
};
