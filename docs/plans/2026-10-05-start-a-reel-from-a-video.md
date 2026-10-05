---
title: Start a reel from a picked video (T30)
date: 2026-10-05
status: Done
summary: T30. A New reel choice lists the project's videos; picking one writes the reel, transcribes it, builds v1 with builtBy you through one Python runner module, and opens it in Review.
spec: docs/tickets-review-edit.md T30 (#32); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: A reel can only start from a terminal and an agent; there is no way to start one from a video in Kinotta.
- Why: Kinotta becomes a standalone editor (E1); everything after this ticket (Review, Snip, Save) needs a reel that Kinotta made.
- Proposed outcome: The rail has a New reel choice. Its screen lists the project's videos with length, codec and size. Picking one, with an editable name from its file name, writes the reel and its first version, and opens it in Review.
- Affected: `server/core` (runner, videos, start-reel, `openProject`), `server/http`, `web/src` (rail, New reel screen, phase tabs, Review placeholder), `skill/kinotta/scripts/shots.py` (no change expected), tests.
- Constraints: The video is left where it is, never copied or altered. Python is called only through one runner module (E3). The transcriber is injectable; tests pass a fake. Its progress and estimate UI is T43.
- Out of scope: drop and copy of a video, HEVC/ProRes copies, automatic sections, the real Review tab (T31), transcription progress (T43), start from a brief.
- Open questions: none; decisions below.

## Goal

T30's five criteria met.

## Approach

- `server/core/_internal/runner.ts`: the only place that starts a subprocess for the skill's scripts or ffprobe. Four functions: `buildPage`, `buildShots`, `transcribeAudio`, `probeVideo`. Later tickets (Save, transcription) reuse it.
- `videos.ts`: `listVideos()` walks the project (not `reels/`, `node_modules`, dot folders), probes each video, returns path, length, codec, size and a suggested title from the file name.
- `start.ts`: `startReel({ video, title? })` writes `reels/<slug>/reel.json` and `plan.json` (one piece, captions on, no clips, one section), runs the transcriber, writes `transcript.json`, builds `v1/index.html`, then `shots.json` last (via a temp file so `builtBy: "you"` is in place when it appears).
- `openProject(dir, { transcriber? })`; the default transcriber runs `transcript.py --audio` through the runner.
- HTTP: `GET /api/videos`, `POST /api/reels`. UI: rail "New reel", New reel screen, phase tabs switch Storyboard and Review, placeholder Review view (T31 fills it).
- Decisions: the plan lives at `reels/<slug>/plan.json` (one per reel, next to its transcript); one section named for the reel until automatic sections land; a failed transcription keeps the reel without a version (the editor plays footage alone, per the spec) and reports the reason.

## Steps

1. Failing tests: core (list videos, start reel with a fake transcriber, check passes, runner-only Python), e2e (pick and open in Review).
2. Runner, videos, start, `openProject`, HTTP.
3. UI.
4. Full checks.

## Risks

- A footage reel with no clips may fail `kinotta check` or the contract scan; confirm with the real check.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, `rtk proxy npm run test:e2e`.

## Changelog

### 2026-10-05
- Plan created.
- Done. Added `startServer({ transcriber })` and a ninth e2e server (port 4389, fake transcriber) for `new-reel.spec.ts`.
