# Blade and reorder pieces (T34, #36): run summary

Date: 2026-10-05. Branch: `feat/review-edit-phase` (local, not pushed). Plan: `docs/plans/2026-10-05-blade-and-reorder.md`.

## What shipped

- Core: two new operation kinds in `edit-model.ts`, each with its apply function. `cut { at }` splits the piece holding a source time into two and removes nothing (refused at an existing cut, at a piece's edge or outside the footage). `move-piece { from, to }` moves a piece by index in the current play order. `describeOperation` words both ("Cut into two pieces at 00:43.20", "Moved piece B to place 1"); `pieceLetter` moved into the core model for that. Save's `changedSections` now also compares each section's play order, so a reorder inside one section counts as a change.
- Editor: Blade tool (B or the toolbar): a click on the lanes cuts there, "Cut at playhead" and Enter cut at the playhead. Pieces drag in the Footage lane with the Select tool (drop position is decided by passing the neighbours' middles); Alt with an arrow key moves a focused piece one place. CUT and SNIP marks are drawn at the end of the earlier piece in the source, so they stay with their footage after a move. The remap for the preview (clips, words, captions, pins) now handles reordered pieces: a span in two places takes the longer one, as the engine does.
- Tests: `tests/core/edit-model.test.ts` +5, `tests/core/snip-save.test.ts` +3 (Save after cut and move on the founder-talk sample: pieces, sections, clips and words at their new timeline places, a refused split, undo and remove), `tests/web/edited.test.ts` +2, `tests/e2e/snip-save.spec.ts` +1 (port 4385: Blade, refusal reason, drag, undo/redo, Save). No engine test: build.py and pieces.py did not change, since T29 already maps reordered pieces.

## Decisions and deviations

- Sections stay contiguous by refusal. A move whose result would play a section's source range in more than one separate stretch of the timeline is `invalid`, with "That would split the section ...". Moving a whole section or reordering inside one is allowed; to move part of a section, cut at its edge first. Rewriting section bounds instead would silently change the agent's plan.
- A removal of a cut that a later move depends on is refused (the existing re-derive check).
- Drag reorders pieces only, not whole sections as a unit; the overview lane is not draggable.
- The page frame still shows the saved version until Save (as for snips).
- The committed footage sample needed no rebuild.

## Checks

- `npm run typecheck`: clean.
- `rtk proxy npm test`: 26 files, 239 tests passed.
- `rtk proxy npm run test:e2e`: 89 passed.
