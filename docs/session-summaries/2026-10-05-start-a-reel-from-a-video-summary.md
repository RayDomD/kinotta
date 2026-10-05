# Start a reel from a picked video (T30, #32): run summary

Date: 2026-10-05. Branch: `feat/review-edit-phase` (local, not pushed). Plan:
`docs/plans/2026-10-05-start-a-reel-from-a-video.md`. Ticket: T30 in `docs/tickets-review-edit.md`.

## What shipped

- `server/core/_internal/runner.ts`: the only module that starts Python or ffprobe (`buildPage`, `buildShots`,
  `transcribeAudio`, `probeVideo`). A test fails if another server file names Python, `.py` or ffprobe.
- `Project.listVideos()` and `Project.startReel({ video, title? })`; `openProject(dir, { transcriber? })`. The default
  transcriber runs `transcript.py --audio` through the runner.
- `startReel` writes `reel.json` (title, footage) and `plan.json` (one piece, captions on, no clips, one section),
  runs the transcriber, writes `transcript.json`, builds `v1/index.html`, then `shots.json` last with
  `builtBy: "you"` (staged as a temp file and renamed). The video is not copied or touched. A failed transcription
  or build leaves the reel without `v1` and throws the reason.
- HTTP `GET /api/videos`, `POST /api/reels`. UI: rail "New reel", New reel screen (path, length, codec, size, editable
  name), phase tabs now switch Storyboard and Review, a minimal Review view (title, version, footage) for T31 to fill.
  A started reel opens in Review.
- `build.py`: `duration` now falls back to the longest clip only when the plan has none, so a plan with no clips builds.
- `startServer({ transcriber })` and a ninth e2e server (port 4389, fake transcriber) for `new-reel.spec.ts`.

## Deviations from the plan

- The smoke spec asserted Review was disabled; it now asserts Review is a tab.
- Transcription has no progress or time estimate; the screen says "Transcribing and building v1…" (T43).
- The GitHub issue (#32) criteria were not ticked from this run; the edit was blocked and is left to the owner.

## Checks

- `npm run typecheck` clean. `rtk proxy npm test` 182/182. `rtk proxy npm run test:e2e` 81/81.
- The first e2e run had one failure in `engine-compose.spec.ts` (pixel compare) that did not repeat on rerun, with
  another agent possibly running at the same time. Worth watching if it returns.
