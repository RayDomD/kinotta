---
title: Effects box and gallery
date: 2026-10-27
status: Approved
summary: The Effects box starts empty; a full gallery of every effect lets the owner pick which ones go in it, then they drag from the box onto a frame.
spec:
---

## Intent

- Problem: The Effects box beside Comments (`EffectsDrawer` in `web/src/PinnedEffects.tsx`) lists all 25 catalogue effects in a small two-column scroll. You can only see about four at a time, there is no grouping, and the effects you actually want are mixed in with the ones you don't.
- Why: The owner asked for it on 2026-10-27. With 25 effects across six categories, picking from a cramped scroll is slow, and the box should hold only what this owner means to use.
- Proposed outcome:
  - The box starts empty, with a short line saying how to fill it and a "Browse effects" button.
  - "Browse effects" opens a full view of every effect, grouped by category (words, lists, speaker, screens, looks, structure), each with its moving preview, name, "Instant · free" or "Needs the agent", and what it needs.
  - Clicking an effect in the full view adds it to the box (and clicking again removes it). The box shows the chosen effects.
  - Dragging from the box onto a frame works exactly as today.
- Affected: `web/src/PinnedEffects.tsx`, `web/src/CommentsPanel.tsx`, `web/src/Storyboard.tsx` (drop target, unchanged behaviour), `web/src/Library.tsx` (`PREVIEW_HTML`), `web/src/styles.css`, the e2e and render tests for the drawer.
- Constraints:
  - The drag type (`EFFECT_DRAG_TYPE`) and the drop onto a frame are unchanged; existing pinned effects and batches read as today.
  - Phones keep "Adding effects needs a computer."
  - The full view follows `DESIGN.md`; previews stay the catalogue's own preview pages.
- Out of scope: New effects, changes to how an effect is pinned or built, and the Direction step's "Effects to try" list.
- Open questions:
  - O1: Is the box's contents remembered per reel, per project, or only for this browser? Resolved 2026-10-27, owner approved: per project, saved with the project, so it survives a reload and another browser.
  - O2: Should the Direction style's "Effects to try" pre-fill the box for that reel? Resolved 2026-10-27, owner approved: no, keep the box the owner's own choice.

## Goal

1. A new project's Effects box is empty and says how to fill it.
2. "Browse effects" shows all catalogue effects grouped by category, with previews; clicking one adds it to the box or removes it.
3. The box's contents survive a reload and a different browser on the same project.
4. Dragging from the box onto a frame pins the effect exactly as today.

## Approach

Store the box as a list of effect ids per project at `reels/.kinotta/effects-box.json`, beside the existing per-reel state (`markers.ts` uses `reels/.kinotta/<slug>/markers.json`). One small server module reads and writes it, with a GET and PUT route in `handler.ts` and a client call in `web/src/api`. Ids no longer in the catalogue are dropped on read.

`EffectsDrawer` shows the stored ids in the order added, plus a "Browse effects" button. The gallery is a dialog over the editor: six category sections, each a grid of the existing preview cards (`PREVIEW_HTML`), each card a toggle with `aria-pressed`. Previews animate only while the dialog is open. The drag source and `EFFECT_DRAG_TYPE` are untouched.

## Steps

1. [ ] Core test (red): the box reads empty for a new project; save and read back; unknown ids dropped.
2. [ ] Server module, routes, client call.
3. [ ] Drawer: empty state, chosen effects, "Browse effects" button.
4. [ ] Gallery dialog: categories, toggle cards, keyboard and focus handling, close on Escape.
5. [ ] E2e: open the gallery, add two effects, reload, both still in the box, drag one onto a frame, pin saved.

## Risks

- 25 animated previews at once can be heavy: pause previews outside the viewport.
- Existing e2e tests that drag from the full drawer need the box filled first.

## Checks to run

- New core test and the drawer e2e.
- Existing pinned-effect e2e suites.
- `npm run typecheck`, `npm run build`.

## Changelog

### 2026-10-27
- Plan created with Intent only. Owner confirmed the empty box plus full gallery on 2026-10-27.
- Owner approved the Intent and its recommended answers; Goal, Approach, Steps, Risks and Checks written. Status Approved.
