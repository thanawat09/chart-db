# Field Show-When-Collapsed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist per-field `showWhenCollapsed` so collapsed tables show checkbox-selected fields (plus forced PK/FK), while Show More still lists every field in original order.

**Architecture:** Add `DBField.showWhenCollapsed`. Pure helpers compute collapsed visibility and one-time migrate seeds from the legacy “PK/FK + fill to 10” rule. Wire canvas `visibleFields` + height, toggles in canvas edit mode and side panel, default `false` on createField, migrate on diagram load.

**Tech Stack:** React, Zod, Vitest, ChartDB domain + canvas table-node

**Spec:** `docs/superpowers/specs/2026-08-22-field-show-when-collapsed-design.md`

## Global Constraints

- Checked = show while collapsed; unchecked = hide until Show More
- PK and relationship (FK) fields always visible while collapsed
- Expanded view: all fields, original order
- Checkbox in canvas edit mode and side panel (same value)
- Legacy fields: one-time migrate; new fields: `showWhenCollapsed: false`
- Do not commit unless the user asks

## File map

| File | Role |
|------|------|
| `src/lib/domain/db-field.ts` | Add `showWhenCollapsed` |
| `src/lib/domain/field-collapsed-visibility.ts` | Filter + migrate seed helpers |
| `src/lib/domain/__tests__/field-collapsed-visibility.test.ts` | Unit tests |
| `src/pages/editor-page/canvas/table-node/table-node.tsx` | Use helpers for `visibleFields` / Show More |
| `src/lib/domain/db-table.ts` | `calcTableHeight` uses collapsed count |
| `src/hooks/use-update-table-field.ts` | Toggle handler |
| `…/table-edit-mode-field.tsx` | Eye / Show toggle |
| `…/table-field/table-field.tsx` | Same toggle in side panel |
| `src/context/chartdb-context/chartdb-provider.tsx` | `createField` default + migrate on load |
| `src/i18n/locales/*.ts` | Labels / tooltips |

---

### Task 1: Visibility helpers (TDD)

**Files:**
- Create: `src/lib/domain/field-collapsed-visibility.ts`
- Create: `src/lib/domain/__tests__/field-collapsed-visibility.test.ts`

**Interfaces:**
- Produces:
  - `isFieldRelationshipEndpoint(fieldId: string, relationshipFieldIds: Set<string>): boolean`
  - `isVisibleWhenCollapsed(field: DBField, relationshipFieldIds: Set<string>): boolean`
  - `getCollapsedVisibleFields(fields: DBField[], relationshipFieldIds: Set<string>): DBField[]`
  - `needsShowMore(fields: DBField[], relationshipFieldIds: Set<string>): boolean`
  - `isShowWhenCollapsedUnset(field: DBField): boolean`
  - `computeLegacyCollapsedVisibleIds(fields: DBField[], relationshipFieldIds: Set<string>, limit?: number): Set<string>`
  - `seedShowWhenCollapsedFlags(fields: DBField[], relationshipFieldIds: Set<string>): Array<{ fieldId: string; showWhenCollapsed: boolean }>` — only for unset fields; returns updates

- [ ] **Step 1: Write failing tests**

```ts
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
```

Adjust expectations carefully: with only 3 fields and no FK, legacy set is all three → `a` and `c` true. With `b` already set, skip it.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/lib/domain/__tests__/field-collapsed-visibility.test.ts`

- [ ] **Step 3: Implement helpers**

```ts
import type { DBField } from './db-field';
import { TABLE_MINIMIZED_FIELDS } from './db-table';

export const isShowWhenCollapsedUnset = (field: DBField): boolean =>
    field.showWhenCollapsed === undefined || field.showWhenCollapsed === null;

export const isVisibleWhenCollapsed = (
    field: DBField,
    relationshipFieldIds: Set<string>
): boolean =>
    field.primaryKey ||
    relationshipFieldIds.has(field.id) ||
    field.showWhenCollapsed === true;

export const getCollapsedVisibleFields = (
    fields: DBField[],
    relationshipFieldIds: Set<string>
): DBField[] =>
    fields.filter((f) => isVisibleWhenCollapsed(f, relationshipFieldIds));

export const needsShowMore = (
    fields: DBField[],
    relationshipFieldIds: Set<string>
): boolean =>
    fields.some((f) => !isVisibleWhenCollapsed(f, relationshipFieldIds));

export const computeLegacyCollapsedVisibleIds = (
    fields: DBField[],
    relationshipFieldIds: Set<string>,
    limit: number = TABLE_MINIMIZED_FIELDS
): Set<string> => {
    const must: DBField[] = [];
    const rest: DBField[] = [];
    for (const f of fields) {
        if (f.primaryKey || relationshipFieldIds.has(f.id)) must.push(f);
        else rest.push(f);
    }
    const mustTake = must.slice(0, limit);
    const remaining = limit - mustTake.length;
    const restTake = remaining > 0 ? rest.slice(0, remaining) : [];
    const chosen = new Set([...mustTake, ...restTake].map((f) => f.id));
    // Return ids but callers filter in original order via getCollapsedVisibleFields after seed
    return chosen;
};

export const seedShowWhenCollapsedFlags = (
    fields: DBField[],
    relationshipFieldIds: Set<string>
): Array<{ fieldId: string; showWhenCollapsed: boolean }> => {
    if (!fields.some(isShowWhenCollapsedUnset)) return [];
    const legacy = computeLegacyCollapsedVisibleIds(fields, relationshipFieldIds);
    return fields
        .filter(isShowWhenCollapsedUnset)
        .map((f) => ({
            fieldId: f.id,
            showWhenCollapsed: legacy.has(f.id),
        }));
};
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Skip commit** unless user requests

---

### Task 2: Domain model + canvas `visibleFields` + height

**Files:**
- Modify: `src/lib/domain/db-field.ts`
- Modify: `src/pages/editor-page/canvas/table-node/table-node.tsx` (`visibleFields` ~289–341, Show More button)
- Modify: `src/lib/domain/db-table.ts` (`calcTableHeight`)

**Interfaces:**
- Consumes: helpers from Task 1
- Produces: canvas collapsed view driven by flags

- [ ] **Step 1: Add `showWhenCollapsed` to `DBField` + zod** (next to `example`)

- [ ] **Step 2: Replace `visibleFields` logic in `table-node.tsx`**

Build `relationshipFieldIds` as today (`relatedFieldIds`).

```ts
const visibleFields = useMemo(() => {
    const fieldsToConsider =
        editTableMode && editModeInitialFieldCount !== null
            ? fields.slice(0, editModeInitialFieldCount)
            : fields;

    if (expanded) {
        return fieldsToConsider;
    }
    return getCollapsedVisibleFields(fieldsToConsider, relatedFieldIds);
}, [expanded, fields, relatedFieldIds, editTableMode, editModeInitialFieldCount]);

const showMore = useMemo(
    () =>
        !expanded &&
        needsShowMore(
            editTableMode && editModeInitialFieldCount !== null
                ? fields.slice(0, editModeInitialFieldCount)
                : fields,
            relatedFieldIds
        ),
    // use same fieldsToConsider as above — prefer shared memo
    [...]
);
```

Wire Show More button to `showMore` instead of `fields.length > TABLE_MINIMIZED_FIELDS`.

- [ ] **Step 3: Update `calcTableHeight`**

`calcTableHeight` currently lacks relationship ids. Options:
- Change signature to `calcTableHeight(table, relationshipFieldIds?: Set<string>)`
- Or approximate: count fields with `showWhenCollapsed === true || primaryKey` when collapsed

Prefer passing optional `relationshipFieldIds` (default empty Set) so FK forcing works when callers have relationships. Grep callers of `calcTableHeight` / `getTableDimensions` and update.

```ts
if (!table.expanded) {
    visibleFieldCount = getCollapsedVisibleFields(
        table.fields,
        relationshipFieldIds ?? new Set()
    ).length;
    showMoreButtonHeight = needsShowMore(
        table.fields,
        relationshipFieldIds ?? new Set()
    )
        ? TABLE_FOOTER_HEIGHT
        : 0;
}
```

- [ ] **Step 4: Manual / typecheck smoke**

- [ ] **Step 5: Skip commit** unless user requests

---

### Task 3: Toggle UI (canvas edit + side panel) + i18n

**Files:**
- Modify: `src/hooks/use-update-table-field.ts`
- Modify: `src/pages/editor-page/canvas/table-node/table-edit-mode/table-edit-mode-field.tsx`
- Modify: `src/pages/editor-page/side-panel/.../table-field/table-field.tsx`
- Modify: `src/i18n/locales/en.ts` + all `LanguageTranslation` locales

**Interfaces:**
- Consumes: `showWhenCollapsed`
- Produces: `handleShowWhenCollapsedToggle(value: boolean)`

- [ ] **Step 1: i18n** under table field actions / table section, e.g.

```ts
show_when_collapsed: 'Show when collapsed',
show_when_collapsed_pk_fk_hint:
  'Primary keys and foreign keys always show when collapsed',
```

Add to all locales (English fallback OK).

- [ ] **Step 2: Hook** — local state + debounce like nullable:

```ts
const [localShowWhenCollapsed, setLocalShowWhenCollapsed] = useState(
    field.showWhenCollapsed === true
);
// sync from field.showWhenCollapsed
const handleShowWhenCollapsedToggle = (value: boolean) => {
    setLocalShowWhenCollapsed(value);
    debouncedUpdate({ showWhenCollapsed: value });
};
```

Return from hook.

- [ ] **Step 3: UI** — `TableFieldToggle` with `Eye` / `EyeOff` from lucide (or pressed eye) before N toggle in both edit-mode and side-panel rows. Tooltip uses i18n; if `primaryKey` or field is FK, append hint (pass `isForeignKey` prop into edit-mode field from parent if needed — side panel can compute from relationships via `useChartDB().relationships`).

- [ ] **Step 4: Manual** — toggle off non-PK field → disappears when collapsed; Show More reveals it in order.

- [ ] **Step 5: Skip commit** unless user requests

---

### Task 4: createField default + one-time migrate on load

**Files:**
- Modify: `src/context/chartdb-context/chartdb-provider.tsx` (`createField` ~867)
- Modify: load path — e.g. after diagram tables are set / `useEffect` when `tables` + `relationships` available — batch-update unset flags

**Interfaces:**
- Consumes: `seedShowWhenCollapsedFlags`
- Produces: persisted flags

- [ ] **Step 1: In `createField`, set `showWhenCollapsed: false`** on the new field object.

- [ ] **Step 2: Migrate once per diagram session**

When tables load, for each table:

```ts
const relIds = new Set(
  relationships.flatMap((r) => [r.sourceFieldId, r.targetFieldId])
);
const updates = seedShowWhenCollapsedFlags(table.fields, relIds);
for (const u of updates) {
  updateField(table.id, u.fieldId, { showWhenCollapsed: u.showWhenCollapsed });
}
```

Guard with a ref `didMigrateShowWhenCollapsed` so it runs once after initial diagram load (not on every field edit). Prefer filtering `relIds` per table (only relationships touching that table) for correctness.

- [ ] **Step 3: Also set `showWhenCollapsed: false` in import paths that create fields** if they don’t go through `createField` (e.g. `createFieldsFromMetadata`, DBML import) — only if those paths leave the property unset (migrate will seed later; optional explicit `false` for new imports to skip legacy “top 10” surprise). Spec: new fields false. For DBML/SQL import of existing schemas, **migrate seed is correct** (treat as unset → legacy). So only interactive `createField` must set `false`.

- [ ] **Step 4: Skip commit** unless user requests

---

### Task 5: Verification

- [ ] **Step 1: Unit tests** from Task 1 still pass

- [ ] **Step 2: Manual checklist**
  1. Open large table collapsed → visible set matches migrated flags + PK/FK
  2. Edit mode: uncheck a non-PK/FK → collapse → field hidden; Show More shows it in place
  3. Side panel toggle syncs with canvas edit toggle
  4. New field defaults unchecked
  5. Expanded order = full table field order

- [ ] **Step 3: Skip commit** unless user requests

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| `showWhenCollapsed` model | 2 |
| Collapsed filter + order + Show More | 1, 2 |
| Migrate legacy | 1, 4 |
| New field default false | 4 |
| Dual UI toggles | 3 |
| PK/FK forced | 1, 2 |
| Height calc | 2 |

## Consistency

- Property name: `showWhenCollapsed` everywhere
- Unset = `undefined` | `null` only
- Commits optional per user git rules
