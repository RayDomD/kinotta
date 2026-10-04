# Fix and re-time words (T36, #38): run summary

Date: 2026-10-05. Branch: `feat/review-edit-phase` (local, not pushed). Plan: `docs/plans/2026-10-05-fix-and-retime-words.md`.

## What shipped

- Core: `word-text { at, text, was? }` and `word-timing { at, start, end }` in `edit-model.ts`, with apply functions, `describeOperation` text and `operationTouches` (the section the word is in counts as changed). A word is found by its start in source seconds (within 5 ms); a missing word, empty text, a backwards re-time and an overlap with a neighbour are `invalid`. The edit list now validates adds and removals against the transcript words too, and `readReelWords` moved into `sources.ts` so Save and the list read the transcript the same way.
- Save: no change needed; it already writes the edited words to the transcript `sources.ts` resolves and into the new version, so the engine's captions and spoken lines follow. Phrase breaks stay automatic.
- Editor: in the Words lane, double-click or Enter opens a word's text (Enter saves, Esc cancels); grips on a word's edges drag to re-time it, clamped to its neighbours. Fixed words are underlined and re-timed words carry the left rule, as in the mockup. The preview applies the word operations over the saved words, then places them on the edited timeline.
- Tests: `tests/core/edit-model.test.ts` +3, `tests/core/snip-save.test.ts` +2 (E14: Save after a fix and a re-time shows the new word and timing in v2, in its spoken line and page, while v1 keeps its transcript; refusals and a dependent removal), `tests/e2e/snip-save.spec.ts` +1 (port 4385).

## Decisions and deviations

- Operations name a word by its current start, so a re-time followed by a text fix names the new start. Removing the re-time then is refused.
- Words inside snipped footage are not shown and cannot be edited.
- Edits panel cards show "Word" plus the timeline time; the text says "Changed “a” to “b”" or "Re-timed to start to end".

## Checks

- `npm run typecheck`: clean.
- `rtk proxy npm test`: 26 files, 248 tests passed.
- `rtk proxy npm run test:e2e`: not run. e2e written, not run (ports 4398/4399 held by orphaned servers). The new spec typechecks.
- The committed footage sample needed no rebuild (engine unchanged).
