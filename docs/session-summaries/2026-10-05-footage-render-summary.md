# Final and Overlay, and footage reels: summary

Date: 2026-10-05. Ticket T50 (#52). Plan: `docs/plans/2026-10-05-footage-render.md`.

## Shipped vs planned

Shipped as planned.

- `render.js` gains `--info` (the page's size, length and transparency, no render), `--codec rgba` (uncompressed
  frames in NUT, for a pipe) and an output of `-` (video to stdout, text to stderr). With an explicit codec the
  background stays clear unless the codec is `h264`.
- `runner.ts` gains `pageInfo`, `probeFootage`, `compositeArgs` and `renderOverFootage`. A footage Draft or Final
  starts `render.js` writing RGBA to stdout and ffmpeg reading it from stdin. ffmpeg cuts the original footage by the
  version's pieces (`trim`/`atrim`, `concat`), joins the audio with 20 ms fades either side of each cut (Smooth) or
  none (Hard), and lays the frames on top. Nothing is written in between. If either process fails, the other is killed.
- `render.ts` covers all three presets for both kinds of reel. Draft is half size, CRF 28 and no blur. Final is full
  size, CRF 16 with blur. Overlay is ProRes 4444 `.mov` with no sound. Code-only reels render at the page's size and
  30 fps. Footage reels render at the footage's size and frame rate, with the pieces from `readVersion`, so a frozen
  version keeps its own plan. `RenderRequest.audio` picks Smooth or Hard, and Hard adds `-hardcuts` to the name.
- An Overlay of a code-only page that isn't transparent is refused (`invalid`) before it is queued.
- `composite.py` is deleted. `motion-broll.md` takes its preview from a Draft render, and `engine-api.md` says the
  composed page holds a clip's last frame.

## Deviations

- **Dropped frames in `render.js`, found by the Overlay test.** Chromium writes RGB PNGs while a page is fully covered
  and RGBA PNGs otherwise. When the format changes, ffmpeg rebuilds its filters and drops frames: the Overlay had 69 of
  its 97 frames, and the piped Final's overlay ran early by the lost frames. `-reinit_filter 0` fixes it and is passed
  whenever `--codec` is given, so the skill's default command line is unchanged.
  - The same drop can hit the skill's default run on an alpha clip that is sometimes fully covered. Fixing the default
    is the owner's call, since T49 promised that run stays as it was.
  - `tests/engine/render.test.ts` guards the fix: it fails at 5 of 9 frames without it.
- **Fidelity is a tolerance, not exact equality.** The `engine-compose` check compares screenshots exactly, but a video
  frame is lossy. The tests compare the rendered frame with the page screenshot laid over the footage frame, using a
  mean difference of under 4 per channel out of 255. The same check against the unmapped time, and against a second
  later inside the clip, must exceed it.
- **Render-to-render variation.** Once, two Drafts of the same version differed in the frames where a clip animates;
  the next two were identical. The "later edit" test therefore compares duration and sampled frames within the
  tolerance rather than exact hashes.
- `footageFile` returns the browser playback copy of an HEVC or ProRes original, so the render reads the reel's
  original footage path instead.
- The per-diff review ran inline. It added the guard for a footage version with no pieces.

## Checks

- typecheck: clean.
- vitest: 41 files, 389 passed, 1 skipped. New: `tests/core/render-footage.test.ts` (8), and `tests/engine/render.test.ts`
  now has 5.
- Playwright full suite: 100 passed, 2 failed, 1 did not run. The failures (`section-batches.spec.ts:88`,
  `transcription.spec.ts:22`) pass when run alone (4 passed), so they are load flakes. A first attempt hit leftover
  e2e servers from an interrupted run holding the ports; they were stopped and the suite rerun.
