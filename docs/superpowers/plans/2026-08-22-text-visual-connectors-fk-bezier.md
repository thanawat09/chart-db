# Text, Visual Connectors & FK Bezier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Text nodes (with style props + Area nesting) that connect to Note/Area via persisted visual connectors, and change FK relationship edges to bezier curves with moving dashed strokes when a related table is selected.

**Architecture:** New domain entities `Text` and `VisualConnector` on `Diagram`, mirrored through Dexie storage + ChartDB context (same pattern as Note). Canvas adds a `text` node type, annotation handles on Text/Note/Area, and a `visual-connector-edge` type. FK edges switch to `getBezierPath` and honor existing `edge.animated` / `data.highlighted` with explicit dash animation styles.

**Tech Stack:** React, `@xyflow/react` v12, Zod, Vitest, Dexie, ChartDB context/history/i18n

**Spec:** `docs/superpowers/specs/2026-08-22-text-visual-connectors-fk-bezier-design.md`

## Global Constraints

- Text properties v1 only: content, textColor, fontSize, textAlign (`left` | `center` | `right`)
- Visual connectors: Text ↔ Note ↔ Area only — never Table; no self-loops
- Text has `parentAreaId`; Notes stay free-floating (no Note area parenting)
- FK default path: bezier; no user toggle; dependency edges unchanged
- Text / visual connectors are not exported to SQL or DBML
- Do not commit unless the user explicitly asks
- Match existing Note CRUD / undo / storage patterns; no speculative extras

## File map

| File | Role |
|------|------|
| `src/lib/domain/text.ts` | `Text` type + Zod + defaults |
| `src/lib/domain/visual-connector.ts` | `VisualConnector` type + Zod + connection validation helpers |
| `src/lib/domain/diagram.ts` | Add `texts?`, `visualConnectors?` |
| `src/lib/domain/relationship-edge-highlight.ts` | Pure helper: should edge animate for selection |
| `src/lib/domain/__tests__/text.test.ts` | Schema / default tests |
| `src/lib/domain/__tests__/visual-connector.test.ts` | Schema + validation tests |
| `src/lib/domain/__tests__/relationship-edge-highlight.test.ts` | Selection → animate tests |
| `src/lib/utils/area-utils.ts` | Text-in-area helpers (or extend existing) |
| `src/context/storage-context/*` | Dexie tables + CRUD for texts / visual connectors |
| `src/context/chartdb-context/*` | State + create/update/remove APIs |
| `src/context/history-context/*` | Undo/redo actions |
| `src/pages/editor-page/canvas/text-node/*` | Text node UI + toolbar |
| `src/pages/editor-page/canvas/visual-connector-edge/*` | Annotation edge |
| `src/pages/editor-page/canvas/note-node/note-node.tsx` | Add visual handles |
| `src/pages/editor-page/canvas/area-node/area-node.tsx` | Add visual handles |
| `src/pages/editor-page/canvas/relationship-edge/relationship-edge.tsx` | Bezier + animated dash styles |
| `src/pages/editor-page/canvas/canvas.tsx` | Wire nodes/edges/onConnect/parenting |
| `src/pages/editor-page/side-panel/visuals-section/*` | Texts tab |
| `src/context/layout-context/*` | `VisualsTab` includes `'texts'` |
| `src/i18n/locales/*.ts` | Copy for Texts tab |

---

### Task 1: Domain models — Text & VisualConnector (TDD)

**Files:**
- Create: `src/lib/domain/text.ts`
- Create: `src/lib/domain/visual-connector.ts`
- Create: `src/lib/domain/__tests__/text.test.ts`
- Create: `src/lib/domain/__tests__/visual-connector.test.ts`
- Modify: `src/lib/domain/diagram.ts`

**Interfaces:**
- Produces:
  - `TextAlign = 'left' | 'center' | 'right'`
  - `interface Text { id; content; x; y; width; height; textColor; fontSize; textAlign; parentAreaId?; order? }`
  - `textSchema: ZodType<Text>`
  - `createDefaultText(partial?: Partial<Text>): Text` — generates id via caller or accepts id; defaults: `content: ''`, `width: 200`, `height: 80`, `textColor: '#111827'`, `fontSize: 16`, `textAlign: 'left'`, `parentAreaId: null`, `x/y: 0`
  - `VisualConnectorEndpointType = 'text' | 'note' | 'area'`
  - `interface VisualConnector { id; sourceType; sourceId; targetType; targetId; sourceHandle?; targetHandle? }`
  - `visualConnectorSchema`
  - `VISUAL_CONNECTOR_HANDLE_IDS = ['visual-top','visual-right','visual-bottom','visual-left'] as const`
  - `isVisualConnectorEndpointType(value: string): value is VisualConnectorEndpointType`
  - `canConnectVisualEndpoints(sourceType, sourceId, targetType, targetId): boolean` — false if either type not in endpoint union, or `sourceId === targetId`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/domain/__tests__/text.test.ts
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
```

```ts
// src/lib/domain/__tests__/visual-connector.test.ts
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

    it('canConnectVisualEndpoints rejects table-like types and self-loops', () => {
        expect(canConnectVisualEndpoints('text', 'a', 'note', 'b')).toBe(true);
        expect(canConnectVisualEndpoints('text', 'a', 'text', 'a')).toBe(false);
        expect(canConnectVisualEndpoints('text', 'a', 'table' as 'text', 'b')).toBe(
            false
        );
    });
});
```

For the table-type case, implement `canConnectVisualEndpoints` to accept `string` types and return false unless both are in `text|note|area`.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run src/lib/domain/__tests__/text.test.ts src/lib/domain/__tests__/visual-connector.test.ts
```

Expected: modules not found / exports missing.

- [ ] **Step 3: Implement domain files + diagram fields**

```ts
// text.ts — interface, z.object matching fields, createDefaultText
// visual-connector.ts — types, schema, canConnectVisualEndpoints, handle id constants
```

In `diagram.ts` add:

```ts
texts?: Text[];
visualConnectors?: VisualConnector[];
```

and matching optional Zod arrays.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/lib/domain/__tests__/text.test.ts src/lib/domain/__tests__/visual-connector.test.ts
```

- [ ] **Step 5: Commit only if user asked** — otherwise skip.

---

### Task 2: FK bezier path + animated dash (TDD helper + wire edge)

**Files:**
- Create: `src/lib/domain/relationship-edge-highlight.ts`
- Create: `src/lib/domain/__tests__/relationship-edge-highlight.test.ts`
- Modify: `src/pages/editor-page/canvas/relationship-edge/relationship-edge.tsx`

**Interfaces:**
- Consumes: none from Task 1
- Produces:
  - `shouldHighlightRelationshipEdge(args: { edgeId: string; sourceNodeId: string; targetNodeId: string; selectedTableIds: Set<string>; selectedRelationshipIds: Set<string> }): boolean`
  - Relationship edge uses `getBezierPath` and applies dash animation when `animated` or `data.highlighted` is true

**Context:** `canvas.tsx` already sets `animated` + `data.highlighted` when a connected table or the edge is selected. Custom `RelationshipEdge` currently ignores that for stroke styling — fix the path component.

- [ ] **Step 1: Write failing helper tests**

```ts
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
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run src/lib/domain/__tests__/relationship-edge-highlight.test.ts
```

- [ ] **Step 3: Implement helper**

```ts
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
```

Optionally refactor `canvas.tsx` highlight effect to call this helper (keep behavior identical).

- [ ] **Step 4: Switch relationship edge to bezier + dash styles**

In `relationship-edge.tsx`:

1. Import `getBezierPath` instead of (or in addition to) `getSmoothStepPath`.
2. Destructure `animated` from `EdgeProps`.
3. Replace path computation:

```ts
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
```

Note: `getBezierPath` has no `offset`/`borderRadius` like smooth step. Drop offset for v1 (acceptable per spec). Keep left/right side selection logic.

4. On the visible `<path>`, when `animated || data?.highlighted || selected`:

```ts
className={cn(
  'react-flow__edge-path',
  '!stroke-2',
  (animated || data?.highlighted || selected)
    ? '!stroke-pink-600'
    : '!stroke-slate-400',
  // ...
)}
style={
  animated || data?.highlighted
    ? {
        strokeDasharray: '5 5',
        animation: 'chartdb-edge-dash 0.5s linear infinite',
      }
    : undefined
}
```

5. Add keyframes once (prefer a small CSS module or existing global stylesheet used by canvas). If the project has no global animation yet, add to `src/styles/` or inline in `canvas` parent:

```css
@keyframes chartdb-edge-dash {
  to {
    stroke-dashoffset: -10;
  }
}
```

Do **not** change `dependency-edge.tsx`.

- [ ] **Step 5: Run helper tests — expect PASS**

```bash
npx vitest run src/lib/domain/__tests__/relationship-edge-highlight.test.ts
```

Manual check: select a table → connected FK edges curved + dashed moving; other edges solid bezier.

- [ ] **Step 6: Commit only if user asked**

---

### Task 3: Dexie storage for texts & visual connectors

**Files:**
- Modify: `src/context/storage-context/storage-context.tsx`
- Modify: `src/context/storage-context/storage-provider.tsx`

**Interfaces:**
- Consumes: `Text`, `VisualConnector` from Task 1
- Produces (mirror Note APIs):
  - `addText({ diagramId, text })`
  - `getText({ id, diagramId })`
  - `updateText({ id, attributes })`
  - `deleteText({ id, diagramId })`
  - `listTexts(diagramId)`
  - `deleteDiagramTexts(diagramId)`
  - Same set for `VisualConnector` with names `addVisualConnector`, `getVisualConnector`, `updateVisualConnector`, `deleteVisualConnector`, `listVisualConnectors`, `deleteDiagramVisualConnectors`

- [ ] **Step 1: Add Dexie version 15 stores**

After version 14 block, add version 15 that keeps prior stores and adds:

```ts
texts: '++id, diagramId, content, x, y, width, height, textColor, fontSize, textAlign, parentAreaId, order',
visual_connectors: '++id, diagramId, sourceType, sourceId, targetType, targetId, sourceHandle, targetHandle',
```

Extend `ChartDBStorage` / EntityTable types like `notes`.

- [ ] **Step 2: Implement CRUD callbacks** mirroring `addNote` / `updateNote` / `deleteNote` / `listNotes`.

- [ ] **Step 3: Wire diagram load/save**

Wherever `diagram.notes = await listNotes(...)` and `addNote` on diagram put — also load/save `texts` and `visualConnectors`. Search `listNotes`, `bulkPut` notes, `deleteDiagram` cascades.

- [ ] **Step 4: Smoke-check TypeScript on storage files**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -40
```

Fix only errors introduced by this task.

- [ ] **Step 5: Commit only if user asked**

---

### Task 4: ChartDB context + history

**Files:**
- Modify: `src/context/chartdb-context/chartdb-context.tsx`
- Modify: `src/context/chartdb-context/chartdb-provider.tsx`
- Modify: `src/context/history-context/redo-undo-action.ts`
- Modify: `src/context/history-context/history-provider.tsx`

**Interfaces:**
- Produces on context (parallel to notes):
  - `texts: Text[]`
  - `visualConnectors: VisualConnector[]`
  - `createText(attributes?: Partial<Omit<Text, 'id'>>): Promise<Text>`
  - `updateText(id, partial, options?)`
  - `removeText(id, options?)` / `removeTexts(ids, options?)`
  - `getText(id)`
  - `createVisualConnector(attributes?: Partial<Omit<VisualConnector, 'id'>>): Promise<VisualConnector>`
  - `removeVisualConnector(id, options?)` / `removeVisualConnectors(ids, options?)`
  - On `removeText` / `removeNote` / `removeArea`: also remove connectors whose `sourceId` or `targetId` matches (and type matches). Prefer a shared helper `getConnectorIdsForEndpoint(type, id)`.

- [ ] **Step 1: Extend `RedoUndoAction` union**

Add:

- `addTexts` / `removeTexts` / `updateText`
- `addVisualConnectors` / `removeVisualConnectors`

Mirror note action payload shapes.

- [ ] **Step 2: Implement provider state + CRUD** copying `createNote` / `addNote` / `updateNote` / `removeNotes` patterns with `createDefaultText` defaults and `generateId()`.

- [ ] **Step 3: History provider redo/undo handlers** for the new actions (copy note handlers).

- [ ] **Step 4: Cascade deletes**

When removing texts/notes/areas, collect connector ids where endpoint matches and call `removeVisualConnectors(..., { updateHistory: true })` in the same user action (or include connectors in undo payload so undo restores both). Simplest correct approach: in `removeTexts` / extend `removeNotes` / `removeAreas`, first find connectors, delete them with history entry or bundle into one undo action. Prefer **bundling**: one undo restores entities + connectors. If bundling is too heavy, sequential history entries are acceptable for v1 if documented — prefer single undo that restores note/text/area **and** its connectors (store connectors in `undoData`).

- [ ] **Step 5: On diagram load in provider, `setTexts(diagram.texts ?? [])`, `setVisualConnectors(diagram.visualConnectors ?? [])`. Filter out connectors whose endpoints are missing (drop orphans).

- [ ] **Step 6: Commit only if user asked**

---

### Task 5: Text canvas node (no connectors yet)

**Files:**
- Create: `src/pages/editor-page/canvas/text-node/text-node.tsx`
- Modify: `src/pages/editor-page/canvas/canvas.tsx`

**Interfaces:**
- Consumes: `Text`, `updateText`, `removeText` from context
- Produces: `TextNodeType = Node<{ text: Text }, 'text'>`, `TextNode` component

- [ ] **Step 1: Implement `TextNode`**

Behavior:

- Renders `content` with inline styles: `color: text.textColor`, `fontSize`, `textAlign`
- Transparent / minimal chrome (border on select only)
- `NodeResizer` when selected and not readonly
- Double-click → edit content (textarea), blur/Enter save via `updateText`
- When selected and not readonly: `NodeToolbar` with:
  - color input / `ColorPicker` if already used by notes
  - font size number input (clamp 10–72)
  - align buttons left/center/right
- Delete button on select → `removeText`

- [ ] **Step 2: Register in canvas**

- Add to `nodeTypes`: `text: TextNode`
- `textToTextNode(text: Text): TextNodeType` like `noteToNoteNode`
- Include `...texts.map(textToTextNode)` in nodes memo
- In `onNodesChange` handler: persist position/size for `type === 'text'` via `updateText` (mirror note position/size block ~1278–1316 in `canvas.tsx`)
- Handle note-style remove changes for text nodes

- [ ] **Step 3: Manual verify**

Create a text via temporary `createText` from console or a quick button if Texts tab not ready — or jump to Task 9 first if blocked. Minimum: unit-free manual after Task 9. For this task, if no UI yet, add a short-lived call in notes “Add” pattern later; acceptable to verify after Task 9.

- [ ] **Step 4: Commit only if user asked**

---

### Task 6: Text ↔ Area parenting

**Files:**
- Modify: `src/lib/utils/area-utils.ts` (or create `src/lib/utils/text-area-utils.ts` if keeping table helpers pure)
- Modify: `src/pages/editor-page/canvas/canvas.tsx`
- Modify: `src/context/chartdb-context/chartdb-provider.tsx` (area delete clears text `parentAreaId`)

**Interfaces:**
- Produces:
  - `isTextInsideArea(text: Text, area: Area): boolean` — same geometry as tables using `text.width/height`
  - `findContainingAreaForText(text, areas): Area | null`
  - `updateTextsParentAreas(texts, areas): Text[]`
  - `getTextsInArea(areaId, texts): Text[]`

- [ ] **Step 1: Implement helpers** (copy table logic; do not break table functions).

- [ ] **Step 2: Wire canvas**

Where `updateTablesParentAreas` runs on drag end / area move — also update texts’ `parentAreaId` and when area moves, translate child texts by the same delta as child tables (find existing area-move table update and duplicate for texts).

- [ ] **Step 3: On area remove**

Clear `parentAreaId` for texts that referenced the area (same as tables).

- [ ] **Step 4: Manual verify** — drag text fully inside area, move area, text follows; delete area, text remains with `parentAreaId: null`.

- [ ] **Step 5: Commit only if user asked**

---

### Task 7: Visual connectors — handles, edge, onConnect

**Files:**
- Create: `src/pages/editor-page/canvas/visual-connector-edge/visual-connector-edge.tsx`
- Create: `src/pages/editor-page/canvas/visual-handles.tsx` (shared 4 handles)
- Modify: `text-node.tsx`, `note-node.tsx`, `area-node.tsx`
- Modify: `canvas.tsx`

**Interfaces:**
- Consumes: `canConnectVisualEndpoints`, `VISUAL_CONNECTOR_HANDLE_IDS`, `createVisualConnector`, `removeVisualConnector`
- Produces: edge type `'visual-connector-edge'`

- [ ] **Step 1: Shared handles component**

```tsx
export function VisualHandles({ visible }: { visible: boolean }) {
  // four Handles: Position.Top/Right/Bottom/Left
  // id = visual-top | visual-right | visual-bottom | visual-left
  // type="source" (React Flow 12 often uses isConnectable; allow both source/target — use Handle with type source and isConnectableStart/End as needed)
  // className: opacity based on `visible` (hover/selected)
}
```

Show when node `selected` or local hover. Use `isConnectable={!readonly}`.

Ensure Area `NodeResizer` and Note editing still work — handles must not cover resize controls (offset inward ~4px).

- [ ] **Step 2: Visual connector edge**

Bezier path, slate stroke, selectable; Delete key / selected delete removes via `removeVisualConnector`. No cardinality markers.

- [ ] **Step 3: Map connectors → edges in canvas**

```ts
visualConnectors.map((c) => ({
  id: c.id,
  type: 'visual-connector-edge',
  source: c.sourceId,
  target: c.targetId,
  sourceHandle: c.sourceHandle ?? undefined,
  targetHandle: c.targetHandle ?? undefined,
  data: { connector: c },
}))
```

Register in `edgeTypes`.

- [ ] **Step 4: Extend `onConnect` / `isValidConnection`**

Before creating a FK relationship:

1. Resolve source/target node types via `getNode`.
2. If both are `text|note|area` and `canConnectVisualEndpoints(...)`, call `createVisualConnector` with handle ids from connection.
3. If either is `table` and the other is visual-only type → **reject** (return early).
4. Existing table field → table field relationship logic unchanged.

```ts
isValidConnection: (connection) => {
  const sourceNode = getNode(connection.source);
  const targetNode = getNode(connection.target);
  if (!sourceNode || !targetNode) return false;
  const visualTypes = new Set(['text', 'note', 'area']);
  if (visualTypes.has(sourceNode.type) || visualTypes.has(targetNode.type)) {
    return canConnectVisualEndpoints(
      sourceNode.type,
      sourceNode.id,
      targetNode.type,
      targetNode.id
    );
  }
  // existing table relationship validation...
}
```

- [ ] **Step 5: Manual verify** — connect Text↔Note↔Area; cannot connect to Table; reload persists; delete edge removes connector.

- [ ] **Step 6: Commit only if user asked**

---

### Task 8: Side panel Texts tab + i18n + layout

**Files:**
- Create: `src/pages/editor-page/side-panel/visuals-section/texts-tab/texts-tab.tsx`
- Create: `texts-list/texts-list.tsx` + `text-list-item/text-list-item.tsx` (clone notes-tab structure)
- Modify: `visuals-section.tsx` — 3 tabs (`grid-cols-3`)
- Modify: `layout-context.tsx` / `layout-provider.tsx` — `VisualsTab = 'areas' | 'notes' | 'texts'`; add `openTextsSection` if notes has equivalent
- Modify: `src/i18n/locales/en.ts` + all other locale files under `src/i18n/locales/`

**Interfaces:**
- Consumes: `createText`, `texts`, `removeText`, `updateText`
- `createText` positions near viewport center (copy how `createNote` / `createArea` uses `useViewport`)

- [ ] **Step 1: Add i18n keys in `en.ts`**

Under `side_panel`:

```ts
visuals_section: {
  visuals: 'Visuals',
  tabs: {
    areas: 'Areas',
    notes: 'Notes',
    texts: 'Texts',
  },
},
texts_section: {
  filter: 'Filter',
  add_text: 'Add Text',
  no_results: 'No texts found',
  clear: 'Clear Filter',
  empty_state: {
    title: 'No Texts',
    description: 'Create a text label on the canvas',
  },
  text: {
    empty_text: 'Empty text',
    text_actions: {
      title: 'Text Actions',
      edit_content: 'Edit Content',
      delete_text: 'Delete Text',
    },
  },
},
```

For other locales: add the same keys (English values acceptable if no translation yet — keep structure identical so `t()` does not miss keys).

- [ ] **Step 2: Implement Texts tab UI** cloning Notes tab (list, filter, add button, empty state).

- [ ] **Step 3: Wire visuals section + layout tab type.

- [ ] **Step 4: Manual verify** — Add Text from sidebar, select list item focuses node (`useFocusOn` / existing note focus pattern).

- [ ] **Step 5: Commit only if user asked**

---

### Task 9: End-to-end verification

**Files:** none new (fix only)

- [ ] **Step 1: Unit suite**

```bash
npx vitest run src/lib/domain/__tests__/text.test.ts src/lib/domain/__tests__/visual-connector.test.ts src/lib/domain/__tests__/relationship-edge-highlight.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Manual checklist (dev server)**

1. Add Text → edit content, color, font size, align
2. Drag Text into Area → move Area → Text follows
3. Connect Text ↔ Note ↔ Area; cannot connect to Table
4. Delete Note → its connectors gone
5. Select Table → connected FK edges are **bezier + moving dashed**; unrelated FK solid bezier
6. Reload page → texts + connectors persist
7. Undo create/delete text and connector
8. Export diagram image includes texts and connectors
9. Readonly: cannot edit/connect

- [ ] **Step 3: Fix any defects found; re-run Step 1**

- [ ] **Step 4: Commit only if user asked**

---

## Spec coverage (self-review)

| Spec item | Task |
|-----------|------|
| Text model + props | 1, 5, 8 |
| VisualConnector model | 1, 7 |
| Diagram fields + empty default | 1, 3, 4 |
| Area nesting for Text | 6 |
| Handles on Text/Note/Area | 7 |
| Reject Table / self-loop | 1, 7 |
| Cascade delete connectors | 4 |
| Orphan drop on load | 4 |
| Side panel Texts | 8 |
| FK bezier | 2 |
| Animated dash on table select | 2 (uses existing canvas highlight) |
| Dependency edges unchanged | 2 |
| No SQL/DBML | (no export tasks — by omission) |
| Image export | 9 verify |
| Undo/redo | 4 |
| Tests | 1, 2, 9 |

## Parallelism note

Tasks **1 → 3 → 4 → 5 → 6 → 7 → 8 → 9** are sequential for Text/connectors. **Task 2** (FK bezier/dash) can run in parallel with Task 1–4.
