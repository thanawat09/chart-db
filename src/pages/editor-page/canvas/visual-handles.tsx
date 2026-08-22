import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { VISUAL_CONNECTOR_HANDLE_IDS } from '@/lib/domain/visual-connector';

const HANDLE_POSITIONS: {
    id: (typeof VISUAL_CONNECTOR_HANDLE_IDS)[number];
    position: Position;
}[] = [
    { id: 'visual-top', position: Position.Top },
    { id: 'visual-right', position: Position.Right },
    { id: 'visual-bottom', position: Position.Bottom },
    { id: 'visual-left', position: Position.Left },
];

export interface VisualHandlesProps {
    visible: boolean;
    isConnectable?: boolean;
}

export const VisualHandles: React.FC<VisualHandlesProps> = ({
    visible,
    isConnectable = true,
}) => {
    return (
        <>
            {HANDLE_POSITIONS.map(({ id, position }) => (
                <React.Fragment key={id}>
                    <Handle
                        id={id}
                        type="source"
                        position={position}
                        isConnectable={isConnectable}
                        className={cn(
                            '!size-2.5 !rounded-full !border-2 !border-sky-500 !bg-white !transition-opacity dark:!bg-slate-900',
                            visible
                                ? '!opacity-100'
                                : '!pointer-events-none !opacity-0'
                        )}
                        style={{ zIndex: 20 }}
                    />
                    <Handle
                        id={id}
                        type="target"
                        position={position}
                        isConnectable={isConnectable}
                        className={cn(
                            '!size-2.5 !rounded-full !border-2 !border-sky-500 !bg-white !transition-opacity dark:!bg-slate-900',
                            visible
                                ? '!opacity-100'
                                : '!pointer-events-none !opacity-0'
                        )}
                        style={{ zIndex: 20 }}
                    />
                </React.Fragment>
            ))}
        </>
    );
};
