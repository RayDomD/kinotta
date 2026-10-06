# Clip edits in the picture as you make them: summary

Date: 2026-10-06. Plan: `docs/plans/2026-10-06-live-clip-edits.md`. Asked for in conversation (options A and B, then "does it need to rebuild?").

## Shipped

- `PagePlayer` takes `clipTiming` and, before each seek, sets moved clips' scene `data-start` and `data-duration` in the
  live page, restoring the built values for the others. No rebuild: the engine reads them on every seek, and a trimmed
  clip plays from its own first frame, as a rebuilt page would.
- Review passes the edited spans of slid or trimmed clips, plus the clip being dragged, with the page offset at that
  moment so unsaved footage cuts still line up.
- The Clips lane reports a drag as it goes. Review pauses playback and puts the playhead on the dragged edge: the clip's
  new start, or a frame inside its new end. Dragging a footage piece scrubs to its first frame.

## Deviations

- The plan was written after the build, in one pass: the owner chose the approach in conversation.
- The new e2e test was not run red first. Its mid-drag check reads a page attribute nothing changed before this work.
- `picker.spec.ts` and `renders.spec.ts` got 30 s waits on the Overlay refusal and on a cancel. Both took more than 5 s
  under the full suite; neither touches this change.

## Checks

- typecheck: clean. vitest unit project: 374 passed, 1 skipped.
- Playwright: `clips.spec.ts` 3 passed (the new test slides clip 01 and checks the page mid-drag, after the drop, and
  after undo). Full suite: 106 passed, 2 failed on the timing above; after the two waits, those specs passed (4).
