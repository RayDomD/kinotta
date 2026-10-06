---
title: Parallel segments and the estimate (T54)
date: 2026-10-06
status: Done
summary: A render splits its frames across several Chromium pages that run at once in renders/.work-<job>/, then joins them; progress combines the segments and gives an estimate.
spec: docs/specs/2026-10-05-approve-and-render.md
---

## Intent

- Problem: a render draws every frame in one Chromium page, one after another, so a long reel takes as long as its frames take in sequence, however many cores the machine has.
- Why: the spec's Speed section and R18 call for parallel segments, with workers set by the CPU and not by the owner.
- Proposed outcome: the engine splits the frame range into segments, renders them at once in `renders/.work-<job>/`, and joins them into the same file a single page would make. Progress sums the segments into one percentage and estimate.
- Affected: `server/core/_internal/render.ts`, `runner.ts`, `index.ts` (a test-only option), the core README.
- Constraints: R18 (no ProRes intermediate for a footage Final; `.work-<job>/` removed on finish, cancel and failure). Process starts stay in `runner.ts`. `render.js` already takes `--frames <from>:<to>` and needs no change.
- Out of scope: Picker's queue display (T55, T56).
- Open questions: None.

## Goal

A render split into segments matches the single-page render frame for frame within tolerance; progress events carry a combined percentage and an estimate; `.work-<job>/` is removed on finish, cancel and failure.

## Approach

**How many segments.** Workers are half the logical cores (`os.availableParallelism() / 2`, at least 1): each worker is a Chromium page plus an ffmpeg encoder. A segment is at least 60 frames, so a short render stays in one page and skips the start-up cost. One segment means today's path, unchanged. `openProject(dir, { renderSegments })` pins the count for tests, like `transcriber`; it is not a user setting.

**Frame count.** The engine computes the frame total as `render.js` does, `Math.round(duration * fps)`, and splits it into near-equal contiguous ranges.

**Code-only page, and any Overlay.** Each segment is a `renderPage` with `frames: [from, to]` into `.work-<job>/segment-<i>.<mp4|mov>`. A new runner call, `joinSegments`, concatenates them with ffmpeg's concat demuxer and `-c copy` into the temp output. Each segment starts on a keyframe and was encoded with the same settings, so the join copies without re-encoding.

**Footage Draft and Final.** Each segment pipes its overlay frames into its own ffmpeg composite, video only, over the footage pieces cut to that segment's timeline window (`[from / fps, to / fps)`; the last segment runs to the end of the pieces). The join then concatenates the video segments with `-c copy` and encodes the audio once over the whole set of pieces, with the same filter graph as today (`audioGraph`, split out of `compositeArgs`), so the cut fades sit exactly where a single-page render puts them. No ProRes intermediate.

**Progress.** Each segment reports its own frames; the engine reports the sum against the total, so the queue's existing percentage and `estimateRemaining` cover all segments.

**Failure and cancel.** The segments share an `AbortController` chained to the job's signal. One segment failing aborts the rest, and the render rejects with that segment's reason. `runRender` already removes `.work-<job>/` on failure and cancel. It now also removes it after a successful join.

## Steps

1. Tests first: `tests/core/render-segments.test.ts` (code-only segmented vs single, frame for frame; footage Final segmented vs single, frames and the audio at a cut; combined progress with an estimate; `.work-<job>/` gone after finish, after a failed segment, and after cancel). See them fail.
2. Runner: `frames` on `PageRender`; `audioGraph`; `joinSegments`.
3. Engine: segment count, ranges, sub-pieces, parallel runs, progress, join, cleanup.
4. Core option, README.

## Risks

- H.264 segments from separate encodes must concatenate cleanly. The test compares the segmented and single renders frame by frame, and checks the frame count.
- Eight Chromium pages at once may be heavy on a smaller machine. Half the logical cores is a conservative start.

## Checks

- typecheck, full vitest. No UI change, so no Playwright run.

## Changelog

- 2026-10-06: Plan written, In Progress.
- 2026-10-06: Done. Segment composites capped at their frame count. Summary: `docs/session-summaries/2026-10-05-render-segments-summary.md`.
