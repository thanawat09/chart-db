# Sidebar Section Toggle Design

**Date:** 2026-08-22  
**Status:** Approved in conversation (approach 1, highlight option A)

## Goal

When the user clicks a primary nav section item that is already the selected section, toggle the secondary side panel open/closed instead of no-op / always-open.

## Current Behavior

In `src/pages/editor-page/editor-sidebar/editor-sidebar.tsx`, each section item in `baseItems` always:

1. Calls `showSidePanel()`
2. Calls `selectSidebarSection(<section>)`

Clicking the already-active section therefore keeps the panel open and does nothing useful.

## Desired Behavior

| Action | Result |
|--------|--------|
| Click a different section | Open side panel + select that section (unchanged) |
| Click the already-selected section | `toggleSidePanel()` |
| Active highlight | Still based on `selectedSidebarSection` only — stays highlighted when panel is closed |

Out of scope: New / Open / Discord / Twitter / Docs footer items.

## Approach

**Local click handlers in `editor-sidebar.tsx` only** (do not change `selectSidebarSection` in layout context).

Rationale: changing `selectSidebarSection` would affect other call sites (e.g. side-panel tabs, open-from-canvas helpers) and could close the panel unintentionally.

Reuse existing layout APIs: `toggleSidePanel`, `showSidePanel`, `selectSidebarSection`, `isSidePanelShowed` (only if needed for clarity; toggle is enough for same-section case).

## Implementation Sketch

Shared helper inside the component (or inline per item):

```ts
const handleSectionClick = (section: SidebarSection) => {
  if (selectedSidebarSection === section) {
    toggleSidePanel();
    return;
  }
  showSidePanel();
  selectSidebarSection(section);
};
```

Visuals item additionally calls `selectVisualsTab('areas')` when switching to visuals (keep current behavior on section change; on same-section re-click, only toggle — do not reset visuals tab).

## Files Touched

- `src/pages/editor-page/editor-sidebar/editor-sidebar.tsx` — only

No layout-context API changes. No i18n changes.

## Verification

Manual (dev server already available):

1. On Tables with panel open → click Tables → panel closes; Tables stays highlighted.
2. Click Tables again → panel opens.
3. Click DBML → panel opens on DBML (or switches to DBML if already open).
4. Click DBML again → panel closes; DBML stays highlighted.
5. Repeat for Refs / Custom Types (if visible) / Visuals.
6. Confirm View menu / keyboard shortcut for side panel still work independently.

## Non-goals

- Collapsing the primary icon rail
- Changing mobile sheet behavior beyond using the same `toggleSidePanel` API
- Persisting closed state beyond existing layout state
