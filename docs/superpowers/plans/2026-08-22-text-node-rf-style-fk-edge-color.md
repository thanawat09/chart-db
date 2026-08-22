# Text Node RF Style & Muted FK Edge Color — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle Text to React Flow default-node chrome (CSS variables) and soften idle FK stroke to `#b1b1b7`.

**Architecture:** Keep `text` custom node; apply `--xy-node-*` variables for card look. One-line stroke change in `relationship-edge.tsx`.

**Tech Stack:** React, `@xyflow/react` CSS variables, Tailwind/`cn` for selected accent.

---

### Task 1: Text node chrome

**Files:**
- Modify: `src/pages/editor-page/canvas/text-node/text-node.tsx`

- [x] Apply RF node CSS variables for background, border, radius, padding
- [x] Selected → pink border (ChartDB accent); keep toolbar/handles/edit
- [x] Verify light + dark via ReactFlow `colorMode`

### Task 2: FK idle stroke

**Files:**
- Modify: `src/pages/editor-page/canvas/relationship-edge/relationship-edge.tsx`

- [x] Idle `#94a3b8` → `#b1b1b7`
- [x] Confirm select highlight pink/blue unchanged

### Task 3: Manual verify

- [x] Text looks like RF card; FK softer; select table still pink/blue dash
