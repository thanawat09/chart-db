export function shouldHighlightRelationshipEdge({
    edgeId,
    sourceNodeId,
    targetNodeId,
    selectedTableIds,
    selectedRelationshipIds,
}: {
    edgeId: string;
    sourceNodeId: string;
    targetNodeId: string;
    selectedTableIds: Set<string>;
    selectedRelationshipIds: Set<string>;
}): boolean {
    return (
        selectedRelationshipIds.has(edgeId) ||
        selectedTableIds.has(sourceNodeId) ||
        selectedTableIds.has(targetNodeId)
    );
}
