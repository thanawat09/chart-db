import { Button } from '@/components/button/button';
import { ColorPicker } from '@/components/color-picker/color-picker';
import { Input } from '@/components/input/input';
import type { CanvasEvent } from '@/context/canvas-context/canvas-context';
import { useCanvas } from '@/hooks/use-canvas';
import { useChartDB } from '@/hooks/use-chartdb';
import type { Text, TextAlign } from '@/lib/domain/text';
import {
    NodeResizer,
    NodeToolbar,
    Position,
    type Node,
    type NodeProps,
} from '@xyflow/react';
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Trash2,
} from 'lucide-react';
import React, { useCallback, useRef, useState } from 'react';
import { useClickAway, useKeyPressEvent } from 'react-use';
import { VisualHandles } from '../visual-handles';

export interface TextNodeProps extends NodeProps {
    data: {
        text: Text;
    };
}

export type TextNodeType = Node<{ text: Text }, 'text'>;

const clampFontSize = (value: number) =>
    Math.min(72, Math.max(10, Math.round(value)));

export const TextNode: React.FC<TextNodeProps> = ({
    data,
    selected,
    dragging,
}) => {
    const { text } = data;
    const { updateText, removeText, readonly } = useChartDB();
    const [editMode, setEditMode] = useState(false);
    const [content, setContent] = useState(text.content);
    const [hovered, setHovered] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { events } = useCanvas();

    const focused = !!selected && !dragging;
    const showHandles = (focused || hovered) && !readonly;

    const saveContent = useCallback(() => {
        if (!editMode) return;
        updateText(text.id, { content });
        setEditMode(false);
    }, [editMode, content, text.id, updateText]);

    const abortEdit = useCallback(() => {
        setEditMode(false);
        setContent(text.content);
    }, [text.content]);

    const enterEditMode = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            if (readonly) return;
            setEditMode(true);
        },
        [readonly]
    );

    const handleDelete = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            removeText(text.id);
        },
        [text.id, removeText]
    );

    const handleColorChange = useCallback(
        (color: string) => {
            updateText(text.id, { textColor: color });
        },
        [text.id, updateText]
    );

    const handleFontSizeChange = useCallback(
        (value: string) => {
            const parsed = Number(value);
            if (Number.isNaN(parsed)) return;
            updateText(text.id, { fontSize: clampFontSize(parsed) });
        },
        [text.id, updateText]
    );

    const handleAlignChange = useCallback(
        (textAlign: TextAlign) => {
            updateText(text.id, { textAlign });
        },
        [text.id, updateText]
    );

    const handleDoubleClick = useCallback<
        React.MouseEventHandler<HTMLDivElement>
    >(
        (e) => {
            if (!readonly) {
                enterEditMode(e);
            }
        },
        [enterEditMode, readonly]
    );

    useClickAway(textareaRef, saveContent);
    useKeyPressEvent('Escape', abortEdit);

    const eventConsumer = useCallback(
        (event: CanvasEvent) => {
            if (!editMode) {
                return;
            }

            if (event.action === 'pan_click') {
                saveContent();
            }
        },
        [editMode, saveContent]
    );

    events.useSubscription(eventConsumer);

    React.useEffect(() => {
        setContent(text.content);
    }, [text.content]);

    React.useEffect(() => {
        if (textareaRef.current && editMode) {
            textareaRef.current.focus();
        }
    }, [editMode]);

    return (
        <div
            className="relative flex h-full w-full overflow-hidden px-2.5 py-2"
            style={{
                borderRadius:
                    'var(--xy-node-border-radius, var(--xy-node-border-radius-default))',
                backgroundColor:
                    'var(--xy-node-background-color, var(--xy-node-background-color-default))',
                border: selected
                    ? '1px solid #db2777'
                    : 'var(--xy-node-border, var(--xy-node-border-default))',
                boxShadow:
                    selected || !hovered
                        ? undefined
                        : 'var(--xy-node-boxshadow-hover, var(--xy-node-boxshadow-hover-default))',
            }}
            onDoubleClick={handleDoubleClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <VisualHandles visible={showHandles} isConnectable={!readonly} />

            {focused && !readonly ? (
                <NodeResizer
                    minWidth={80}
                    minHeight={40}
                    isVisible={selected}
                    lineClassName="!border-pink-500"
                    handleClassName="!h-3 !w-3 !bg-pink-500 !rounded-full"
                />
            ) : null}

            {focused && !readonly ? (
                <NodeToolbar
                    isVisible
                    position={Position.Top}
                    className="flex items-center gap-1 rounded-md border bg-background p-1 shadow-md"
                >
                    <ColorPicker
                        color={text.textColor}
                        onChange={handleColorChange}
                    />
                    <Input
                        type="number"
                        min={10}
                        max={72}
                        value={text.fontSize}
                        onChange={(e) => handleFontSizeChange(e.target.value)}
                        className="h-7 w-14 px-1 text-xs"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <Button
                        variant={text.textAlign === 'left' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="size-7 p-0"
                        onClick={() => handleAlignChange('left')}
                    >
                        <AlignLeft className="size-3.5" />
                    </Button>
                    <Button
                        variant={
                            text.textAlign === 'center' ? 'secondary' : 'ghost'
                        }
                        size="sm"
                        className="size-7 p-0"
                        onClick={() => handleAlignChange('center')}
                    >
                        <AlignCenter className="size-3.5" />
                    </Button>
                    <Button
                        variant={
                            text.textAlign === 'right' ? 'secondary' : 'ghost'
                        }
                        size="sm"
                        className="size-7 p-0"
                        onClick={() => handleAlignChange('right')}
                    >
                        <AlignRight className="size-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="size-7 p-0 text-red-500 hover:text-red-700"
                        onClick={handleDelete}
                    >
                        <Trash2 className="size-3.5" />
                    </Button>
                </NodeToolbar>
            ) : null}

            {editMode ? (
                <textarea
                    ref={textareaRef}
                    className="nodrag size-full resize-none overflow-auto border-none bg-transparent outline-none"
                    style={{
                        color: text.textColor,
                        fontSize: text.fontSize,
                        textAlign: text.textAlign,
                    }}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            saveContent();
                        }
                    }}
                    autoFocus
                    placeholder="Type text..."
                />
            ) : (
                <div
                    className="size-full overflow-auto break-words whitespace-pre-wrap"
                    style={{
                        color: text.textColor,
                        fontSize: text.fontSize,
                        textAlign: text.textAlign,
                    }}
                >
                    {text.content || (
                        <span className="italic opacity-50">
                            Double-click to edit
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

TextNode.displayName = 'TextNode';
