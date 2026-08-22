# Field Example Attribute Design

**Date:** 2026-08-22  
**Status:** Approved in conversation (approach 1)

## Goal

Add an optional **Example** field attribute so authors can store sample values for a column, edit them in Field Attributes, show them on the ERD canvas after the field name, round-trip them through ChartDB diagram JSON and DBML, and **never** emit them in SQL generated for the database.

## Requirements (agreed)

| Area | Decision |
|------|----------|
| Storage | New optional `example?: string \| null` on `DBField` (separate from `comments` and `default`) |
| Field Attributes UI | Single-line input above Comments; placeholder via i18n (`No example`); debounce like other attrs; readonly-safe |
| Canvas | After field name (and comments icon if present), before type; muted truncated text; tooltip for full value; hide when empty |
| Display content | Value only — no `example` prefix / no parentheses wrapper |
| Diagram JSON / ChartDB sync | Persist via normal `DBField` serialization |
| DBML | Round-trip via `note` using `@example:` marker (see below) |
| SQL export | Do not read or write `example` |
| Side panel field list | Do not show example on the compact field row (edit only via popover) |

## Approach

**Dedicated `example` property + structured DBML `note` encoding.**

Rejected alternatives:

- ChartDB-only meta comment block at end of DBML — fragile for other tools
- Piggybacking on `comments` with a delimiter in one UI field — risks leaking into SQL `COMMENT`

## Data model

In `src/lib/domain/db-field.ts`:

- Add `example?: string | null` to `DBField` and `dbFieldSchema`
- Empty / cleared input → store `null` or omit (same convention as `comments`)
- Field diff (`FieldDiffAttribute`) includes `'example'` so undo/compare behaves like `comments`

## Field Attributes UI

File: `table-field-modal.tsx` (`TableFieldPopover`)

- Add Example `Input` above the Comments `Textarea`
- Include `example` in the debounced `updateField` payload alongside existing attributes
- i18n keys under `side_panel.tables_section.table.field_actions` (e.g. `example`, `no_example`) for locales already covering field actions

## Canvas display

File: `table-node-field.tsx`

Left cluster order:

1. Diff icon (if any)
2. Field name
3. Comments icon + tooltip (unchanged)
4. Example text (if non-empty): `text-muted-foreground`, `truncate`, tooltip with full value
5. Right cluster: type / PK / unique (unchanged)

Update memo equality to compare `field.example`.

## DBML encode / decode

Shared helper (e.g. `src/lib/dbml/field-note.ts`):

**Inline marker (end of note string):** `@example: <value>`

Existing `escapeDBMLComment` flattens newlines to spaces, so the marker must be **inline**, not a separate line.

| comments | example | Exported `note` (before escape) |
|----------|---------|----------------------------------|
| `ชื่อพนักงาน` | `สมชาย` | `ชื่อพนักงาน @example: สมชาย` |
| _(empty)_ | `สมชาย` | `@example: สมชาย` |
| `ชื่อพนักงาน` | _(empty)_ | `ชื่อพนักงาน` |
| _(empty)_ | _(empty)_ | no `note` / unchanged |

- **Export (`restoreNotes`):** for each field with comments and/or example, build note via helper; if brackets already contain `note:`, **replace** that note with the encoded string (do not skip — otherwise example is dropped when a comment note already exists)
- **Import:** parse `field.note` → strip trailing `\s*@example:\s*(.*)$` into `example`; remainder → `comments`
- Notes without the marker → `example` empty (backward compatible)

On save from the UI, normalize newlines/tabs in `example` to spaces.

## SQL export

No changes to SQL generators except ensuring they continue to use only `field.comments` for comments. Explicit non-goal: any SQL COMMENT / annotation derived from `example`.

## Testing

1. Unit tests for encode/decode helper: comments only, example only, both, neither, legacy note without marker
2. DBML export → import round-trip preserves `example`
3. SQL export for a field with `example` set does not contain the example string in the script
4. Manual: set Example in popover → appears truncated on canvas → tooltip shows full value → clear → disappears

## Files (expected)

- `src/lib/domain/db-field.ts` — model + schema
- `src/lib/domain/diff/field-diff.ts` — diff attribute
- Field diff computation site(s) that list comparable attributes
- `table-field-modal.tsx` — UI + debounce payload
- `table-node-field.tsx` — canvas render + memo
- DBML export / import paths that map `note` ↔ comments
- New small helper + unit tests
- Locale JSON files for field_actions labels

## Non-goals

- Showing Example on the side-panel field row
- Emitting Example in SQL / DB COMMENT
- Using Example as DB `DEFAULT`
- Auto-generating example values from type
- Changing Comments behavior or icon

## Assumptions

- “Export for use elsewhere in this system” means ChartDB diagram JSON/sync and DBML round-trip, not SQL dialect export
- Red text in the user’s mockup was annotation only; production styling is muted foreground
- Marker collision risk is acceptable: only a note ending with `@example: ...` is treated as Example
- Because `escapeDBMLComment` flattens newlines, the marker is inline (space-separated), not a separate line
- When `restoreNotes` finds an existing field `note:`, it replaces the note content with the encoded comments+example string so example is not dropped
