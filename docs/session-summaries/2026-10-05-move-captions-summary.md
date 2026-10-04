# Move captions (T37, #39): run summary

Date: 2026-10-05. Branch: `feat/review-edit-phase` (local, not pushed). Plan: `docs/plans/2026-10-05-move-captions.md`.
Ticket: T37 in `docs/tickets-review-edit.md`.

## What shipped

- Plan fields: `captions: { position: { x, y }, phrases: [{ at, x, y }] }` (look and colour stay beside them; `true` becomes an object on the first move). Pixels of the 1920x1080 page, an offset from the default place.
- Engine: `build.py` writes `translate:<x>px <y>px` on the `.caption` element, only for a phrase whose offset is not zero, so a plan without positions builds the same page (drift test unchanged, the committed footage sample needed no rebuild). A phrase is found by its first word's source start (within 5 ms; `timeline_words` keeps it as `at`), so snips and reordering do not lose it. CSS `translate` stacks with the caption's `transform` and any animation.
- Core: operations `caption-position { x, y }` and `caption-phrase-position { at, x, y }` in `edit-model.ts` (apply, `operationTouches`, `describeOperation`, edit list kinds). A move with captions off is `invalid`; a phrase position needs a word at `at`; an offset of 0, 0 removes the entry. `Version.captions` carries the version plan's captions so the editor knows the saved offsets.
- Editor: `PagePlayer` draws a handle over the caption on show, a sibling of the frame and never inside the page, applies the previewed offsets to the page's captions, and reports a drag (Alt held at press: one phrase) or an arrow-key nudge (10 px, Shift 1 px, Alt for the phrase). The Captions lane marks a phrase with its own position with the mockup's diamond. The Edits panel lists "Captions · all captions" and "Moved one caption to x, y".
- Tests: `tests/engine/captions.test.ts` +5, `tests/core/edit-model.test.ts` +5, `tests/core/snip-save.test.ts` +2 (real build: Save writes both into the plan and the v2 page; v1 untouched), `tests/web/edited.test.ts` +4, `tests/e2e/snip-save.spec.ts` +1 (port 4385).

## Decisions

- The two offsets add: a phrase sits at the reel-wide offset plus its own, so dragging all captions also carries a phrase nudged on its own. The reel-wide operation replaces the previous one (absolute); a phrase operation replaces that phrase's entry.
- If a phrase's first word is re-timed, its position follows the word (a `word-timing` re-keys the entry, in Save and in the editor's preview). If a re-time or snip changes which word opens a phrase, the entry matches no first word and is not applied; it is kept in the plan.
- Phrase positions are keyed by source time, so they survive snips, cuts and reordering.
- Keyboard nudges are one operation each (the Edits panel shows one card per press).

## Checks

- `npm run typecheck`: clean.
- `rtk proxy npm test`: 26 files, 264 tests passed.
- `rtk proxy npm run test:e2e`: not run. e2e written, not run (ports 4398/4399 held by orphaned servers). The spec typechecks. Separately, with a scratch config that starts only the snip-save server on its own port 4385 (no reused servers), the new caption test passed; the rest of that file ran 5 passed and 1 failed: the T36 test "a word is fixed in place" times out waiting for the "Word text" input after a double-click. It fails the same way with this ticket's changes stashed, so it is a T36 e2e defect that was never run, not caused here.

## Not done

- The skill's rules for caption positions are T46's.
