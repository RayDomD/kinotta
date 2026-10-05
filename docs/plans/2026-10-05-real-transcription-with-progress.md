---
title: Real transcription with progress (T43)
date: 2026-10-05
status: Done
summary: T43. A reel started from a video returns at once; faster-whisper runs in the background with progress and an estimate, edits collect without a version, and v1 (with captions and automatic sections) follows.
spec: docs/tickets-review-edit.md T43 (#45); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: Starting a reel from a video blocks until faster-whisper has finished, with no sign of progress, and nothing can be done with the reel meanwhile.
- Why: Transcribing a long video takes minutes; the footage is already there to watch and cut (E-decisions on start from video).
- Proposed outcome: The reel opens at once and plays; the Review tab shows how far the transcription is with an estimate; cuts and snips made meanwhile survive v1 arriving; when words are in the reel gets its transcript, captions, automatic sections and v1.
- Affected: `server/core` (runner, start, new transcription jobs, event), `server/http` (one route), `skill/kinotta/scripts/transcript.py`, `web/src` (Review lanes, Edits panel, App, New reel), e2e server and spec on port 4381.
- Constraints: Python only through the runner. The transcriber stays injectable. v1 is built by you. The edit list lives in the reel folder and is replayed onto v1.
- Out of scope: Drop a video (T42), brief reels (T45), the startup check for Python, ffmpeg and faster-whisper (T44), resuming a transcription after a server restart.
- Open questions: The section rule for a video just over three minutes (decided below).

## Goal

`startReel` returns at once; the background job reports progress and an estimate and ends with transcript, captions, sections and v1; edits made before v1 apply after it.

## Approach

- Script: `transcript.py --audio` prints one JSON line per segment (`{"progress": seconds, "duration": seconds}`) and one before the model loads. A video with no audio track gives no words instead of an ffmpeg error (the 12-second sample has no audio).
- Runner: `transcribeAudio` spawns the script and calls `onProgress(seconds)` for each progress line; `parseProgress` is exported for a test.
- Core: `Transcriber` gets an `onProgress` argument. `createTranscriptions` (`_internal/transcription.ts`) holds per-reel state in memory (`running | done | failed`, seconds processed, remaining estimate = remaining audio times elapsed over processed) and emits `transcription-progress` events through `Project.subscribe`. `Project.transcriptionProgress(slug)`, `Project.whenTranscribed(slug)` (for tests and callers that need the end), `GET /api/reels/:slug/transcription`.
- `startReel` writes reel.json and plan.json (no transcript key yet), starts the job and returns. The job writes `transcript.json` and the plan's `transcript` and sections under the reel lock, stages v1 and publishes it under the lock.
- Sections: `autoSections` gives one section (id `all`) unless the video is longer than 3 min 30 s; then a boundary near each 180 s multiple at the middle of the largest word gap within 30 s (the exact multiple when there is none), sections `part-1`, `part-2`, and so on. A tail shorter than 30 s is not made a section.
- No version yet: `newestVersionNumber` is 0 for a reel with none; the edit list works against the plan (base 0) and replays onto v1 through the existing replay; Save is refused with a reason until v1 exists.
- UI: the Review tab treats a reel with no version and with footage as editable; the lanes show the mockup's progress lane (percent and "about N s left") where the words will be, as a progressbar (an alert on failure); Save is disabled with a hint; the New reel screen no longer waits for the build.

## Steps

1. Core tests (progress, edits before v1, sections, long video, opt-in real run), script test for a silent video.
2. Runner, jobs, start, event, route.
3. Web: client, App, Review, Lanes, Edits panel.
4. Playwright `transcription.spec.ts` (port 4381); the existing start-from-video specs wait for v1.
5. Checks.

## Risks

- Progress and the estimate are in memory: after a server restart a reel mid-transcription has no v1 and no progress. Accepted for now.
- Review remounts when v1 arrives (the playhead returns to the start).

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, the opt-in `KINOTTA_REAL_WHISPER=1` test, e2e through a scratch config (transcription, new-reel, review, snip-save).

## Changelog

### 2026-10-05
- Plan created.

### 2026-10-05 (done)
- Built and checked; status Done. See docs/session-summaries/2026-10-05-real-transcription-with-progress-summary.md.
