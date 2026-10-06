# Parallel segments and the estimate: summary

Date: 2026-10-06. Ticket T54 (#52). Plan: `docs/plans/2026-10-05-render-segments.md`.

## Shipped vs planned

Shipped as planned.

- **Segment count.** A render runs in one segment per two logical cores (8 on this 16-core machine), with each segment
  at least 60 frames, so a short render stays in one page and takes today's path. `openProject(dir, { renderSegments })`
  pins the count for tests.
- **Code-only pages and Overlays.** Each segment is `render.js --frames <from>:<to>` into
  `renders/.work-<job>/segment-<i>.<mp4|mov>`. The new runner call `joinSegments` concatenates them with ffmpeg's concat
  demuxer and `-c copy`.
- **Footage Draft and Final.** Each segment composites its overlay frames over its own stretch of the pieces
  (`piecesBetween`), video only. The join copies the video and encodes the sound once over all the pieces, through the
  same audio graph as a single-page render (`audioGraph`, split out of `compositeArgs`). No ProRes intermediate (R18).
- **Progress.** Segments report their own frames, and the engine sums them against the total, so the queue's existing
  percentage and estimate cover the whole render.
- **Failure and cancel.** Segments share an `AbortController` chained to the job's signal. The first failure stops the
  rest, and the render rejects with that reason once all have stopped. `.work-<job>/` is removed in a `finally`: after a
  finish, a failure or a cancel.

## Deviations

- **A segment's composite is capped at its frame count** (`-frames:v`). Its stretch of footage can round to one frame
  more than its overlay at rates like 25 fps, which made a segmented 1080p25 Draft 0.06 s long. The last segment is not
  capped and runs to the end of the pieces, as a single-page render does.
- **`renderFailure` also matches a plain `Error:`.** It matched only named errors such as `TypeError:`, so a page that
  threw `new Error(...)` was reported by the last lines of the stack instead.
- **T52's cancel test** now creates `.work-<job>/` only if it doesn't exist yet, since the showreel render now
  segments and makes the folder itself.

## For the owner

- **A crashed `render.js` can leave a Chromium GPU process running on Windows.** When the page throws, the script exits
  on the unhandled rejection without closing its browser. One such process was found and stopped after the
  failing-segment test. Single renders already behaved this way. The fix is a `try/finally` around the frame loop in
  the skill's `render.js`, which is your call because the skill's renderer is shared.

## Checks

- typecheck: clean.
- vitest: full run, 44 of 45 files and 426 tests passed, 1 skipped. The one failure is the 5 s timeout in
  `handoff.test.ts` (no render code), which passes alone; it is fixed in the next commit and the suite rerun there. New: `tests/core/render-segments.test.ts` (4 tests) and a footage segments test in
  `render-footage.test.ts`; the segment ones were seen failing first.
- Playwright: not run; no UI code changed.
