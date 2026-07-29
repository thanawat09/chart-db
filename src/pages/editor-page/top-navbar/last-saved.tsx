import React from 'react';
import TimeAgo from 'timeago-react';
import {
    CloudOff,
    RefreshCw,
    Save,
    ShieldAlert,
    TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/button/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/tooltip/tooltip';
import { useSync } from '@/hooks/use-sync';

export interface LastSavedProps {}

export const LastSaved: React.FC<LastSavedProps> = () => {
    const { status, lastSyncedAt, intervalMs, syncNow, recoverBackup } =
        useSync();

    const content = (() => {
        switch (status) {
            case 'syncing':
                return (
                    <>
                        <RefreshCw className="animate-spin" />
                        Saving…
                    </>
                );
            case 'saved':
                return (
                    <>
                        <Save />
                        {lastSyncedAt ? (
                            <TimeAgo datetime={lastSyncedAt} />
                        ) : (
                            'Saved'
                        )}
                    </>
                );
            case 'offline':
                return (
                    <>
                        <CloudOff />
                        Offline
                    </>
                );
            case 'conflict':
                return (
                    <>
                        <TriangleAlert />
                        Conflict
                    </>
                );
            case 'recovered':
                return (
                    <>
                        <ShieldAlert />
                        Restore backup
                    </>
                );
            case 'error':
                return (
                    <>
                        <TriangleAlert />
                        Sync error
                    </>
                );
            default:
                return (
                    <>
                        <Save />
                        Save
                    </>
                );
        }
    })();

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    disabled={status === 'syncing' || status === 'conflict'}
                    onClick={() =>
                        void (status === 'recovered'
                            ? recoverBackup()
                            : syncNow())
                    }
                >
                    {content}
                </Button>
            </TooltipTrigger>
            <TooltipContent>
                Syncs automatically every {intervalMs / 1000} seconds
            </TooltipContent>
        </Tooltip>
    );
};
