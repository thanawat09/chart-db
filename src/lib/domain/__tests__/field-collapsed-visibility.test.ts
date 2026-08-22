import { describe, it, expect } from 'vitest';
import type { DBField } from '../db-field';
import {
    getCollapsedVisibleFields,
    needsShowMore,
    computeLegacyCollapsedVisibleIds,
    seedShowWhenCollapsedFlags,
    isShowWhenCollapsedUnset,
} from '../field-collapsed-visibility';

const field = (partial: Partial<DBField> & Pick<DBField, 'id' | 'name'>): DBField =>
    ({
        type: { id: 'int', name: 'int' },
        primaryKey: false,
        unique: false,
        nullable: true,
        createdAt: 1,
        ...partial,
    }) as DBField;

describe('field-collapsed-visibility', () => {
    it('includes PK and FK even when showWhenCollapsed is false', () => {
        const fields = [
            field({ id: 'pk', name: 'id', primaryKey: true, showWhenCollapsed: false }),
            field({ id: 'fk', name: 'user_id', showWhenCollapsed: false }),
            field({ id: 'hidden', name: 'note', showWhenCollapsed: false }),
            field({ id: 'shown', name: 'code', showWhenCollapsed: true }),
        ];
        const rel = new Set(['fk']);
        const visible = getCollapsedVisibleFields(fields, rel);
        expect(visible.map((f) => f.id)).toEqual(['pk', 'fk', 'shown']);
    });

    it('preserves original order when expanded filter is not used', () => {
        const fields = [
            field({ id: 'a', name: 'a', showWhenCollapsed: true }),
            field({ id: 'b', name: 'b', showWhenCollapsed: false }),
            field({ id: 'c', name: 'c', showWhenCollapsed: true }),
        ];
        expect(getCollapsedVisibleFields(fields, new Set()).map((f) => f.id)).toEqual([
            'a',
            'c',
        ]);
    });

    it('needsShowMore when some fields are collapsed-hidden', () => {
        const fields = [
            field({ id: 'a', name: 'a', showWhenCollapsed: true }),
            field({ id: 'b', name: 'b', showWhenCollapsed: false }),
        ];
        expect(needsShowMore(fields, new Set())).toBe(true);
        expect(
            needsShowMore(
                [field({ id: 'a', name: 'a', showWhenCollapsed: true })],
                new Set()
            )
        ).toBe(false);
    });

    it('legacy seed picks PK/FK then fills to 10 in order', () => {
        const fields = Array.from({ length: 12 }, (_, i) =>
            field({
                id: `f${i}`,
                name: `f${i}`,
                primaryKey: i === 0,
            })
        );
        const ids = computeLegacyCollapsedVisibleIds(fields, new Set(['f2']), 10);
        expect(ids.has('f0')).toBe(true);
        expect(ids.has('f2')).toBe(true);
        expect(ids.size).toBe(10);
    });

    it('seed only updates unset fields', () => {
        const fields = [
            field({ id: 'a', name: 'a' }), // unset
            field({ id: 'b', name: 'b', showWhenCollapsed: false }), // explicit
            field({ id: 'c', name: 'c', primaryKey: true }), // unset PK
        ];
        expect(isShowWhenCollapsedUnset(fields[0])).toBe(true);
        expect(isShowWhenCollapsedUnset(fields[1])).toBe(false);
        const updates = seedShowWhenCollapsedFlags(fields, new Set());
        expect(updates.find((u) => u.fieldId === 'b')).toBeUndefined();
        expect(updates.find((u) => u.fieldId === 'a')?.showWhenCollapsed).toBe(
            true
        ); // within legacy top set
        expect(updates.find((u) => u.fieldId === 'c')?.showWhenCollapsed).toBe(
            true
        );
    });
});
