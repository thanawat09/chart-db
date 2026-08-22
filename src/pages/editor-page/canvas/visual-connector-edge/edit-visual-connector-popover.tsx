import React, { useCallback, useRef } from 'react';
import { ArrowLeftRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/button/button';
import { ColorPicker } from '@/components/color-picker/color-picker';
import { cn } from '@/lib/utils';
import type {
    VisualConnectorArrowDirection,
    VisualConnectorStrokeStyle,
} from '@/lib/domain/visual-connector';
import { useClickAway } from 'react-use';

export interface EditVisualConnectorPopoverProps {
    anchorPosition: { x: number; y: number };
    strokeColor: string;
    strokeStyle: VisualConnectorStrokeStyle;
    arrowDirection: VisualConnectorArrowDirection;
    onStrokeColorChange: (color: string) => void;
    onStrokeStyleChange: (style: VisualConnectorStrokeStyle) => void;
    onArrowDirectionChange: (direction: VisualConnectorArrowDirection) => void;
    onReverse: () => void;
    onDelete: () => void;
    onClose: () => void;
}

const strokeStyles: { value: VisualConnectorStrokeStyle; label: string }[] = [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
];

const arrowDirections: {
    value: VisualConnectorArrowDirection;
    label: string;
}[] = [
    { value: 'none', label: 'None' },
    { value: 'forward', label: '→' },
    { value: 'both', label: '↔' },
];

export const EditVisualConnectorPopover: React.FC<
    EditVisualConnectorPopoverProps
> = ({
    anchorPosition,
    strokeColor,
    strokeStyle,
    arrowDirection,
    onStrokeColorChange,
    onStrokeStyleChange,
    onArrowDirectionChange,
    onReverse,
    onDelete,
    onClose,
}) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    useClickAway(popoverRef, onClose);

    const stopPropagation = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
    }, []);

    return (
        <div
            ref={popoverRef}
            className="fixed z-50 rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
            style={{
                left: anchorPosition.x,
                top: anchorPosition.y + 10,
            }}
            onMouseDown={stopPropagation}
            onClick={stopPropagation}
        >
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Color</span>
                    <ColorPicker
                        color={strokeColor}
                        onChange={onStrokeColorChange}
                        popoverOnMouseDown={stopPropagation}
                        popoverOnClick={stopPropagation}
                    />
                </div>
                <div className="flex items-center gap-1">
                    {strokeStyles.map((style) => (
                        <Button
                            key={style.value}
                            variant={
                                strokeStyle === style.value
                                    ? 'default'
                                    : 'outline'
                            }
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => onStrokeStyleChange(style.value)}
                        >
                            {style.label}
                        </Button>
                    ))}
                </div>
                <div className="flex items-center gap-1">
                    {arrowDirections.map((direction) => (
                        <Button
                            key={direction.value}
                            variant={
                                arrowDirection === direction.value
                                    ? 'default'
                                    : 'outline'
                            }
                            size="sm"
                            className={cn('h-7 px-2 text-xs')}
                            onClick={() =>
                                onArrowDirectionChange(direction.value)
                            }
                        >
                            {direction.label}
                        </Button>
                    ))}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title="Reverse direction"
                        onClick={onReverse}
                    >
                        <ArrowLeftRight className="size-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                        title="Delete"
                        onClick={onDelete}
                    >
                        <Trash2 className="size-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
};
