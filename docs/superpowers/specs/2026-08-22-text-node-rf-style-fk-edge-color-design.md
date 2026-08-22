# Text Node (React Flow Look) & Muted FK Edge Color

**Date:** 2026-08-22  
**Status:** Approved in conversation (approach B — RF default-node look)

## Goal

1. Restyle the existing **Text** canvas node to match React Flow’s built-in default / input node look (card, thin border, rounded corners), theme-aware for light and dark.
2. Soften the **default** foreign-key relationship edge stroke so it is less intense, while keeping pink/blue highlight behavior when a table is selected.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Approach | **B** — adopt React Flow default node visual language (CSS variables / equivalent card chrome), keep ChartDB `text` custom node type |
| Text chrome | Theme-aware: dark ≈ charcoal + thin gray border; light ≈ white/light gray + thin gray border |
| Text toolbar | Keep full: text color, font size, align, delete |
| FK default stroke | Soft muted dashed + continuous flow PK→FK (dark `#52525b` / light `#a1a1aa`, width `1.25`); reverse dash animation when PK is on React Flow target side |
| FK when table selected | Unchanged colors: pink (PK) / blue (FK) + dash flow still PK→FK |

## Out of scope

- Domain schema changes to `Text` (no new `fillColor` field)
- Dependency edges
- Visual connector edges
- Cardinality marker color redesign
- Replacing Text with xyflow built-in `type: 'input'` (would drop resize / Area nesting / 4-side visual handles)

## Implementation sketch

### Text node (`text-node.tsx` + light CSS if needed)

- Replace transparent “label-only” chrome with a filled card:
  - `rounded-lg` (or RF-equivalent radius)
  - Theme classes: e.g. dark `bg-neutral-900` / `border-neutral-600`; light `bg-white` / `border-neutral-300` (exact tokens may use existing slate/neutral used in ChartDB)
  - Padding so content reads like RF default nodes
- Keep: `NodeResizer`, `NodeToolbar`, double-click edit, `VisualHandles`, `textColor` / `fontSize` / `textAlign`
- Selected state: pink border (existing ChartDB selected accent) over the card border
- Respect stored `textAlign`; do not change domain defaults

### FK edges (`relationship-edge.tsx`)

- Change only the **idle** default branch of `edgeStroke` from `#94a3b8` to `#b1b1b7`.
- Leave branches for:
  - diff new/removed
  - `selectedTableFieldIsPk === true` → pink
  - `selectedTableFieldIsPk === false` → blue
  - animated/highlighted fallback pink
- Stroke width and dash animation classes unchanged.

## Success criteria

- Text nodes look like RF default cards in both light and dark mode.
- Toolbar still edits color / size / align / delete.
- Unselected FK edges look softer gray; selecting a table still shows pink/blue animated dashes on connected edges.
- No regression to Text↔Note↔Area connectors or dependency edges.

## Reversibility

**R2** — CSS/class and one stroke color constant; easy to revert.
