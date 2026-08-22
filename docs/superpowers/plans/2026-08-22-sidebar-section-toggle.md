# Sidebar Section Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking an already-selected editor sidebar section toggles the secondary side panel open/closed while keeping the menu highlight.

**Architecture:** Local click helper in `editor-sidebar.tsx` only. Same section → `toggleSidePanel()`; different section → `showSidePanel()` + `selectSidebarSection(...)`. No layout-context API changes.

**Tech Stack:** React, existing `useLayout()` from `@/hooks/use-layout`

## Global Constraints

- Touch only `src/pages/editor-page/editor-sidebar/editor-sidebar.tsx` for behavior
- Keep highlight based on `selectedSidebarSection` (unchanged)
- Do not change New / Open / footer items
- Do not commit unless the user asks

---

### Task 1: Wire section click toggle

**Files:**
- Modify: `src/pages/editor-page/editor-sidebar/editor-sidebar.tsx`
- Spec: `docs/superpowers/specs/2026-08-22-sidebar-section-toggle-design.md`

**Interfaces:**
- Consumes: `selectedSidebarSection`, `selectSidebarSection`, `showSidePanel`, `toggleSidePanel` from `useLayout()`; `SidebarSection` type from layout context
- Produces: `handleSectionClick(section: SidebarSection)` used by all `baseItems` onClick handlers

- [ ] **Step 1: Add `handleSectionClick` and wire `baseItems`**

Import type `SidebarSection` if needed. Destructure `toggleSidePanel` from `useLayout()`.

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

Replace each `baseItems` onClick:

- tables / dbml / refs / customTypes: `() => handleSectionClick('<section>')`
- visuals: on different section, call `handleSectionClick('visuals')` then `selectVisualsTab('areas')`; on same section, only toggle (do not reset tab). Prefer:

```ts
onClick: () => {
    if (selectedSidebarSection === 'visuals') {
        toggleSidePanel();
        return;
    }
    showSidePanel();
    selectSidebarSection('visuals');
    selectVisualsTab('areas');
},
```

Or call `handleSectionClick('visuals')` then only `selectVisualsTab('areas')` when section was different — careful not to reset tab on toggle. Safest is the visuals-specific branch above.

Update `useMemo` deps to include `toggleSidePanel` / `handleSectionClick`.

- [ ] **Step 2: Manual verify in running `npm run dev`**

1. Tables open → click Tables → panel closes, highlight stays
2. Click Tables → panel opens
3. Click DBML → switches; click DBML again → closes
4. Same for Refs / Custom Types / Visuals
5. Switching to Visuals still selects areas tab; re-click Visuals only toggles

- [ ] **Step 3: Skip commit** unless user requests it
