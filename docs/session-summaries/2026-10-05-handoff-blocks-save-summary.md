# A hand-off blocks Save (T41, #43): run summary

Date: 2026-10-05. Branch: `feat/review-edit-phase` (local, not pushed). Plan: `docs/plans/2026-10-05-handoff-blocks-save.md`.

## What shipped

- Hand-off: copying a batch (`copyBatch`, whole reel or one section) writes `reels/<slug>/handoff.json`. It holds while its version is the newest; a newer version ends it. `cancelHandoff(slug)` and `DELETE /api/reels/:slug/handoff` end it early.
- Save: the `batchOut` stub is gone; Save throws `invalid` with "A comment batch for v<n> is out. Save is off until the next version appears or you cancel the hand-off. Edits still collect." (no agent named). `EditList.handedOff` carries the reason; operations still collect.
- Replay: an edit list on an older version is replayed onto the newest one's sources when `version-added` is heard (the settling hook in `server/core/index.ts`, after comment carry-forward) and on any later read. Each operation is checked in order; one whose target is gone (clip id, word, piece index, element, scene) stays in the list, flagged with the reason (`EditList.flagged`). Undo history is dropped, the base moves to the new version.
- Panel: the hand-off note with Cancel hand-off; flagged cards dashed, saying why and to remove or redo; flagged edits are not previewed; positions on cards come from the edits that apply.
- Tests: `tests/core/handoff.test.ts` (4: block, cancel, replay with one gone target through the watcher, replay on read), `tests/e2e/handoff.spec.ts` (1, port 4382).

## Decisions and deviations

- Flagged edits block Save (not excluded). Silent exclusion would build a version missing an edit the owner asked for.
- The hand-off is not cleared when a version lands; it is simply not in force once its version is not the newest. Nothing to forget.
- A list that cannot be replayed (unreadable sources) stays `stale` as before.
- Bug caught by e2e and fixed before commit: `readEditList` now takes the reel lock, and `discardEdits` called it inside the lock (deadlock); it uses the unlocked read.
- The Playwright spec seeds the comment, the edit and the batch copy through the HTTP API (the copy button flow is batch.spec's), then drives Save, the note and Cancel in the UI.

## Checks

- `npm run typecheck`: clean.
- `rtk proxy npm test`: 29 files, 301 tests passed.
- Scoped e2e (scratch config outside the repo, own servers on 4382, 4383, 4384, 4385, none of 4398/4399, all stopped): handoff, clips, snip-save, code-only: 11 passed. Full `npm run test:e2e` not run (orphaned servers on 4398/4399).
