---
title: Edit a caption in the frame, live
date: 2026-10-06
status: Done
summary: Double-click a caption in the picture and retype the phrase (fix, add or remove words); a phrase-text operation, previewed live in the page with word edits from the Words lane.
spec:
---

## Intent

- Problem: a caption's text can only be changed one word at a time in the Words lane, a word cannot be added or removed, and the picture keeps the old caption until Save.
- Why: the owner asked to edit the words and text of a caption group directly, without comments, and for the editor to be live (2026-10-06).
- Proposed outcome: double-click the caption on show, retype the whole phrase, and the picture, the Captions lane and the Words lane show it at once. Save writes it into the transcript.
- Affected: `server/core/_internal/edit-model.ts`, `edit-list.ts`, `server/core/model.ts`, `web/src/stage/_internal/PagePlayer.tsx`, `web/src/review/_internal/Review.tsx`, `Player.tsx`, `edited.ts`, `review.css`, the stage and review READMEs, `CONTEXT.md` is unchanged (no new term), tests.
- Constraints: an edit-list operation like any other (undo, Edits card, Save, hand-off). The page is changed only in memory. Pages built before this work must preview too, so no engine change.
- Out of scope: re-grouping phrases in the preview (the engine regroups on Save); editing a caption on a code-only reel.
- Open questions: None.

## Goal

A `phrase-text` operation replaces a phrase's words; the picture, Captions lane and Words lane show it and any word fix before Save; undo puts it back.

## Approach

- **Operation.** `phrase-text { from, to, text, was? }`: the words with `start >= from` and `end <= to` (source seconds, within `MIN_SNIP`) become the words of `text`. The same count keeps each word's timing; another count spreads the new words over the old span in proportion to their length (a letter plus one for the gap). Empty text removes the words. Refused when no word is there or the text is unchanged. `operationTouches` by overlap; the card reads `Caption: Changed “…” to “…”`.
- **Preview.** Review works out each page phrase's edited words: the saved words in that phrase's source span with the word and phrase operations applied, placed on the saved page's timeline. A phrase that differs is passed to `PagePlayer` as `captionWords[i]`; the player swaps that caption's word spans (keeping the built markup to restore) and, because the engine caches each caption's spans at load, marks `said` and `now` on the swapped spans itself after each seek, with the engine's hold. An emptied phrase hides its caption. The Captions lane shows the edited text.
- **Editing.** Double-click the caption handle (or Enter on it) opens a text field over the caption with the phrase's current text. Enter adds `phrase-text`, Escape or blur cancels.

## Steps

1. Failing tests: `edit-model.test.ts` (same count, more, fewer, empty, refusals, touches), `edited.test.ts` (phrase words), an e2e test in `snip-save.spec.ts` (retype a caption with an extra word, see it in the page before Save, undo).
2. Core, then stage, then review.
3. READMEs.

## Risks

- Save regroups phrases from the edited words, so a long rewrite may split into two captions in the next version.
- A word re-timed out of its phrase's span is not counted in that phrase's preview.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, the new e2e test, then the full Playwright suite.

## Changelog

### 2026-10-06
- Plan created after the owner approved it in conversation; In Progress.
- Done. Summary: `docs/session-summaries/2026-10-06-edit-captions-in-the-frame-summary.md`.
