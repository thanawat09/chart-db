import { createContext } from 'react';
import type { DiagramConflict } from '@/lib/sync/sync-types';
import { emptyFn } from '@/lib/utils';

export type SyncStatus =
    | 'locked'
    | 'unsynced'
    | 'syncing'
    | 'saved'
    | 'offline'
    | 'conflict'
    | 'recovered'
    | 'error';

export interface SyncContext {
    authenticated: boolean;
    authenticating: boolean;
    status: SyncStatus;
    error: string | null;
    intervalMs: number;
    lastSyncedAt: Date | null;
    conflicts: DiagramConflict[];
    login: (password: string) => Promise<void>;
    logout: () => void;
    syncNow: () => Promise<void>;
    resolveInitialConflict: (
        resolution: 'use-server' | 'use-browser'
    ) => Promise<void>;
    resolveDiagramConflict: (
        diagramId: string,
        resolution: 'keep-both' | 'use-server' | 'use-browser'
    ) => Promise<void>;
    recoverBackup: () => Promise<void>;
}

export const syncInitialValue: SyncContext = {
    authenticated: false,
    authenticating: false,
    status: 'locked',
    error: null,
    intervalMs: 10_000,
    lastSyncedAt: null,
    conflicts: [],
    login: emptyFn,
    logout: emptyFn,
    syncNow: emptyFn,
    resolveInitialConflict: emptyFn,
    resolveDiagramConflict: emptyFn,
    recoverBackup: emptyFn,
};

export const syncContext = createContext<SyncContext>(syncInitialValue);
