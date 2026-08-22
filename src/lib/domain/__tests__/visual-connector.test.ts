import { describe, it, expect } from 'vitest';
import {
    visualConnectorSchema,
    canConnectVisualEndpoints,
} from '../visual-connector';

describe('visual-connector', () => {
    it('parses a valid connector', () => {
        const c = {
            id: 'c1',
            sourceType: 'text' as const,
            sourceId: 't1',
            targetType: 'note' as const,
            targetId: 'n1',
            sourceHandle: 'visual-right',
            targetHandle: 'visual-left',
        };
        expect(visualConnectorSchema.parse(c).id).toBe('c1');
    });

    it('canConnectVisualEndpoints rejects invalid types and self-loops', () => {
        expect(canConnectVisualEndpoints('text', 'a', 'note', 'b')).toBe(true);
        expect(canConnectVisualEndpoints('text', 'a', 'text', 'a')).toBe(false);
        expect(canConnectVisualEndpoints('text', 'a', 'table', 'b')).toBe(false);
        expect(canConnectVisualEndpoints('area', 'a1', 'note', 'n1')).toBe(true);
    });
});
