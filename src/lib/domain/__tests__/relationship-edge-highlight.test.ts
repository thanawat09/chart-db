import { describe, it, expect } from 'vitest';
import { shouldHighlightRelationshipEdge } from '../relationship-edge-highlight';

describe('shouldHighlightRelationshipEdge', () => {
    it('highlights when source or target table is selected', () => {
        expect(
            shouldHighlightRelationshipEdge({
                edgeId: 'r1',
                sourceNodeId: 't1',
                targetNodeId: 't2',
                selectedTableIds: new Set(['t1']),
                selectedRelationshipIds: new Set(),
            })
        ).toBe(true);
    });

    it('highlights when relationship edge id is selected', () => {
        expect(
            shouldHighlightRelationshipEdge({
                edgeId: 'r1',
                sourceNodeId: 't1',
                targetNodeId: 't2',
                selectedTableIds: new Set(),
                selectedRelationshipIds: new Set(['r1']),
            })
        ).toBe(true);
    });

    it('does not highlight unrelated edges', () => {
        expect(
            shouldHighlightRelationshipEdge({
                edgeId: 'r1',
                sourceNodeId: 't1',
                targetNodeId: 't2',
                selectedTableIds: new Set(['t9']),
                selectedRelationshipIds: new Set(),
            })
        ).toBe(false);
    });
});
