import React from 'react';
import { Button } from '@/components/button/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import type { DiagramConflict } from '@/lib/sync/sync-types';

export const InitialSyncConflictDialog: React.FC<{
    open: boolean;
    busy: boolean;
    onResolve: (resolution: 'use-server' | 'use-browser') => Promise<void>;
}> = ({ open, busy, onResolve }) => (
    <Dialog open={open}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Choose the initial workspace</DialogTitle>
                <DialogDescription>
                    This browser and the server already contain different
                    diagrams. Nothing will be replaced until you choose.
                </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
                <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void onResolve('use-server')}
                >
                    Use server workspace
                </Button>
                <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void onResolve('use-browser')}
                >
                    Upload this browser
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
);

export const DiagramSyncConflictDialog: React.FC<{
    conflict: DiagramConflict | undefined;
    busy: boolean;
    onResolve: (
        resolution: 'keep-both' | 'use-server' | 'use-browser'
    ) => Promise<void>;
}> = ({ conflict, busy, onResolve }) => (
    <Dialog open={Boolean(conflict)}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Diagram sync conflict</DialogTitle>
                <DialogDescription>
                    {conflict
                        ? `Diagram “${conflict.serverDiagram?.name ?? conflict.diagramId}” changed in this browser and on the server.`
                        : ''}
                </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-wrap gap-2">
                <Button
                    variant="secondary"
                    disabled={busy || conflict?.localType === 'delete'}
                    onClick={() => void onResolve('keep-both')}
                >
                    Keep both
                </Button>
                <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onResolve('use-server')}
                >
                    Use server
                </Button>
                <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void onResolve('use-browser')}
                >
                    Use this browser
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
);
