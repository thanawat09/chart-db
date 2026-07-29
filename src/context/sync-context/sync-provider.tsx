import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { syncContext, type SyncStatus } from './sync-context';
import { useStorage } from '@/hooks/use-storage';
import { useChartDB } from '@/hooks/use-chartdb';
import { useConfig } from '@/hooks/use-config';
import {
    createSyncSession,
    recoverWorkspace,
    SyncApiError,
    synchronize,
} from '@/lib/sync/sync-client';
import {
    buildSyncRequest,
    createSyncMetadata,
    deserializeDiagram,
    hashSerializedDiagram,
    metadataFromWorkspace,
    serializeDiagram,
} from '@/lib/sync/sync-utils';
import type {
    DiagramConflict,
    ServerWorkspace,
    SyncMetadata,
} from '@/lib/sync/sync-types';
import type { Diagram } from '@/lib/domain/diagram';
import { cloneDiagram } from '@/lib/clone';
import { SyncAuthScreen } from './sync-auth-screen';
import {
    DiagramSyncConflictDialog,
    InitialSyncConflictDialog,
} from './sync-dialogs';

const SESSION_TOKEN_KEY = 'chartdb-sync-session';
const fullDiagramOptions = {
    includeTables: true,
    includeRelationships: true,
    includeDependencies: true,
    includeAreas: true,
    includeCustomTypes: true,
    includeNotes: true,
};

type SyncResult = 'ready' | 'initial-conflict' | 'failed';

export const SyncProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const storage = useStorage();
    const { currentDiagram, loadDiagram } = useChartDB();
    const { updateConfig } = useConfig();
    const navigate = useNavigate();
    const [authenticated, setAuthenticated] = useState(false);
    const [authenticating, setAuthenticating] = useState(false);
    const [status, setStatus] = useState<SyncStatus>('locked');
    const [error, setError] = useState<string | null>(null);
    const [intervalMs, setIntervalMs] = useState(10_000);
    const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
    const [conflicts, setConflicts] = useState<DiagramConflict[]>([]);
    const [initialConflictWorkspace, setInitialConflictWorkspace] =
        useState<ServerWorkspace | null>(null);
    const [conflictWorkspace, setConflictWorkspace] =
        useState<ServerWorkspace | null>(null);
    const tokenRef = useRef<string | null>(null);
    const syncPromiseRef = useRef<Promise<void> | null>(null);
    const syncAgainRef = useRef(false);
    const restoredSessionRef = useRef(false);
    const syncedUpdatedAtRef = useRef<Record<string, string>>({});

    const ensureMetadata = useCallback(async (): Promise<SyncMetadata> => {
        const existing = await storage.getSyncMetadata();
        if (existing) {
            return existing;
        }

        const created = createSyncMetadata(crypto.randomUUID());
        await storage.updateSyncMetadata(created);
        return created;
    }, [storage]);

    const listLocalDiagrams = useCallback(
        async () => await storage.listDiagrams(fullDiagramOptions),
        [storage]
    );

    const applyServerWorkspace = useCallback(
        async ({
            workspace,
            metadata,
            localDiagrams,
            excludedDiagramIds,
        }: {
            workspace: ServerWorkspace;
            metadata: SyncMetadata;
            localDiagrams: Diagram[];
            excludedDiagramIds: Set<string>;
        }) => {
            const localById = new Map(
                localDiagrams.map((diagram) => [diagram.id, diagram])
            );
            const localHashes = new Map(
                await Promise.all(
                    localDiagrams.map(
                        async (diagram) =>
                            [
                                diagram.id,
                                await hashSerializedDiagram(
                                    serializeDiagram(diagram)
                                ),
                            ] as const
                    )
                )
            );
            const diagramsToApply: Diagram[] = [];
            const deletedDiagramIds = new Set<string>();

            for (const [diagramId, entry] of Object.entries(
                workspace.diagrams
            )) {
                if (excludedDiagramIds.has(diagramId)) {
                    continue;
                }

                if (
                    metadata.diagrams[diagramId]?.hash !== entry.hash ||
                    localHashes.get(diagramId) !== entry.hash
                ) {
                    diagramsToApply.push(deserializeDiagram(entry.data));
                }
            }

            for (const diagramId of Object.keys(workspace.tombstones)) {
                if (
                    !excludedDiagramIds.has(diagramId) &&
                    localById.has(diagramId)
                ) {
                    deletedDiagramIds.add(diagramId);
                }
            }

            if (metadata.workspaceRevision === null) {
                for (const diagramId of localById.keys()) {
                    if (
                        !workspace.diagrams[diagramId] &&
                        !excludedDiagramIds.has(diagramId)
                    ) {
                        deletedDiagramIds.add(diagramId);
                    }
                }
            }

            const nextMetadata = metadataFromWorkspace(
                workspace,
                metadata,
                excludedDiagramIds
            );
            await storage.applyWorkspaceSync({
                diagrams: diagramsToApply,
                deletedDiagramIds: [...deletedDiagramIds],
                defaultDiagramId: workspace.config.defaultDiagramId,
                metadata: nextMetadata,
            });
            await updateConfig({
                config: {
                    defaultDiagramId: workspace.config.defaultDiagramId,
                },
            });

            syncedUpdatedAtRef.current = Object.fromEntries(
                Object.entries(workspace.diagrams).map(([diagramId, entry]) => [
                    diagramId,
                    entry.data.updatedAt,
                ])
            );

            if (deletedDiagramIds.has(currentDiagram.id)) {
                navigate(
                    workspace.config.defaultDiagramId
                        ? `/diagrams/${workspace.config.defaultDiagramId}`
                        : '/'
                );
            } else if (
                diagramsToApply.some(
                    (diagram) => diagram.id === currentDiagram.id
                )
            ) {
                await loadDiagram(currentDiagram.id);
            }

            return nextMetadata;
        },
        [currentDiagram.id, loadDiagram, navigate, storage, updateConfig]
    );

    const lockSession = useCallback((message?: string) => {
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
        tokenRef.current = null;
        setAuthenticated(false);
        setStatus('locked');
        setError(message ?? null);
    }, []);

    const performSync = useCallback(
        async (
            accessToken: string,
            initialResolution?: 'use-server' | 'use-browser'
        ): Promise<SyncResult> => {
            setStatus('syncing');
            setError(null);

            try {
                const metadata = await ensureMetadata();
                const [localDiagrams, storedConfig] = await Promise.all([
                    listLocalDiagrams(),
                    storage.getConfig(),
                ]);
                const { request } = await buildSyncRequest({
                    metadata,
                    diagrams: localDiagrams,
                    defaultDiagramId: storedConfig?.defaultDiagramId ?? '',
                    initialResolution,
                });
                const response = await synchronize(accessToken, request);
                setIntervalMs(response.intervalMs);

                if (
                    response.status === 'initial-conflict' &&
                    response.workspace
                ) {
                    setInitialConflictWorkspace(response.workspace);
                    setConflictWorkspace(response.workspace);
                    setStatus('conflict');
                    return 'initial-conflict';
                }

                if (response.workspace) {
                    const excludedDiagramIds = new Set(
                        response.conflicts.map((conflict) => conflict.diagramId)
                    );
                    await applyServerWorkspace({
                        workspace: response.workspace,
                        metadata,
                        localDiagrams,
                        excludedDiagramIds,
                    });
                    setConflictWorkspace(response.workspace);
                }

                setConflicts(response.conflicts);
                setLastSyncedAt(new Date(response.serverTime));
                setStatus(
                    response.status === 'recovered'
                        ? 'recovered'
                        : response.conflicts.length > 0
                          ? 'conflict'
                          : 'saved'
                );
                return 'ready';
            } catch (syncError) {
                if (syncError instanceof SyncApiError) {
                    if (syncError.status === 401) {
                        lockSession('Your sync session expired.');
                    } else {
                        setStatus('error');
                        setError(syncError.message);
                    }
                } else if (
                    syncError instanceof TypeError &&
                    syncError.message.toLowerCase().includes('fetch')
                ) {
                    setStatus('offline');
                } else {
                    setStatus('error');
                    setError(
                        syncError instanceof Error
                            ? syncError.message
                            : 'Synchronization failed'
                    );
                }
                return 'failed';
            }
        },
        [
            applyServerWorkspace,
            ensureMetadata,
            listLocalDiagrams,
            lockSession,
            storage,
        ]
    );

    const login = useCallback(
        async (password: string) => {
            setAuthenticating(true);
            setError(null);
            try {
                const session = await createSyncSession(password);
                tokenRef.current = session.token;
                sessionStorage.setItem(SESSION_TOKEN_KEY, session.token);
                setIntervalMs(session.intervalMs);
                const result = await performSync(session.token);
                setAuthenticated(result !== 'failed');
            } catch (loginError) {
                setStatus('locked');
                setError(
                    loginError instanceof SyncApiError
                        ? loginError.message
                        : 'The sync service is unavailable'
                );
            } finally {
                setAuthenticating(false);
            }
        },
        [performSync]
    );

    const logout = useCallback(() => lockSession(), [lockSession]);

    const syncNow = useCallback(async () => {
        if (!tokenRef.current) {
            return;
        }

        if (syncPromiseRef.current) {
            syncAgainRef.current = true;
            return syncPromiseRef.current;
        }

        const accessToken = tokenRef.current;
        const running = (async () => {
            do {
                syncAgainRef.current = false;
                await performSync(accessToken);
            } while (syncAgainRef.current && tokenRef.current);
        })();
        syncPromiseRef.current = running.finally(() => {
            syncPromiseRef.current = null;
        });
        return syncPromiseRef.current;
    }, [performSync]);

    const resolveInitialConflict = useCallback(
        async (resolution: 'use-server' | 'use-browser') => {
            if (!tokenRef.current) {
                return;
            }

            setAuthenticating(true);
            const result = await performSync(tokenRef.current, resolution);
            if (result === 'ready') {
                setInitialConflictWorkspace(null);
                setAuthenticated(true);
            }
            setAuthenticating(false);
        },
        [performSync]
    );

    const resolveDiagramConflict = useCallback(
        async (
            diagramId: string,
            resolution: 'keep-both' | 'use-server' | 'use-browser'
        ) => {
            const workspace = conflictWorkspace;
            const conflict = conflicts.find(
                (item) => item.diagramId === diagramId
            );
            if (!workspace || !conflict) {
                return;
            }

            setStatus('syncing');
            const remainingConflicts = conflicts.filter(
                (item) => item.diagramId !== diagramId
            );

            if (resolution === 'use-browser') {
                const metadata = await ensureMetadata();
                const serverDiagram = workspace.diagrams[diagramId];
                const tombstone = workspace.tombstones[diagramId];
                const nextMetadata: SyncMetadata = {
                    ...metadata,
                    workspaceRevision: workspace.workspaceRevision,
                    configRevision: workspace.config.revision,
                    defaultDiagramId: workspace.config.defaultDiagramId,
                    diagrams: {
                        ...metadata.diagrams,
                        [diagramId]: serverDiagram
                            ? {
                                  revision: serverDiagram.revision,
                                  hash: serverDiagram.hash,
                                  deleted: false,
                              }
                            : {
                                  revision: tombstone.revision,
                                  hash: null,
                                  deleted: true,
                              },
                    },
                };
                await storage.updateSyncMetadata(nextMetadata);
                setConflicts(remainingConflicts);
                await syncNow();
                return;
            }

            if (resolution === 'keep-both') {
                const localDiagram = await storage.getDiagram(
                    diagramId,
                    fullDiagramOptions
                );
                if (localDiagram) {
                    const now = new Date();
                    const cloned = cloneDiagram(localDiagram).diagram;
                    cloned.name = `${localDiagram.name} (conflict copy ${now.toLocaleString()})`;
                    cloned.createdAt = now;
                    cloned.updatedAt = now;
                    await storage.addDiagram({ diagram: cloned });
                }
            }

            const metadata = await ensureMetadata();
            const localDiagrams = await listLocalDiagrams();
            await applyServerWorkspace({
                workspace,
                metadata,
                localDiagrams,
                excludedDiagramIds: new Set(
                    remainingConflicts.map((item) => item.diagramId)
                ),
            });
            setConflicts(remainingConflicts);
            setStatus(remainingConflicts.length > 0 ? 'conflict' : 'saved');

            if (resolution === 'keep-both') {
                await syncNow();
            }
        },
        [
            applyServerWorkspace,
            conflictWorkspace,
            conflicts,
            ensureMetadata,
            listLocalDiagrams,
            storage,
            syncNow,
        ]
    );

    const recoverBackup = useCallback(async () => {
        if (!tokenRef.current) {
            return;
        }

        setStatus('syncing');
        try {
            const response = await recoverWorkspace(tokenRef.current);
            const metadata = await ensureMetadata();
            const localDiagrams = await listLocalDiagrams();
            if (response.workspace) {
                await applyServerWorkspace({
                    workspace: response.workspace,
                    metadata,
                    localDiagrams,
                    excludedDiagramIds: new Set(),
                });
            }
            setStatus('saved');
            setLastSyncedAt(new Date(response.serverTime));
        } catch (recoveryError) {
            setStatus('error');
            setError(
                recoveryError instanceof Error
                    ? recoveryError.message
                    : 'Backup recovery failed'
            );
        }
    }, [applyServerWorkspace, ensureMetadata, listLocalDiagrams]);

    useEffect(() => {
        if (restoredSessionRef.current) {
            return;
        }
        restoredSessionRef.current = true;

        const storedToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
        if (!storedToken) {
            return;
        }

        tokenRef.current = storedToken;
        setAuthenticating(true);
        void performSync(storedToken).then((result) => {
            setAuthenticated(result !== 'failed');
            setAuthenticating(false);
        });
    }, [performSync]);

    useEffect(() => {
        if (!authenticated) {
            return;
        }

        const timer = window.setInterval(() => void syncNow(), intervalMs);
        const syncWhenVisible = () => {
            if (document.visibilityState === 'visible') {
                void syncNow();
            }
        };
        document.addEventListener('visibilitychange', syncWhenVisible);
        window.addEventListener('focus', syncWhenVisible);

        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', syncWhenVisible);
            window.removeEventListener('focus', syncWhenVisible);
        };
    }, [authenticated, intervalMs, syncNow]);

    useEffect(() => {
        if (
            !authenticated ||
            !currentDiagram.id ||
            status === 'syncing' ||
            status === 'conflict' ||
            status === 'recovered'
        ) {
            return;
        }

        if (
            syncedUpdatedAtRef.current[currentDiagram.id] !==
            currentDiagram.updatedAt.toISOString()
        ) {
            setStatus('unsynced');
        }
    }, [authenticated, currentDiagram.id, currentDiagram.updatedAt, status]);

    const value = useMemo(
        () => ({
            authenticated,
            authenticating,
            status,
            error,
            intervalMs,
            lastSyncedAt,
            conflicts,
            login,
            logout,
            syncNow,
            resolveInitialConflict,
            resolveDiagramConflict,
            recoverBackup,
        }),
        [
            authenticated,
            authenticating,
            status,
            error,
            intervalMs,
            lastSyncedAt,
            conflicts,
            login,
            logout,
            syncNow,
            resolveInitialConflict,
            resolveDiagramConflict,
            recoverBackup,
        ]
    );

    return (
        <syncContext.Provider value={value}>
            {!authenticated ? (
                <SyncAuthScreen
                    authenticating={authenticating}
                    error={error}
                    onLogin={login}
                />
            ) : initialConflictWorkspace ? (
                <>
                    <div className="h-dvh w-dvw bg-background" />
                    <InitialSyncConflictDialog
                        open
                        busy={authenticating}
                        onResolve={resolveInitialConflict}
                    />
                </>
            ) : (
                <>
                    {children}
                    <DiagramSyncConflictDialog
                        conflict={conflicts[0]}
                        busy={status === 'syncing'}
                        onResolve={(resolution) =>
                            conflicts[0]
                                ? resolveDiagramConflict(
                                      conflicts[0].diagramId,
                                      resolution
                                  )
                                : Promise.resolve()
                        }
                    />
                </>
            )}
        </syncContext.Provider>
    );
};
