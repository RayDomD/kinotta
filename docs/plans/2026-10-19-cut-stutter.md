---
title: Diagnose the stall at clip cuts
date: 2026-10-19
status: Draft
summary: Playback stalls on "Waiting for picture" when it crosses a Blade cut or a snip; reproduce it, measure it and report the cause before any fix.
spec:
---

## Intent

- Problem: After a Blade cut or a snip, playback stalls at the cut in the Media editor and in Review, even with no render running. "Waiting for picture…" shows and the whole timeline appears to lag.
- Why: The stall makes edited footage hard to judge.
- Proposed outcome: Playing across a cut is smooth in both surfaces.
- Affected: `web/src/review/_internal/PictureLayers.tsx`, `MediaEditor.tsx` (`waitingForPicture`, `playback.hold`), and Review playback.
- Constraints: Report the cause to the owner with evidence before any fix. Preview must keep matching render.
- Out of scope: Remove and snip timing (done in `2026-10-19-remove-leaves-gap.md`, which replaces Snip half of the earlier draft `2026-10-19-snip-gap-and-cut-stutter.md`).
- Open questions: The cause and the fix, decided after diagnosis.

## Goal

The cause of the stall at cuts is found and reported, with measurements.

## Approach

Hypothesis from code reading, unverified: `PictureLayers` mounts one `<video>` per placement, keyed by placement id, only while the playhead is inside it. At each cut the next placement mounts a cold element that must load, seek and reach `playing`. Until then `waitingForPicture` is true (`MediaEditor.tsx:307`) and `playback.hold()` stops the clock. A split or snip also gives the pieces new ids, so the element that was already playing is discarded too.

Run the real app with a real video. Split it with the Blade and play across the cut in the Media editor and in Review. Record `data-verify-waiting`, the video elements' seeking, waiting and stalled events with timestamps, and the media network requests. Candidate fixes to weigh after measuring: one warm element per source that seeks across cuts, or mounting the next placement's element shortly before the cut.

## Steps

1. Reproduce in the running app and record the measurements.
2. Report the cause and candidate fixes to the owner.

## Risks

- The stall may depend on the source codec or the playback copy, so measure with the footage the owner uses.

## Checks to run

- Manual Blade cut and snip playback in the running app, in both surfaces, with the event log above.

## Changelog

### 2026-10-19
- Plan created from the stutter half of the uncommitted draft in `.worktrees/snip-keeps-timing`.
