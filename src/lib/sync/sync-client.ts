import type { SyncResponse } from './sync-types';

export class SyncApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

const parseResponse = async <T>(response: Response): Promise<T> => {
    const body = (await response.json().catch(() => ({}))) as {
        error?: string;
    };

    if (!response.ok) {
        throw new SyncApiError(
            body.error ?? 'The sync service request failed',
            response.status
        );
    }

    return body as T;
};

export const createSyncSession = async (
    password: string
): Promise<{
    token: string;
    expiresAt: string;
    intervalMs: number;
    recovered: boolean;
    hasWorkspace: boolean;
    hasLoadError: boolean;
}> => {
    const response = await fetch('/api/sync/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    return parseResponse(response);
};

export const synchronize = async (
    token: string,
    body: unknown
): Promise<SyncResponse> => {
    const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    return parseResponse(response);
};

export const recoverWorkspace = async (
    token: string
): Promise<SyncResponse> => {
    const response = await fetch('/api/sync/recover', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
    });
    return parseResponse(response);
};
