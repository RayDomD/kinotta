# Edit a caption in the frame, live: summary

Date: 2026-10-06. Plan: `docs/plans/2026-10-06-edit-captions-in-the-frame.md`.

## Shipped

- `phrase-text { from, to, text, was }` in the edit model: the phrase's words become the new text. The same count keeps
  each word's timing; another count spreads the words over the old span by length; empty text removes them. Save
  needed no change: it already writes the edited transcript.
- `PagePlayer` takes `captionWords` and swaps an edited caption's word spans before each seek, then marks `said` and
  `now` itself (the engine caches spans at load). It takes `onCaptionText`: double-click or Enter on the caption handle
  opens a field over the caption; Enter adds the edit, Escape cancels.
- Review works out each phrase's edited words (`phraseTexts` in `edited.ts`), so word fixes from the Words lane also show
  in the picture before Save, and the Captions lane shows the new text.

## Deviations

- The `phraseTexts` tests were written with the function, not run red first.

## Checks

- typecheck clean. vitest 440 passed, 1 skipped. A first run had one failure, and a second run, made while Playwright
  was running, had two (`editing.test.ts` timeout, `render-footage.test.ts` screenshot). Both files pass alone.
- Playwright: `snip-save.spec.ts` 9 passed (new retype test; the word-fix test now checks the picture). Full suite
  106 passed; `brief-reel.spec.ts` and `storyboard.spec.ts` failed under that load and passed alone (12 of 12).
