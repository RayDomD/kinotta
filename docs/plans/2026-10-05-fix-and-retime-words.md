---
title: Fix and re-time words (T36)
date: 2026-10-05
status: Done
summary: T36. word-text and word-timing operations; the Words lane edits a word in place and re-times it by its edges; Save writes them into the reel's transcript so captions and spoken lines follow.
spec: docs/tickets-review-edit.md T36 (#38); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: A mis-transcribed or mistimed word can only be fixed by hand in transcript.json.
- Why: Captions and spoken lines come from the transcript; fixing it at the source is the point of the Review and Edit phase (E14).
- Proposed outcome: Edit a word in the Words lane, drag its edges to re-time it. Save puts both into the reel's transcript, so the next version's captions and spoken lines follow and earlier versions keep their own.
- Affected: `server/core` (edit model, edit list, sources, Save), `web/src/review` (Lanes, Review, Edits panel).
- Constraints: Build to `docs/mockups/2026-10-05-review-edit.html`. Phrase breaks stay automatic (the engine groups words).
- Out of scope: moving captions (T37), editing words inside snipped footage.
- Open questions: How an operation names a word (decided below).

## Goal

`word-text` and `word-timing` are operations in the edit list. They apply in the editor's preview and on Save.

## Approach

- A word is named by its start in source seconds at the moment the operation applies (within 5 ms). Later operations name it by its new start; removing an earlier re-time that a later edit depends on is refused by the existing re-derive check.
- `word-text { at, text, was? }` (`was` only words the Edits card). `word-timing { at, start, end }` is refused when backwards or when it overlaps a neighbour.
- Save already writes the edited transcript to the file `sources.ts` resolves and into the new version; the edit list's add and remove now validate against the transcript words as well as the plan (`readReelWords` moved to `sources.ts`).
- Editor: the saved version's words go back to source time, the word operations apply, and the result is placed on the edited timeline. Double-click or Enter edits text; grips on a word's edges re-time it (clamped to its neighbours).

## Steps

1. Core tests, then `edit-model.ts`, `edit-list.ts`, `sources.ts`.
2. Editor: Lanes (edit, grips), Review (words from operations), panel.
3. Playwright in `snip-save.spec.ts` (port 4385).
4. Checks.

## Risks

- A word that sits in a snipped stretch is not shown, so it cannot be edited.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, `rtk proxy npm run test:e2e` (blocked this run).

## Changelog

### 2026-10-05
- Plan created.
- Done. See the session summary.

## Follow-up 2026-10-05: e2e defect

The T36 test in `snip-save.spec.ts` timed out waiting for the "Word text" input. Cause: the zoomed lanes captured the pointer on every pointer-down, which retargets the click to the container, so a word never received its double-click (a real user could not open the editor with the mouse either). Fix: a press on a word (outside Snip) only seeks and does not capture. The word, grip and editor styles were also missing from `review.css` and were added from the mockup. The spec assumed a third word; the fake transcriber has two, so it now re-times the second word.
