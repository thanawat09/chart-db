import { useDiff } from '@/context/diff-context/use-diff';
import { useCanvas } from '@/hooks/use-canvas';
import { useChartDB } from '@/hooks/use-chartdb';
import { useLocalConfig } from '@/hooks/use-local-config';
import { useTheme } from '@/hooks/use-theme';
import type { Cardinality, DBRelationship } from '@/lib/domain/db-relationship';
import { cn } from '@/lib/utils';
import type { Edge, EdgeProps } from '@xyflow/react';
import { getBezierPath, Position, useReactFlow, useStore } from '@xyflow/react';
import { EllipsisIcon } from 'lucide-react';
import React, { useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getCardinalityMarkerId } from '../canvas-utils';
import { RIGHT_HANDLE_ID_PREFIX } from '../table-node/table-node-field';
import { EditRelationshipPopover } from './edit-relationship-popover';

export type RelationshipEdgeType = Edge<
    {
        relationship: DBRelationship;
        highlighted?: boolean;
    },
    'relationship-edge'
>;

export const RelationshipEdge: React.FC<EdgeProps<RelationshipEdgeType>> =
    React.memo(
        ({
            id,
            sourceX,
            sourceY,
            targetX,
            targetY,
            source,
            target,
            selected,
            animated,
            data,
        }) => {
            const { getInternalNode, getEdge } = useReactFlow();
            const { checkIfRelationshipRemoved, checkIfNewRelationship } =
                useDiff();
            const { showCardinality } = useLocalConfig();
            const { effectiveTheme } = useTheme();

            const { updateRelationship, removeRelationship, getTable } =
                useChartDB();
            const {
                editRelationshipPopover,
                openRelationshipPopover,
                closeRelationshipPopover,
            } = useCanvas();

            const relationship = data?.relationship;

            // Prefer boolean selectors — array selectors re-create every time and can freeze the UI
            const sourceTableSelected = useStore(
                (state) =>
                    !!state.nodes.find(
                        (node) =>
                            node.id === source &&
                            node.type === 'table' &&
                            node.selected &&
                            !node.hidden
                    )
            );
            const targetTableSelected = useStore(
                (state) =>
                    !!state.nodes.find(
                        (node) =>
                            node.id === target &&
                            node.type === 'table' &&
                            node.selected &&
                            !node.hidden
                    )
            );

            // Color the WHOLE edge by the field on the selected table:
            // PK field on selected table → pink; FK field on selected table → blue
            const selectedTableFieldIsPk = useMemo(() => {
                if (!relationship) {
                    return null;
                }

                const selectedId = sourceTableSelected
                    ? source
                    : targetTableSelected
                      ? target
                      : null;
                if (!selectedId) {
                    return null;
                }
                if (
                    selectedId !== relationship.sourceTableId &&
                    selectedId !== relationship.targetTableId
                ) {
                    return null;
                }

                const fieldId =
                    selectedId === relationship.sourceTableId
                        ? relationship.sourceFieldId
                        : relationship.targetFieldId;
                const table = getTable(selectedId);
                const field = table?.fields.find((f) => f.id === fieldId);
                if (!field) {
                    return null;
                }

                return !!field.primaryKey;
            }, [
                getTable,
                relationship,
                source,
                sourceTableSelected,
                target,
                targetTableSelected,
            ]);

            const isPopoverOpen = useMemo(
                () => editRelationshipPopover?.relationshipId === id,
                [editRelationshipPopover, id]
            );

            const handleEdgeClick = useCallback(
                (e: React.MouseEvent) => {
                    if (e.detail === 2) {
                        // Double click - open popover
                        openRelationshipPopover({
                            relationshipId: id,
                            position: { x: e.clientX, y: e.clientY },
                        });
                    }
                    // Single click just selects the edge, doesn't open popover
                },
                [openRelationshipPopover, id]
            );

            const handleContextMenu = useCallback(
                (e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openRelationshipPopover({
                        relationshipId: id,
                        position: { x: e.clientX, y: e.clientY },
                    });
                },
                [id, openRelationshipPopover]
            );

            const handleIndicatorClick = useCallback(
                (e: React.MouseEvent) => {
                    e.stopPropagation();
                    openRelationshipPopover({
                        relationshipId: id,
                        position: { x: e.clientX, y: e.clientY },
                    });
                },
                [id, openRelationshipPopover]
            );

            const handleSwitchTables = useCallback(async () => {
                if (!relationship) return;

                const sameCardinality =
                    relationship.sourceCardinality ===
                    relationship.targetCardinality;

                if (sameCardinality) {
                    // Equal cardinalities: swap everything (tables, fields, schemas, cardinalities)
                    await updateRelationship(
                        id,
                        {
                            sourceSchema: relationship.targetSchema,
                            targetSchema: relationship.sourceSchema,
                            sourceTableId: relationship.targetTableId,
                            targetTableId: relationship.sourceTableId,
                            sourceFieldId: relationship.targetFieldId,
                            targetFieldId: relationship.sourceFieldId,
                            sourceCardinality: relationship.targetCardinality,
                            targetCardinality: relationship.sourceCardinality,
                        },
                        { updateHistory: true }
                    );
                } else if (relationship.sourceCardinality === 'many') {
                    // many:one → one:many (swap cardinalities so "many" moves to target)
                    await updateRelationship(
                        id,
                        {
                            sourceCardinality: 'one',
                            targetCardinality: 'many',
                        },
                        { updateHistory: true }
                    );
                } else {
                    // one:many → swap tables/fields/schemas (keeps one:many with different tables)
                    await updateRelationship(
                        id,
                        {
                            sourceSchema: relationship.targetSchema,
                            targetSchema: relationship.sourceSchema,
                            sourceTableId: relationship.targetTableId,
                            targetTableId: relationship.sourceTableId,
                            sourceFieldId: relationship.targetFieldId,
                            targetFieldId: relationship.sourceFieldId,
                        },
                        { updateHistory: true }
                    );
                }

                closeRelationshipPopover();
            }, [
                id,
                relationship,
                updateRelationship,
                closeRelationshipPopover,
            ]);

            const handleCardinalityChange = useCallback(
                async (
                    newSourceCardinality: Cardinality,
                    newTargetCardinality: Cardinality
                ) => {
                    if (!relationship) return;

                    // Ensure "many" is always on target side when cardinalities differ
                    // If trying to set many:one (N:1), swap tables and set one:many
                    if (
                        newSourceCardinality === 'many' &&
                        newTargetCardinality === 'one'
                    ) {
                        await updateRelationship(
                            id,
                            {
                                // Swap tables/fields/schemas
                                sourceSchema: relationship.targetSchema,
                                targetSchema: relationship.sourceSchema,
                                sourceTableId: relationship.targetTableId,
                                targetTableId: relationship.sourceTableId,
                                sourceFieldId: relationship.targetFieldId,
                                targetFieldId: relationship.sourceFieldId,
                                // Set one:many (many on target)
                                sourceCardinality: 'one',
                                targetCardinality: 'many',
                            },
                            { updateHistory: true }
                        );
                    } else {
                        await updateRelationship(
                            id,
                            {
                                sourceCardinality: newSourceCardinality,
                                targetCardinality: newTargetCardinality,
                            },
                            { updateHistory: true }
                        );
                    }
                    closeRelationshipPopover();
                },
                [id, relationship, updateRelationship, closeRelationshipPopover]
            );

            const handleDelete = useCallback(() => {
                removeRelationship(id, { updateHistory: true });
                closeRelationshipPopover();
            }, [id, removeRelationship, closeRelationshipPopover]);

            const sourceNode = useMemo(
                () => getInternalNode(source),
                [getInternalNode, source]
            );
            const targetNode = useMemo(
                () => getInternalNode(target),
                [getInternalNode, target]
            );
            const edge = useMemo(() => getEdge(id), [getEdge, id]);

            const sourceHandle: 'left' | 'right' = useMemo(
                () =>
                    edge?.sourceHandle?.startsWith?.(RIGHT_HANDLE_ID_PREFIX)
                        ? 'right'
                        : 'left',
                [edge?.sourceHandle]
            );

            const sourceWidth = sourceNode?.measured.width ?? 0;
            const sourceLeftX =
                sourceHandle === 'left'
                    ? sourceX + 3
                    : sourceX - sourceWidth - 10;
            const sourceRightX =
                sourceHandle === 'left' ? sourceX + sourceWidth + 9 : sourceX;

            const targetWidth = targetNode?.measured.width ?? 0;
            const targetLeftX = targetX - 1;
            const targetRightX = targetX + targetWidth + 10;

            const { sourceSide, targetSide } = useMemo(() => {
                const distances = {
                    leftToLeft: Math.abs(sourceLeftX - targetLeftX),
                    leftToRight: Math.abs(sourceLeftX - targetRightX),
                    rightToLeft: Math.abs(sourceRightX - targetLeftX),
                    rightToRight: Math.abs(sourceRightX - targetRightX),
                };

                const minDistance = Math.min(
                    distances.leftToLeft,
                    distances.leftToRight,
                    distances.rightToLeft,
                    distances.rightToRight
                );

                const minDistanceKey = Object.keys(distances).find(
                    (key) =>
                        distances[key as keyof typeof distances] === minDistance
                ) as keyof typeof distances;

                switch (minDistanceKey) {
                    case 'leftToRight':
                        return { sourceSide: 'left', targetSide: 'right' };
                    case 'rightToLeft':
                        return { sourceSide: 'right', targetSide: 'left' };
                    case 'rightToRight':
                        return { sourceSide: 'right', targetSide: 'right' };
                    default:
                        return { sourceSide: 'left', targetSide: 'left' };
                }
            }, [sourceLeftX, sourceRightX, targetLeftX, targetRightX]);

            const edgePath = useMemo(() => {
                // Round values to prevent tiny changes from triggering recalculation
                const roundedSourceX = Math.round(
                    sourceSide === 'left' ? sourceLeftX : sourceRightX
                );
                const roundedTargetX = Math.round(
                    targetSide === 'left' ? targetLeftX : targetRightX
                );
                const roundedSourceY = Math.round(sourceY);
                const roundedTargetY = Math.round(targetY);

                const [path] = getBezierPath({
                    sourceX: roundedSourceX,
                    sourceY: roundedSourceY,
                    targetX: roundedTargetX,
                    targetY: roundedTargetY,
                    sourcePosition:
                        sourceSide === 'left' ? Position.Left : Position.Right,
                    targetPosition:
                        targetSide === 'left' ? Position.Left : Position.Right,
                });
                return path;
            }, [
                sourceLeftX,
                sourceRightX,
                targetLeftX,
                targetRightX,
                sourceY,
                targetY,
                sourceSide,
                targetSide,
            ]);

            const sourceMarker = useMemo(
                () =>
                    getCardinalityMarkerId({
                        cardinality: relationship?.sourceCardinality ?? 'one',
                        selected: selected ?? false,
                        side: sourceSide as 'left' | 'right',
                    }),
                [relationship?.sourceCardinality, selected, sourceSide]
            );
            const targetMarker = useMemo(
                () =>
                    getCardinalityMarkerId({
                        cardinality: relationship?.targetCardinality ?? 'one',
                        selected: selected ?? false,
                        side: targetSide as 'left' | 'right',
                    }),
                [relationship?.targetCardinality, selected, targetSide]
            );

            const isDiffNewRelationship = useMemo(
                () =>
                    relationship?.id
                        ? checkIfNewRelationship({
                              relationshipId: relationship.id,
                          })
                        : false,
                [checkIfNewRelationship, relationship?.id]
            );

            const isDiffRelationshipRemoved = useMemo(
                () =>
                    relationship?.id
                        ? checkIfRelationshipRemoved({
                              relationshipId: relationship.id,
                          })
                        : false,
                [checkIfRelationshipRemoved, relationship?.id]
            );

            // Calculate the midpoint of the edge for the indicator
            const edgeMidpoint = useMemo(() => {
                const sourceXPos =
                    sourceSide === 'left' ? sourceLeftX : sourceRightX;
                const targetXPos =
                    targetSide === 'left' ? targetLeftX : targetRightX;
                return {
                    x: (sourceXPos + targetXPos) / 2,
                    y: (sourceY + targetY) / 2,
                };
            }, [
                sourceSide,
                targetSide,
                sourceLeftX,
                sourceRightX,
                targetLeftX,
                targetRightX,
                sourceY,
                targetY,
            ]);

            const isAnimated =
                !!animated || !!data?.highlighted || !!selected;

            const edgeStroke = useMemo(() => {
                if (isDiffNewRelationship) {
                    return '#22c55e';
                }
                if (isDiffRelationshipRemoved) {
                    return '#ef4444';
                }

                // Selected table: PK field → whole edge pink; FK field → whole edge blue
                if (selectedTableFieldIsPk === true) {
                    return '#db2777'; // pink-600
                }
                if (selectedTableFieldIsPk === false) {
                    return effectiveTheme === 'dark' ? '#60a5fa' : '#2563eb'; // blue
                }

                // No relevant table selected — default slate
                return isAnimated ? '#db2777' : '#94a3b8';
            }, [
                effectiveTheme,
                isAnimated,
                isDiffNewRelationship,
                isDiffRelationshipRemoved,
                selectedTableFieldIsPk,
            ]);

            return (
                <>
                    <path
                        id={id}
                        d={edgePath}
                        markerStart={`url(#${sourceMarker})`}
                        markerEnd={`url(#${targetMarker})`}
                        fill="none"
                        style={{
                            stroke: edgeStroke,
                            strokeWidth:
                                isDiffNewRelationship ||
                                isDiffRelationshipRemoved
                                    ? 3
                                    : isAnimated
                                      ? 2.5
                                      : 2,
                        }}
                        className={cn([
                            'react-flow__edge-path',
                            {
                                'chartdb-edge-dash-animated':
                                    !!animated || !!data?.highlighted,
                            },
                        ])}
                        onClick={handleEdgeClick}
                        onContextMenu={handleContextMenu}
                    />
                    <path
                        d={edgePath}
                        fill="none"
                        strokeOpacity={0}
                        strokeWidth={20}
                        // eslint-disable-next-line tailwindcss/no-custom-classname
                        className="react-flow__edge-interaction"
                        onClick={handleEdgeClick}
                        onContextMenu={handleContextMenu}
                    />
                    {selected && (
                        <foreignObject
                            width={24}
                            height={24}
                            x={edgeMidpoint.x - 12}
                            y={edgeMidpoint.y - 12}
                            className="overflow-visible"
                            style={{ pointerEvents: 'all' }}
                        >
                            <button
                                onClick={handleIndicatorClick}
                                className="relative flex size-6 items-center justify-center rounded-full border-2 border-pink-600 bg-background shadow-lg transition-all hover:scale-110 hover:bg-pink-50"
                                title="Edit relationship"
                                style={{ zIndex: 10 }}
                            >
                                <EllipsisIcon className="size-4 text-pink-600" />
                            </button>
                        </foreignObject>
                    )}
                    {relationship &&
                        isPopoverOpen &&
                        editRelationshipPopover?.position &&
                        createPortal(
                            <EditRelationshipPopover
                                anchorPosition={
                                    editRelationshipPopover.position
                                }
                                relationshipId={id}
                                sourceCardinality={
                                    relationship.sourceCardinality ?? 'one'
                                }
                                targetCardinality={
                                    relationship.targetCardinality ?? 'one'
                                }
                                onCardinalityChange={handleCardinalityChange}
                                onSwitch={handleSwitchTables}
                                onDelete={handleDelete}
                            />,
                            document.body
                        )}
                </>
                // <BaseEdge
                //     id={id}
                //     path={edgePath}
                //     markerStart="url(#cardinality_one)"
                //     markerEnd="url(#cardinality_one)"
                //     className={`!stroke-2 ${selected ? '!stroke-slate-500' : '!stroke-slate-300'}`}
                // />
            );
        }
    );

RelationshipEdge.displayName = 'RelationshipEdge';
