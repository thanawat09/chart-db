import { useChartDB } from '@/hooks/use-chartdb';
import type { VisualConnector } from '@/lib/domain/visual-connector';
import {
    DEFAULT_VISUAL_CONNECTOR_COLOR,
    getVisualConnectorStrokeDasharray,
} from '@/lib/domain/visual-connector';
import { cn } from '@/lib/utils';
import type { Edge, EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import { EllipsisIcon } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditVisualConnectorPopover } from './edit-visual-connector-popover';

export type VisualConnectorEdgeType = Edge<
    {
        connector: VisualConnector;
        highlighted?: boolean;
    },
    'visual-connector-edge'
>;

export const VisualConnectorEdge: React.FC<
    EdgeProps<VisualConnectorEdgeType>
> = React.memo(
    ({
        id,
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        selected,
        data,
    }) => {
        const {
            updateVisualConnector,
            removeVisualConnector,
            readonly,
        } = useChartDB();
        const [editPosition, setEditPosition] = useState<{
            x: number;
            y: number;
        } | null>(null);

        const connector = data?.connector;
        const strokeColor =
            connector?.strokeColor ?? DEFAULT_VISUAL_CONNECTOR_COLOR;
        const strokeStyle = connector?.strokeStyle ?? 'solid';
        const arrowDirection = connector?.arrowDirection ?? 'forward';

        const [path, labelX, labelY] = getBezierPath({
            sourceX,
            sourceY,
            targetX,
            targetY,
            sourcePosition,
            targetPosition,
        });

        const strokeDasharray = getVisualConnectorStrokeDasharray(strokeStyle);
        const highlighted = !!data?.highlighted || selected;

        const markerEnd = useMemo(() => {
            if (arrowDirection === 'forward' || arrowDirection === 'both') {
                return `url(#visual-connector-arrow-${id})`;
            }
            return undefined;
        }, [arrowDirection, id]);

        const markerStart = useMemo(() => {
            if (arrowDirection === 'both') {
                return `url(#visual-connector-arrow-start-${id})`;
            }
            return undefined;
        }, [arrowDirection, id]);

        const openEditor = useCallback(
            (e: React.MouseEvent) => {
                if (readonly) return;
                e.stopPropagation();
                setEditPosition({ x: e.clientX, y: e.clientY });
            },
            [readonly]
        );

        const closeEditor = useCallback(() => setEditPosition(null), []);

        const handleReverse = useCallback(() => {
            if (!connector) return;
            updateVisualConnector(id, {
                sourceType: connector.targetType,
                sourceId: connector.targetId,
                targetType: connector.sourceType,
                targetId: connector.sourceId,
                sourceHandle: connector.targetHandle,
                targetHandle: connector.sourceHandle,
            });
        }, [connector, id, updateVisualConnector]);

        const handleDelete = useCallback(() => {
            removeVisualConnector(id);
            closeEditor();
        }, [closeEditor, id, removeVisualConnector]);

        return (
            <>
                <defs>
                    <marker
                        id={`visual-connector-arrow-${id}`}
                        markerWidth="10"
                        markerHeight="10"
                        refX="8"
                        refY="3"
                        orient="auto"
                        markerUnits="strokeWidth"
                    >
                        <path d="M0,0 L0,6 L9,3 z" fill={strokeColor} />
                    </marker>
                    <marker
                        id={`visual-connector-arrow-start-${id}`}
                        markerWidth="10"
                        markerHeight="10"
                        refX="1"
                        refY="3"
                        orient="auto-start-reverse"
                        markerUnits="strokeWidth"
                    >
                        <path d="M0,0 L0,6 L9,3 z" fill={strokeColor} />
                    </marker>
                </defs>
                <BaseEdge
                    id={id}
                    path={path}
                    markerEnd={markerEnd}
                    markerStart={markerStart}
                    style={{
                        stroke: highlighted ? '#0284c7' : strokeColor,
                        strokeWidth: highlighted ? 2.5 : 2,
                        strokeDasharray,
                    }}
                    className={cn('react-flow__edge-path')}
                    onDoubleClick={openEditor}
                />
                {selected && !readonly ? (
                    <EdgeLabelRenderer>
                        <button
                            className="nodrag nopan absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-sky-600 bg-background shadow-lg transition-all hover:scale-110 hover:bg-sky-50"
                            style={{
                                left: labelX,
                                top: labelY,
                                pointerEvents: 'all',
                                zIndex: 10,
                            }}
                            onClick={openEditor}
                            title="Edit connector"
                        >
                            <EllipsisIcon className="size-3.5 text-sky-700" />
                        </button>
                    </EdgeLabelRenderer>
                ) : null}
                {editPosition
                    ? createPortal(
                          <EditVisualConnectorPopover
                              anchorPosition={editPosition}
                              strokeColor={strokeColor}
                              strokeStyle={strokeStyle}
                              arrowDirection={arrowDirection}
                              onStrokeColorChange={(color) =>
                                  updateVisualConnector(id, {
                                      strokeColor: color,
                                  })
                              }
                              onStrokeStyleChange={(style) =>
                                  updateVisualConnector(id, {
                                      strokeStyle: style,
                                  })
                              }
                              onArrowDirectionChange={(direction) =>
                                  updateVisualConnector(id, {
                                      arrowDirection: direction,
                                  })
                              }
                              onReverse={handleReverse}
                              onDelete={handleDelete}
                              onClose={closeEditor}
                          />,
                          document.body
                      )
                    : null}
            </>
        );
    }
);

VisualConnectorEdge.displayName = 'VisualConnectorEdge';
