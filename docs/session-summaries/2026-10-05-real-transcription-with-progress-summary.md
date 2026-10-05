# Real transcription with progress (T43, #45): run summary

Date: 2026-10-05. Branch: `feat/review-edit-phase` (local, not pushed). Plan: `docs/plans/2026-10-05-real-transcription-with-progress.md`.

## What shipped

- `transcript.py --audio` prints JSON progress lines (`{"progress", "duration"}`) per segment and one before the model loads. A video with no audio track now gives an empty transcript instead of an ffmpeg failure.
- Runner `transcribeAudio(video, out, onProgress)` spawns the script and parses those lines. `Transcriber` takes `onProgress(seconds)`.
- Core: `startReel` returns as soon as `reel.json` and `plan.json` exist. A background job (`_internal/transcription.ts`) reports `Project.transcriptionProgress(slug)` (state, seconds done, remaining estimate, error), emits `transcription-progress` events, and ends by writing `transcript.json`, the plan's transcript and sections, then v1 with `builtBy: "you"`. `Project.whenTranscribed(slug)` resolves when the job ends. HTTP `GET /api/reels/:slug/transcription`.
- Sections: one (`all`) for a video up to 3:30; longer ones split about every 180 s at the middle of the largest word gap within 30 s of each boundary (`part-1`, `part-2`, ...). The last section is at least 30 s.
- A reel with no version takes edits against its plan (base 0). They replay onto v1 on arrival, as for an agent-built version. Save is refused until v1 exists.
- UI: Review opens at once on the footage; the lanes show the mockup's progress lane ("Transcribing with faster-whisper · about N s left · you can cut and snip now", a progressbar; an alert if it failed), Save is disabled with a hint, then v1 arrives and the lane gives way to captions and words. The Storyboard tab says the reel is being transcribed.
- Tests: `tests/core/transcription.test.ts` (10 plus one opt-in), `tests/web/transcribing.test.ts` (4), `tests/engine/scripts.test.ts` +1 (silent video), `tests/e2e/transcription.spec.ts` (port 4381, a transcriber that holds its words until the spec releases them). `start-reel.test.ts`, `snip-save.test.ts` and the new-reel, review and snip-save specs now wait for the background job.

## Decisions and deviations

- The 12-second sample has no audio track, so the opt-in test (`KINOTTA_REAL_WHISPER=1`) adds a voice to a copy with ffmpeg's flite filter (needs libflite) and runs the real model on that. The picture is the sample's own.
- A video just over three minutes stays one section: a tail under 30 s is not made a section (E12 says "about").
- Progress lives in memory only. After a server restart a reel that was mid-transcription stays without a version; there is no resume (not in the ticket).
- Review remounts when v1 arrives (the playhead goes back to 0).
- `newestVersionNumber` returns 0 for a reel with no version.

## Checks

- `npm run typecheck`: clean.
- `rtk proxy npm test`: 31 files, 316 passed, 1 skipped (the opt-in one).
- Opt-in `KINOTTA_REAL_WHISPER=1 npx vitest run tests/core/transcription.test.ts -t "real faster-whisper"`: passed (faster-whisper 1.2.1, model cached, 14 s). Real progress lines were seen, the words include "hello", v1 was built.
- Scoped e2e (scratch config outside the repo, ports 4381, 4385, 4386, 4389, all stopped afterwards): transcription, new-reel, review, snip-save: 12 passed. The full `npm run test:e2e` was not run (ports 4398/4399 held by orphaned servers).
