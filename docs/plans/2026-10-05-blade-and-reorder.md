---
title: Blade and reorder pieces (T34)
date: 2026-10-05
status: Done
summary: T34. The Blade (B) cuts the footage into two pieces, a piece is dragged to a new place in the Footage lane, cuts and snips are marked, and a move that would split a section is refused.
spec: docs/tickets-review-edit.md T34 (#36); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: The footage can only be snipped. A piece cannot be split to work on parts separately, and the talk cannot be rearranged.
- Why: Rearranging is the second half of editing a talk; the pieces mapping (T29) and the edit list (T32, T33) are ready for it.
- Proposed outcome: A Blade tool cuts at the playhead or a click. Dragging a piece moves it; its clips, words and captions move with it. Cuts and snips are marked on the Footage lane. Every section is still one stretch after a reorder.
- Affected: `server/core` (edit model, Save's changed sections), `web/src/review` (Tools, Lanes, Review, Edits panel).
- Constraints: Build to `docs/mockups/2026-10-05-review-edit.html`. The engine already maps reordered pieces (T29), so build.py does not change.
- Out of scope: Moving a whole section as a drag target, dragging in the overview lane, comment carry-forward (T35).
- Open questions: How sections stay contiguous (decided below).

## Goal

Cut and move-piece are operations in the edit list: they apply in the editor's preview and on Save, and the saved version plays clips and words at their new places.

## Approach

- `cut { at }` splits the piece holding source time `at`; `move-piece { from, to }` moves a piece by index in the current play order (`to` is its index after the move). Both are pure functions in `edit-model.ts`, so the editor and Save share them.
- Sections stay contiguous by refusal: a move whose result would play any section's source range in more than one separate stretch of the timeline is `invalid`, with a reason naming the section. Moving a whole section, or reordering inside one, is allowed; to move part of a section out, the owner cuts at the section's edge first. The alternative (rewriting section bounds) would silently change what the agent planned.
- Save's `changedSections` also compares each section's play order, so a reorder inside one section counts as a change.
- UI: Blade (B), a click on the lanes cuts there, "Cut at playhead" and Enter cut at the playhead. Pieces drag in the Footage lane (select tool), and Alt with an arrow moves a focused piece. CUT and SNIP marks are drawn at the end of the earlier piece in the source, so they stay with their footage after a move.

## Steps

1. Failing core tests (operations, Save), then `edit-model.ts`, `save.ts`.
2. Editor: remap for reordered pieces, Blade, drag, marks.
3. Playwright in `snip-save.spec.ts` (port 4385): Blade, refusal, drag, undo, Save.
4. Full checks.

## Risks

- A removal of a cut that a later move depends on is refused by the existing re-derive check.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, `rtk proxy npm run test:e2e`.

## Changelog

### 2026-10-05
- Plan created.
- Done. See the session summary.
