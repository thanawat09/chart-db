import { VISUAL_CONNECTOR_HANDLE_IDS } from '@/lib/domain/visual-connector';
import { cn } from '@/lib/utils';
import { Handle, Position } from '@xyflow/react';
import React from 'react';

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
    /** RF-style hollow handle (for Text node) vs sky filled (notes/areas) */
    variant?: 'default' | 'outline';
}

export const VisualHandles: React.FC<VisualHandlesProps> = ({
    visible,
    isConnectable = true,
    variant = 'default',
}) => {
    const handleClass =
        variant === 'outline'
            ? '!size-2.5 !rounded-full !border !border-[#b1b1b7] !bg-[#1e1e1e] !transition-opacity dark:!border-[#b1b1b7] dark:!bg-[#1e1e1e]'
            : '!size-2.5 !rounded-full !border-2 !border-sky-500 !bg-white !transition-opacity dark:!bg-slate-900';

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
                            handleClass,
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
                            handleClass,
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
