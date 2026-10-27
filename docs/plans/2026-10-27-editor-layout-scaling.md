---
title: Editor layout, scaling and collapsible sidebar
date: 2026-10-27
status: Draft
summary: A collapsible sidebar with a light animation, and an editor layout that scales cleanly when the window or the timeline divider moves, checked by an impeccable pass.
spec:
---

## Intent

- Problem:
  - The sidebar cannot be collapsed, so the picture and timeline never get the full width.
  - The layout does not scale cleanly. The owner reports that moving the divider between picture and timeline resizes many unrelated elements. The owner's screenshot of 2026-10-27 shows the timeline toolbar, zoom row and track labels spread with large gaps, the Speech track's controls (×, ↑, M, S, gain) crowded into its label cell, the marker bar's fields running into the top edge, and clip labels truncated to one or two letters ("Co...", "a..").
- Why: The owner asked on 2026-10-27 for a UI pass across the whole editor so it holds up at any window size.
- Proposed outcome:
  - The sidebar collapses to a thin strip and expands again, with a short animation that feels smooth. The choice is remembered.
  - Moving the divider or resizing the window changes only the regions that should change (picture and timeline heights); toolbars, labels and controls keep their size and spacing.
  - The editor scales across common laptop and desktop widths without overlap, clipping or stretched gaps.
  - An impeccable audit by agy lists what else is off, and its findings are triaged into this plan before building.
- Affected: `web/src/App.tsx` (rails), `web/src/review/_internal/MediaEditor.tsx`, `NativeLanes.tsx`, the timeline toolbar and marker bar, `web/src/styles.css`, `DESIGN.md`, layout e2e tests.
- Constraints:
  - Light on resources: animate `transform`/`opacity` or one grid-column width with a CSS transition, no JS animation loop, no layout work per frame beyond the one transition; respect `prefers-reduced-motion`.
  - Follow `DESIGN.md`. Preserve the animated revisions and the Review fix that loads the chosen Working revision.
  - Simple mode keeps working.
- Out of scope: New editor features, phone layout (Effects already says it needs a computer), and the changes in the other 2026-10-27 plans.
- Open questions:
  - O1: Resolved 2026-10-27. Both the left rail (Reel, Sections) and the right panel (Effects, Comments) collapse, each with its own toggle.
  - O2: Exactly which elements resize when the divider moves. To verify in the running editor and from agy's audit before building.

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-27
- Plan created with Intent only. Owner asked for a collapsible sidebar with a light animation, proper scaling, and an impeccable pass by agy.
- O1 resolved: both side panels collapse.
