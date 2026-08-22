# Field Show-When-Collapsed Design

**Date:** 2026-08-22  
**Status:** Approved in conversation (approach 1)

## Goal

Let authors choose which fields appear when a table is collapsed (before **Show More**), via a checkbox in both canvas edit mode and the side-panel field row. When expanded, all fields still appear in the table’s normal field order. PK and FK fields always remain visible while collapsed.

## Requirements (agreed)

| Area | Decision |
|------|----------|
| Checkbox meaning | Checked = show while collapsed; unchecked = hide until Show More |
| PK / FK | Always visible while collapsed (forced), even if unchecked |
| Expanded (Show More) | All fields, original table field order |
| Checkbox location | Canvas edit mode **and** side panel (same persisted value) |
| Defaults (legacy) | One-time migrate: apply old “PK/FK + fill to 10” selection, then persist flags |
| Defaults (new fields) | `showWhenCollapsed: false` |
| Hard cap of 10 | No longer used for live collapsed selection (only for migrate seeding) |

## Approach

**`DBField.showWhenCollapsed?: boolean | null`** plus one-time migration when a field is missing the flag.

Rejected:

- Table-level `collapsedVisibleFieldIds[]` — harder with reorder/delete
- Session-only checkboxes — lost on reload

## Data model

In `src/lib/domain/db-field.ts`:

```ts
showWhenCollapsed?: boolean | null;
```

Zod: `showWhenCollapsed: z.boolean().or(z.null()).optional()`

Diagram JSON / ChartDB sync persist via normal field serialization.

## Collapsed / expanded visibility

Shared helper used by `table-node` (and height helpers if needed):

**Collapsed** (`table.expanded` falsy): include field if

1. `field.primaryKey`, **or**
2. field participates in a relationship (source/target field id), **or**
3. `field.showWhenCollapsed === true`

Preserve original `table.fields` order (filter, do not re-sort).

**Show More button:** visible when there exists at least one field not in the collapsed set.

**Expanded:** return all fields in original order.

Remove the live use of `TABLE_MINIMIZED_FIELDS` for choosing which fields are visible (may remain as a constant for migrate only).

## Migration

When loading a diagram into the editor (or on first paint of a table), for each field where `showWhenCollapsed` is `undefined`/`null` (unset):

1. Compute the legacy visible set for that table: PK/FK first, then other fields in order, up to 10.
2. Set `showWhenCollapsed: true` for fields in that set, `false` for the rest.
3. Persist via `updateField` / batch update so subsequent loads skip migrate.

Detection of “unset”: treat only `undefined`/`null` as unset; explicit `false` must not be migrated again.

New fields created after this feature: initialize `showWhenCollapsed: false`.

## UI

### Canvas edit mode (`table-edit-mode-field`)

Add a toggle (eye icon or short “Show” control) bound to `showWhenCollapsed`, using the same toggle pattern as N / PK.

### Side panel (`table-field`)

Same toggle next to N / PK.

Both call `updateField({ showWhenCollapsed })`.

For PK/FK rows: toggle remains editable (stores preference) but tooltip notes that PK/FK stay visible while collapsed regardless.

## Files (expected)

- `src/lib/domain/db-field.ts` — property + schema
- Helper e.g. `src/lib/domain/field-collapsed-visibility.ts` — collapsed filter + migrate seed
- `src/pages/editor-page/canvas/table-node/table-node.tsx` — `visibleFields` logic + Show More condition
- `src/lib/domain/db-table.ts` — height calc if it still assumes min-10 slice
- `table-edit-mode-field.tsx` + `use-update-table-field.ts` — toggle
- `table-field.tsx` (side panel) — toggle
- Field creation path(s) — default `false`
- Load/migrate hook (chartDB provider or table mount) — one-time seed
- i18n keys for toggle label / tooltip
- Unit tests for filter + migrate seed

## Non-goals

- Hiding fields from the side-panel list
- Emitting `showWhenCollapsed` to SQL
- Changing DBML semantics beyond persisting the boolean on ChartDB JSON (DBML round-trip of this flag is optional; JSON/sync is required)
- Removing the Show More control when every field is already visible (button simply hidden)

## Assumptions

- “FK” means a field id that appears as `sourceFieldId` or `targetFieldId` on any relationship in the diagram
- Migrate runs in-app when opening/editing a diagram, not as a separate offline script
- Independent from field Example / table comment work; this feature only touches collapsed visibility
