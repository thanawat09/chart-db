# Text Nodes, Visual Connectors & FK Bezier Edges

**Date:** 2026-08-22  
**Status:** Approved in conversation (approach 1 — separate domain entities)

## Goal

Add a **Text** visual node (draggable, resizable, nestable in Areas) that can connect to **Note** and **Area** via annotation edges that are **not** foreign keys. Separately, change table **relationship** edges to bezier curves and, when a table is selected, animate connected FK edges as moving dashed strokes.

## Requirements (agreed)

| Area | Decision |
|------|----------|
| Text vs connectable node | Same thing — Text has content + connection handles |
| Text properties (v1) | Content, text color, font size, text align (`left` \| `center` \| `right`) |
| Annotation endpoints | Text ↔ Note ↔ Area only (not Table) |
| Area nesting | Text has `parentAreaId`; moves with Area like tables |
| Delivery | Single v1: Text + connectors **and** FK bezier + dash animation |
| FK default path | Bezier (`getBezierPath`); no user toggle in v1 |
| Dependency edges | Unchanged in v1 |
| SQL / DBML | Text and visual connectors are not exported |

## Approach

**Separate domain collections** on `Diagram`: `texts[]` and `visualConnectors[]`, following the Note/Area CRUD + persist pattern.

Rejected:

- Extending Note into a “text mode” — mixes sticky markdown with plain labels
- Replacing custom Area parenting with xyflow `parentId` subflows — large blast radius vs existing table↔area logic

## Data model

### `Text` (`src/lib/domain/text.ts`)

```ts
interface Text {
  id: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  textColor: string;
  fontSize: number;
  textAlign: 'left' | 'center' | 'right';
  parentAreaId?: string | null;
  order?: number;
}
```

Defaults on create: empty or placeholder content, sensible width/height, theme-aware default `textColor`, medium `fontSize`, `textAlign: 'left'`, `parentAreaId: null`.

### `VisualConnector` (`src/lib/domain/visual-connector.ts`)

```ts
type VisualConnectorEndpointType = 'text' | 'note' | 'area';

interface VisualConnector {
  id: string;
  sourceType: VisualConnectorEndpointType;
  sourceId: string;
  targetType: VisualConnectorEndpointType;
  targetId: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}
```

No cardinality. Not part of `relationships` / `dependencies`.

### `Diagram`

```ts
texts?: Text[];
visualConnectors?: VisualConnector[];
```

Zod schemas for both types; extend `diagramSchema`. Missing fields on old diagrams → treat as `[]` (no special migrate).

## Canvas behavior

### Text node

- Custom React Flow node type `text` (plain label look — not sticky Note chrome).
- Draggable; `NodeResizer` for width/height.
- Double-click to edit `content`; on select, `NodeToolbar` (or compact panel) for color / font size / align.
- Four-side Handles (top / right / bottom / left); visible on hover/select.
- Drag into Area → set `parentAreaId` using the same area-hit testing pattern as tables; moving Area updates child Text positions.
- Delete Text → also delete visual connectors referencing that id.

### Note & Area handles

- Add the same four-side Handles to Note and Area nodes for annotation connections only.
- Must not interfere with Area resize or Note edit interactions (handles only start connections when dragging from handle).

### Visual connector edges

- New edge type (e.g. `visual-connector-edge`).
- Created only when connection ends on `text` | `note` | `area`.
- Reject connections to Table nodes and self-loops (same node) in v1.
- Bezier path, neutral stroke; selectable and deletable.
- Persisted as `VisualConnector` via ChartDB context CRUD + undo/redo.

### Side panel

- Under Visuals: new **Texts** tab alongside Areas / Notes.
- List, filter optional (match Notes if cheap), Add Text, click to focus on canvas.

### Image export

- Texts and connectors render inside React Flow → included in existing export pipeline without special casing (verify once).

## FK relationship edge styling

### Default

- In `relationship-edge.tsx`, replace `getSmoothStepPath` with `getBezierPath`.
- Keep cardinality markers and existing selected/highlight colors.
- Dependency edges: leave as-is in v1.

### When a table is selected

- Relationship edges whose `source` or `target` node id is the selected table:
  - dashed (`stroke-dasharray`)
  - animated dash offset (CSS animation / xyflow-style animated edge)
  - emphasize with the existing highlight/selected stroke tone
- Other FK edges remain solid bezier.
- Deselect table → restore solid.

**R1 note:** Existing diagrams will visually change to bezier FK paths immediately (no feature flag in v1).

## Persistence & context

- ChartDB provider: state + `createText` / `updateText` / `removeText` / `createVisualConnector` / `removeVisualConnector` (and batch helpers as needed), mirroring notes.
- IndexedDB / workspace sync JSON: serialize `texts` and `visualConnectors` with the diagram.
- Undo/redo for create/update/delete of both.
- Readonly: view only; no edit, connect, or delete.

## Edge cases

| Case | Behavior |
|------|----------|
| Delete Text / Note / Area | Remove connectors that reference that endpoint |
| Delete Area | Clear `parentAreaId` on Texts in that area (same as tables); remove Area’s connectors |
| Invalid endpoint after load | Drop or ignore connector on hydrate if endpoint missing (prefer drop on load) |
| Connect to Table | Reject |
| Self-loop | Reject in v1 |

## Testing

- Unit: Zod schemas for Text and VisualConnector.
- Unit: helper “given selected table id + relationships → which edge ids are animated”.
- Manual: create Text, style props, nest in Area, connect Text↔Note↔Area, select table → dashed animation, export image, reload diagram persists.

## Out of scope (v1)

- Connecting annotation edges to Tables
- User toggle smooth-step vs bezier for FK
- Changing dependency edge path style
- SQL / DBML / AI import for Text or connectors
- Markdown on Text
- Extra Text props (background, border, opacity, bold)
- Giving Notes `parentAreaId` (Notes remain free-floating as today)

## Success criteria

1. User can add Text from Visuals, drag/resize, edit text + color/size/align, nest in Area.
2. User can drag handles between Text/Note/Area to create persisted annotation edges.
3. FK edges render as bezier; selecting a table animates its connected FK edges as moving dashes.
4. Reload / sync preserves texts and connectors; undo works for create/delete.
