import { describe, it, expect } from 'vitest';
import { textSchema, createDefaultText } from '../text';

describe('text', () => {
    it('parses a valid text', () => {
        const t = createDefaultText({ id: 't1', content: 'Hello' });
        expect(textSchema.parse(t).content).toBe('Hello');
        expect(t.textAlign).toBe('left');
        expect(t.parentAreaId).toBeNull();
    });

    it('rejects invalid textAlign', () => {
        expect(() =>
            textSchema.parse({
                ...createDefaultText({ id: 't1' }),
                textAlign: 'justify',
            })
        ).toThrow();
    });
});
