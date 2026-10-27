---
title: Effects box and gallery
date: 2026-10-27
status: Draft
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
  - O1: Is the box's contents remembered per reel, per project, or only for this browser? Recommended: per project, saved with the project, so it survives a reload and another browser.
  - O2: Should the Direction style's "Effects to try" pre-fill the box for that reel? Recommended: no, keep the box the owner's own choice.

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-27
- Plan created with Intent only. Owner confirmed the empty box plus full gallery on 2026-10-27.
