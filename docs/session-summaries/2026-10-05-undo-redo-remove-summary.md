# Undo, redo and remove one edit (T33, #35): run summary

Date: 2026-10-05. Branch: `feat/review-edit-phase` (local, not pushed). Plan: `docs/plans/2026-10-05-undo-redo-remove.md`.

## What shipped

- Core: `edit-list.json` is `{ base, operations, undo, redo }`; the stacks hold whole lists (100 deep). Every add or removal pushes the
  previous list and clears redo. New core calls `removeOperation(slug, id)`, `undoEdit`, `redoEdit`; `EditList` gains `canUndo` and
  `canRedo`. A removal re-derives the result from the remaining operations (it is refused with `invalid` if they would not apply). Files
  written before this ticket (no stacks) still read. Discard and Save clear everything.
- HTTP: `POST /api/reels/:slug/edits/undo`, `.../redo`, `DELETE .../edits/:id`; client functions in `web/src/api`.
- UI: Undo and Redo row above the cards (mockup), Ctrl or Cmd with Z, Shift+Z or Y (not in a text field), a Remove button on each card
  (hover or focus). The lanes, player and timecode follow the list, so they follow undo, redo and removal.
- Tests: `tests/core/snip-save.test.ts` +5 (real build), `tests/e2e/snip-save.spec.ts` +1 (keys, buttons, remove, reload; the
  existing port 4385 server).

## Decisions and deviations

- A removal is itself undoable (snapshots, not an operation log), so Undo after Remove brings the card back.
- The mockup labels the per-card button "Undo"; it is labelled "Remove" here so it is not confused with the toolbar Undo.
- After an edit, the playhead stays where it was (clamped); only a snip moves it.

## Checks

- `npm run typecheck`: clean.
- `rtk proxy npm test`: 26 files, 228 tests passed.
- `rtk proxy npm run test:e2e`: 88 passed.
