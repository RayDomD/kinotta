---
title: Undo, redo and remove one edit (T33)
date: 2026-10-05
status: Done
summary: T33. Undo and redo (keys and buttons) step through the edit list, a card drops its own edit while later ones stay applied, and the redo history persists in edit-list.json.
spec: docs/tickets-review-edit.md T33 (#35); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: A snip made by mistake can only be fixed by Discard, which throws away every edit.
- Why: Edits are cheap to try only if they are cheap to take back.
- Proposed outcome: Undo and redo (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y, and buttons) step through the list. A card's own Remove drops that edit and keeps the later ones. A reload restores the list and its undo and redo history.
- Affected: `server/core` (edit list), `server/http`, `web/src/api`, `web/src/review` (Edits panel, key handling).
- Constraints: Build to `docs/mockups/2026-10-05-review-edit.html`. Operations name things in source time, so a removal re-derives the result from the remaining list.
- Out of scope: Blade and reorder (T34), other operation kinds.
- Open questions: none.

## Goal

T33's three criteria met.

## Approach

- Core: `edit-list.json` becomes `{ base, operations, undo, redo }`; `undo` and `redo` are stacks of whole lists (max 100). Every add or removal pushes the previous list on `undo` and clears `redo`; `undoEdit` and `redoEdit` swap between the stacks. A removal is one more change, so it can be undone. A removal is refused if the remaining operations no longer apply. The file goes when the list and both stacks are empty. Older files without the stacks still read. The API list gains `canUndo` and `canRedo`.
- HTTP: `POST /edits/undo`, `POST /edits/redo`, `DELETE /edits/<id>`.
- UI: `useEdits` gains `remove`, `undo`, `redo`; the Edits tab shows the Undo and Redo row from the mockup and a Remove button on each card (shown on hover and on focus); Review handles Ctrl or Cmd with Z, Shift+Z and Y, except in a text field. The player's view follows the list because it is derived from it.

## Steps

1. Failing core tests, then core.
2. HTTP, client, UI.
3. Playwright in `snip-save.spec.ts` (port 4385, the footage sample): undo, redo, remove, reload.
4. Full checks.

## Risks

- A later operation depending on an earlier one: removal is validated by applying the rest.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, `rtk proxy npm run test:e2e`.

## Changelog

### 2026-10-05
- Plan created.
- Done. See the session summary.
