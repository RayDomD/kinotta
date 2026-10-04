# Review tab plays a reel (T31, #33): run summary

Date: 2026-10-05. Branch: `feat/review-edit-phase` (local, not pushed). Plan:
`docs/plans/2026-10-05-review-tab-plays-a-reel.md`. Ticket: T31 in `docs/tickets-review-edit.md`.

## What shipped

- Core: `readVersion` now reports `pieces` (`{ in, out, at }`, from the version's own `plan.json`, else the reel's, else one
  piece over the whole reel), the transcript on the timeline (words in a snip are gone), and each shot's spoken line
  matched against that timeline transcript. This fixes the T29 gap (a shot's `line` is on the timeline, the transcript
  was in source time). A malformed plan falls back to one piece rather than failing the read.
- Stage: `PagePlayer` (a page frame seeked on every change without waiting for the draw, which reports the page's
  caption phrases from its `[data-caption]` scenes). `seekNow` split out of `seekPage`.
- `web/src/review/` (new module, replaces `web/src/Review.tsx`): the footage video under the page in the Gate well,
  transport with Doto timecode (`mm:ss.ff / total`), Space, Left/Right (Shift: a second), Home/End, `+`/`-`. The video's
  clock drives the timeline; `follow()` (pure, unit-tested) moves through the pieces in order and jumps over snips. A
  reel with no footage is driven by a clock; a reel with no version plays its footage alone.
- Lanes on one zoomable axis: overview (clips, or pieces; the window box and playhead; press or drag moves the window),
  Footage pieces with SNIP and CUT joints, Clips, Captions (the engine's own phrases), Words, Pins (click seeks), axis. One
  playhead across the zoomed lanes; dragging scrubs; the window follows the playhead; choosing a section moves it.
- Tests: `tests/core/version-pieces.test.ts` (6), `tests/web/timeline.test.ts` (16; `vitest.config.ts` now includes
  `tests/web`), `tests/e2e/review.spec.ts` (3, own server on port 4386): pick a video and play, pause, Space, frame steps,
  caption on the frame, scrub; zoom and overview in step; a v2 with a snipped plan skips the snip while playing.

## Decisions and deviations

- Editing tools (Select, Blade, Snip), the Edits panel and the pins' element/word editing are absent, as asked. SNIP and CUT
  joints are drawn read-only from the pieces.
- Lane and frame sizing: the frame is capped at 36vh wide-by-16:9 (the mockup's 46vh left the lanes below the fold at 720px).
- CSS lives in `web/src/review/review.css`, not `styles.css`, so parallel edits there do not collide. The old
  `.rv-review` placeholder rules in `styles.css` are now unused and left for whoever next edits that file.
- Review shows no "ready" notice for a new version (the rail's version row carries it); the Storyboard keeps its notice.
- The GitHub issue (#33) criteria were ticked.
- Not done, by scope: the pins' time is the pin's own `time` (timeline); comment carry-forward through pieces is T32.

## Checks

- `npm run typecheck`: clean.
- `rtk proxy npm test`: 23 files, 204 tests passed.
- `rtk proxy npm run test:e2e`: 84 passed (run under the e2e lock).
