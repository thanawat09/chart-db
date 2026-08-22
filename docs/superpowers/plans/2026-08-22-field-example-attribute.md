# Field Example Attribute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional field `example` editable in Field Attributes, shown muted after the field name on the ERD canvas, persisted in diagram JSON, round-tripped via DBML `note` with an `@example:` marker, and never emitted in SQL.

**Architecture:** Extend `DBField` with `example`. Encode/decode comments+example through a small DBML note helper. Wire UI + canvas. Teach `restoreNotes` / DBML import to use the helper. Leave SQL generators untouched (they only read `comments`).

**Tech Stack:** React, Zod, Vitest, existing ChartDB DBML export/import (`generateDBMLFromDiagram`, `importDBMLToDiagram`), i18next

**Spec:** `docs/superpowers/specs/2026-08-22-field-example-attribute-design.md`

## Global Constraints

- Do not emit `example` in any SQL export path
- Do not show Example on the side-panel compact field row
- Display value only (no `example` prefix on canvas)
- DBML marker is **inline** `@example: <value>` at end of note (because `escapeDBMLComment` flattens newlines)
- Do not commit unless the user asks

## File map

| File | Role |
|------|------|
| `src/lib/domain/db-field.ts` | Add `example` to interface + Zod schema |
| `src/lib/dbml/field-note.ts` | `encodeFieldNote` / `decodeFieldNote` / normalize |
| `src/lib/dbml/__tests__/field-note.test.ts` | Unit tests for helper |
| `src/lib/dbml/dbml-export/dbml-export.ts` | `restoreNotes` uses encode + replace existing notes |
| `src/lib/dbml/dbml-import/dbml-import.ts` | Decode note → `comments` + `example` |
| `src/lib/domain/diff/field-diff.ts` | Add `'example'` to `FieldDiffAttribute` |
| `src/lib/domain/diff/diff-check/diff-check.ts` | Compare `example` like `comments` |
| `…/table-field-modal/table-field-modal.tsx` | Example input + debounce payload |
| `…/table-node/table-node-field.tsx` | Canvas render + memo |
| `src/i18n/locales/*.ts` | `example` / `no_example` keys (all locales; type from `en`) |
| Tests for DBML round-trip + SQL non-leak | New / extended vitest files |

---

### Task 1: Field-note encode/decode helper (TDD)

**Files:**
- Create: `src/lib/dbml/field-note.ts`
- Create: `src/lib/dbml/__tests__/field-note.test.ts`

**Interfaces:**
- Produces:
  - `normalizeExampleValue(value: string | null | undefined): string | null`
  - `encodeFieldNote(comments: string | null | undefined, example: string | null | undefined): string | undefined`
  - `decodeFieldNote(note: string | null | undefined): { comments?: string; example?: string }`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
    normalizeExampleValue,
    encodeFieldNote,
    decodeFieldNote,
} from '../field-note';

describe('field-note', () => {
    it('normalizes whitespace in example', () => {
        expect(normalizeExampleValue('a\nb\tc')).toBe('a b c');
        expect(normalizeExampleValue('  ')).toBeNull();
        expect(normalizeExampleValue(null)).toBeNull();
    });

    it('encodes comments + example inline', () => {
        expect(encodeFieldNote('ชื่อพนักงาน', 'สมชาย')).toBe(
            'ชื่อพนักงาน @example: สมชาย'
        );
        expect(encodeFieldNote(null, 'สมชาย')).toBe('@example: สมชาย');
        expect(encodeFieldNote('ชื่อพนักงาน', null)).toBe('ชื่อพนักงาน');
        expect(encodeFieldNote(null, null)).toBeUndefined();
        expect(encodeFieldNote('', '')).toBeUndefined();
    });

    it('decodes marker from end of note', () => {
        expect(decodeFieldNote('ชื่อพนักงาน @example: สมชาย')).toEqual({
            comments: 'ชื่อพนักงาน',
            example: 'สมชาย',
        });
        expect(decodeFieldNote('@example: สมชาย')).toEqual({
            example: 'สมชาย',
        });
        expect(decodeFieldNote('ชื่อพนักงาน')).toEqual({
            comments: 'ชื่อพนักงาน',
        });
        expect(decodeFieldNote(undefined)).toEqual({});
    });

    it('round-trips encode → decode', () => {
        const note = encodeFieldNote('cmt', 'ex');
        expect(decodeFieldNote(note)).toEqual({
            comments: 'cmt',
            example: 'ex',
        });
    });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/lib/dbml/__tests__/field-note.test.ts`

Expected: FAIL (module / exports missing)

- [ ] **Step 3: Implement helper**

```ts
const EXAMPLE_MARKER_RE = /\s*@example:\s*(.*)$/;

export function normalizeExampleValue(
    value: string | null | undefined
): string | null {
    if (value == null) return null;
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 0 ? normalized : null;
}

export function encodeFieldNote(
    comments: string | null | undefined,
    example: string | null | undefined
): string | undefined {
    const commentPart = comments?.trim() ?? '';
    const examplePart = normalizeExampleValue(example) ?? '';
    if (!commentPart && !examplePart) return undefined;
    if (!examplePart) return commentPart;
    if (!commentPart) return `@example: ${examplePart}`;
    return `${commentPart} @example: ${examplePart}`;
}

export function decodeFieldNote(
    note: string | null | undefined
): { comments?: string; example?: string } {
    if (note == null || note === '') return {};
    const match = note.match(EXAMPLE_MARKER_RE);
    if (!match || match.index === undefined) {
        return { comments: note };
    }
    const example = match[1]?.trim() || undefined;
    const comments = note.slice(0, match.index).trim() || undefined;
    return {
        ...(comments ? { comments } : {}),
        ...(example ? { example } : {}),
    };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/lib/dbml/__tests__/field-note.test.ts`

Expected: all PASS

- [ ] **Step 5: Skip commit** unless user requests it

---

### Task 2: Add `example` to `DBField` + field diff

**Files:**
- Modify: `src/lib/domain/db-field.ts`
- Modify: `src/lib/domain/diff/field-diff.ts`
- Modify: `src/lib/domain/diff/diff-check/diff-check.ts` (default `attributesToCheck` + comparison block near comments)

**Interfaces:**
- Consumes: none from Task 1
- Produces: `DBField.example?: string | null`; `FieldDiffAttribute` includes `'example'`

- [ ] **Step 1: Extend domain model**

In `DBField` interface and `dbFieldSchema`, add:

```ts
example?: string | null;
// zod:
example: z.string().or(z.null()).optional(),
```

(Place next to `comments`.)

- [ ] **Step 2: Extend field diff**

In `field-diff.ts`:
- Add `'example'` to `FieldDiffAttribute` union
- Add `z.literal('example')` to `fieldDiffAttributeSchema` (also add missing `z.literal('isArray')` only if the type already includes `isArray` but schema omits it — fix schema to match the type for `'example'`; do not drive-by fix unrelated mismatches unless TypeScript fails)

In `diff-check.ts` `compareFieldProperties`:
- Add `'example'` to default `attributesToCheck` array (after `'comments'`)
- Add comparison block mirroring comments:

```ts
if (
    attributesToCheck.includes('example') &&
    areCommentsDifferent(oldField.example, newField.example)
) {
    changedAttributes.push('example');
}
```

(Reuse `areCommentsDifferent` — same null/empty semantics.)

- [ ] **Step 3: Typecheck touched modules**

Run: `npx tsc -b --pretty false 2>&1 | head -n 40`

Expected: no new errors from these files (full project may have pre-existing noise; focus on errors mentioning `example` / `field-diff`)

- [ ] **Step 4: Skip commit** unless user requests it

---

### Task 3: Field Attributes UI + i18n

**Files:**
- Modify: `src/pages/editor-page/side-panel/tables-section/table-list/table-list-item/table-list-item-content/table-field/table-field-modal/table-field-modal.tsx`
- Modify: `src/i18n/locales/en.ts` (source of `LanguageTranslation`)
- Modify: every other `src/i18n/locales/*.ts` that is typed as `LanguageTranslation` (all non-`en` locale files) — add the same two keys

**Interfaces:**
- Consumes: `DBField.example`
- Produces: UI writes `example` via debounced `updateField`

- [ ] **Step 1: Add English strings**

In `en.ts` `field_actions`:

```ts
example: 'Example',
no_example: 'No example',
```

Place above `comments` / `no_comments`.

- [ ] **Step 2: Mirror keys in all other locales**

For each `LanguageTranslation` locale file, add `example` / `no_example` under `field_actions` (translate when obvious; English fallback is OK for this feature if unsure). TypeScript will fail `tsc` until every locale has the keys.

- [ ] **Step 3: Wire popover UI**

In `TableFieldPopover` debounce effect payload, add `example: localField.example`.

Above the Comments block, add:

```tsx
<div className="flex flex-col gap-2">
    <Label htmlFor="field-example" className="text-subtitle">
        {t('side_panel.tables_section.table.field_actions.example')}
    </Label>
    <Input
        id="field-example"
        value={localField.example ?? undefined}
        onChange={(e) =>
            setLocalField((current) => ({
                ...current,
                example: e.target.value,
            }))
        }
        placeholder={t(
            'side_panel.tables_section.table.field_actions.no_example'
        )}
        className="w-full rounded-md bg-muted text-sm"
        readOnly={readonly}
    />
</div>
```

Optional: on blur / before debounce, set `example: normalizeExampleValue(e.target.value)` — if normalizing only on save feels heavy, normalize in the debounce path:

```ts
example: normalizeExampleValue(localField.example),
```

Import `normalizeExampleValue` from `@/lib/dbml/field-note`.

- [ ] **Step 4: Manual check** (dev server)

Open Field Attributes → see Example above Comments → type a value → confirm it sticks after reopen.

- [ ] **Step 5: Skip commit** unless user requests it

---

### Task 4: Canvas display

**Files:**
- Modify: `src/pages/editor-page/canvas/table-node/table-node-field.tsx`

**Interfaces:**
- Consumes: `field.example`
- Produces: muted truncated example text after name / comments icon

- [ ] **Step 1: Update memo**

In `arePropsEqual`, add:

```ts
prevProps.field.example === nextProps.field.example &&
```

- [ ] **Step 2: Render example**

After the comments tooltip block (still inside the left `flex` cluster), before the closing `</div>` of that cluster:

```tsx
{field.example ? (
    <Tooltip>
        <TooltipTrigger asChild>
            <span className="min-w-0 truncate text-muted-foreground font-normal">
                {field.example}
            </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs whitespace-pre-wrap break-words">
            {field.example}
        </TooltipContent>
    </Tooltip>
) : null}
```

Do **not** use red styling. Do **not** add an `example` text prefix.

- [ ] **Step 3: Manual verify**

1. Set Example on `firstname` → muted text appears after name, before type
2. Long value truncates; tooltip shows full string
3. Clear Example → text disappears
4. Comments icon still works when both are set

- [ ] **Step 4: Skip commit** unless user requests it

---

### Task 5: DBML export (`restoreNotes`) + import decode

**Files:**
- Modify: `src/lib/dbml/dbml-export/dbml-export.ts` (`restoreNotes` field section ~874–917)
- Modify: `src/lib/dbml/dbml-import/dbml-import.ts` (field note → DBField mapping ~698–746)

**Interfaces:**
- Consumes: `encodeFieldNote`, `decodeFieldNote` from `src/lib/dbml/field-note.ts`
- Produces: DBML notes that round-trip `example`

- [ ] **Step 1: Update `restoreNotes` field handling**

Replace the field-comments filter/loop body so that:

```ts
import { encodeFieldNote } from '../field-note';
// ...
const fieldsWithNotes = table.fields.filter(
    (f) => encodeFieldNote(f.comments, f.example) !== undefined
);

fieldsWithNotes.forEach((field) => {
    const noteText = encodeFieldNote(field.comments, field.example)!;
    const escapedComment = escapeDBMLComment(noteText);
    // ... same fieldPattern ...
    result = result.replace(fieldPattern, (match, fieldPart, brackets) => {
        if (brackets && /note:\s*'/.test(brackets)) {
            // Replace existing note content so example is not dropped
            const newBrackets = brackets.replace(
                /note:\s*'([^'\\]|\\.)*'/g,
                `note: '${escapedComment}'`
            );
            return fieldPart + newBrackets;
        }
        if (brackets) {
            const newBrackets = brackets.replace(
                ']',
                `, note: '${escapedComment}']`
            );
            return fieldPart + newBrackets;
        }
        return fieldPart + ` [note: '${escapedComment}']`;
    });
});
```

Keep table-level note logic unchanged (tables have no `example`).

- [ ] **Step 2: Update DBML import field mapping**

Where `fieldComment` is derived from `field.note`, decode:

```ts
import { decodeFieldNote } from '../field-note';

let rawNote: string | undefined;
if (field.note) {
    if (typeof field.note === 'string') {
        rawNote = field.note;
    } else if (typeof field.note === 'object' && 'value' in field.note) {
        rawNote = field.note.value;
    }
}
const { comments: fieldComment, example: fieldExample } =
    decodeFieldNote(rawNote);
```

When building the returned field object:

```ts
...(fieldComment ? { comments: fieldComment } : {}),
...(fieldExample ? { example: fieldExample } : {}),
```

- [ ] **Step 3: Skip commit** unless user requests it

---

### Task 6: Integration tests (DBML round-trip + SQL non-leak)

**Files:**
- Create: `src/lib/dbml/__tests__/field-example-dbml-roundtrip.test.ts`
- Create or extend: `src/lib/data/sql-export/__tests__/field-example-not-in-sql.test.ts`

**Interfaces:**
- Consumes: `generateDBMLFromDiagram`, `importDBMLToDiagram`, `exportBaseSQL`, `DBField.example`

- [ ] **Step 1: Write DBML round-trip test**

```ts
import { describe, it, expect } from 'vitest';
import { generateDBMLFromDiagram } from '../dbml-export/dbml-export';
import { importDBMLToDiagram } from '../dbml-import/dbml-import';
import { DatabaseType } from '@/lib/domain/database-type';
import type { Diagram } from '@/lib/domain/diagram';
import type { DBTable } from '@/lib/domain/db-table';
import type { DBField } from '@/lib/domain/db-field';

describe('field example DBML round-trip', () => {
    it('preserves example and comments through export → import', async () => {
        const field: DBField = {
            id: 'f1',
            name: 'firstname',
            type: { id: 'varchar', name: 'varchar' },
            primaryKey: false,
            unique: false,
            nullable: true,
            createdAt: Date.now(),
            characterMaximumLength: '255',
            comments: 'ชื่อพนักงาน',
            example: 'สมชาย',
        };
        const table: DBTable = {
            id: 't1',
            name: 'wfm_staffs',
            fields: [field],
            indexes: [],
            createdAt: Date.now(),
            x: 0,
            y: 0,
            width: 200,
        };
        const diagram = {
            id: 'd1',
            name: 'test',
            databaseType: DatabaseType.POSTGRESQL,
            tables: [table],
            relationships: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        } as Diagram;

        const { standardDbml, error } = generateDBMLFromDiagram(diagram);
        expect(error).toBeUndefined();
        expect(standardDbml).toMatch(/@example:\s*สมชาย/);
        expect(standardDbml).toContain('ชื่อพนักงาน');

        const imported = await importDBMLToDiagram(standardDbml, {
            databaseType: DatabaseType.POSTGRESQL,
        });
        const importedField = imported.tables?.[0]?.fields.find(
            (f) => f.name === 'firstname'
        );
        expect(importedField?.comments).toBe('ชื่อพนักงาน');
        expect(importedField?.example).toBe('สมชาย');
    });
});
```

Adjust `Diagram` / `DBTable` required fields if TypeScript complains — mirror helpers from existing DBML tests.

- [ ] **Step 2: Write SQL non-leak test**

```ts
import { describe, it, expect } from 'vitest';
import { exportBaseSQL } from '../export-sql-script';
import { DatabaseType } from '@/lib/domain/database-type';
import type { Diagram } from '@/lib/domain/diagram';
import type { DBTable } from '@/lib/domain/db-table';
import type { DBField } from '@/lib/domain/db-field';

describe('field example SQL export', () => {
    it('does not include example text in SQL', () => {
        const sentinel = 'UNIQUE_EXAMPLE_SENTINEL_XYZ';
        const field: DBField = {
            id: 'f1',
            name: 'firstname',
            type: { id: 'varchar', name: 'varchar' },
            primaryKey: false,
            unique: false,
            nullable: true,
            createdAt: Date.now(),
            comments: 'staff name',
            example: sentinel,
        };
        const table: DBTable = {
            id: 't1',
            name: 'wfm_staffs',
            fields: [field],
            indexes: [],
            createdAt: Date.now(),
            x: 0,
            y: 0,
            width: 200,
        };
        const diagram = {
            id: 'd1',
            name: 'test',
            databaseType: DatabaseType.POSTGRESQL,
            tables: [table],
            relationships: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        } as Diagram;

        const sql = exportBaseSQL({
            diagram,
            targetDatabaseType: DatabaseType.POSTGRESQL,
        });
        expect(sql).not.toContain(sentinel);
        expect(sql).toMatch(/staff name/i); // comments may still appear
    });
});
```

If comments appear only as `COMMENT ON` and that is stripped in some modes, still assert `not.toContain(sentinel)`.

- [ ] **Step 3: Run tests**

Run:

```bash
npx vitest run src/lib/dbml/__tests__/field-note.test.ts src/lib/dbml/__tests__/field-example-dbml-roundtrip.test.ts src/lib/data/sql-export/__tests__/field-example-not-in-sql.test.ts
```

Expected: all PASS. If round-trip fails because note regex replace is wrong, fix `restoreNotes` replace pattern before continuing.

- [ ] **Step 4: Skip commit** unless user requests it

---

### Task 7: End-to-end manual verification

**Files:** none (manual)

- [ ] **Step 1: Verify against acceptance checklist**

With `npm run dev`:

1. Field Attributes → Example input above Comments
2. Canvas shows muted example after field name, before type
3. Tooltip shows full example
4. Clear example → hidden on canvas
5. Export / copy DBML contains `@example:`
6. Re-import that DBML → example restored
7. Export SQL → example string absent
8. Diagram JSON / sync still has `example` on the field after reload (save + reopen diagram)

- [ ] **Step 2: Skip commit** unless user requests it

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| `DBField.example` | 2 |
| Field Attributes input | 3 |
| Canvas display muted/truncated/tooltip | 4 |
| Diagram JSON persistence | 2 (schema) + runtime serialize |
| DBML round-trip `@example:` | 1, 5, 6 |
| No SQL emission | 6 (explicit test); no SQL code changes |
| Diff attribute | 2 |
| Non-goals (side panel row, default, etc.) | Not implemented |

## Placeholder / consistency check

- Helper names consistent: `encodeFieldNote` / `decodeFieldNote` / `normalizeExampleValue`
- Marker format consistent: inline `@example:` (not newline-based)
- Commit steps are optional per user git rules
