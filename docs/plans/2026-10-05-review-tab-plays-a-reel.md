---
title: Review tab plays a reel (T31)
date: 2026-10-05
status: In Progress
summary: T31. The Review tab plays a reel in the Gate well: footage, clips and captions together, following pieces and skipping snips, with lanes on a zoomable axis under an overview.
spec: docs/tickets-review-edit.md T31 (#33); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: A reel can only be looked at as stills. I cannot play it, scrub it or judge a cut by watching.
- Why: Every edit tool after this (Snip, Blade, word and clip edits) needs a playhead on a real timeline.
- Proposed outcome: The Review tab shows the reel in the Gate well and plays footage, clips and captions together. Lanes (overview, Footage pieces, Clips, Captions, Words, Pins, axis) share one zoomable axis. Space plays, arrows step frames, dragging scrubs, the timecode reads in Doto.
- Affected: `server/core` (version read: pieces, timeline words, spoken line), `web/src/stage` (a playable page frame), a new `web/src/review` module, `App.tsx` (import and props), styles.
- Constraints: Build to `docs/mockups/2026-10-05-review-edit.html`; classes prefixed `rv-`; the UI touches a version page only through `stage`; leave `NewReel.tsx` alone; editing tools stay absent (T32 adds Snip and Save).
- Out of scope: Snip, Blade, Edits panel, Save, word and clip editing, element drag, drop of a video, transcription progress.
- Open questions: none; decisions below.

## Goal

T31's five criteria met.

## Approach

- Core: a version carries `pieces` (`{ in, out, at }`, source seconds and timeline start) read from the version's own `plan.json`, else the reel's; no plan means one piece over the whole reel. `transcript` and each shot's spoken line are on the timeline (words in a snip are gone), fixing the T29 gap where a shot's `line` (timeline) was matched against source-time words.
- Stage: `PagePlayer` loads the page like a still but seeks without waiting, once per animation frame, and reports the caption phrases it finds in the page (`[data-caption]` scenes), so the Captions lane shows the engine's own phrase breaks.
- Review module: `timeline.ts` is pure (piece lookup, playback step that follows pieces and skips snips, zoom window); `usePlayback` drives a `<video>` of the footage (or a clock when the reel has none) and publishes the timeline time; lanes draw only what falls in the zoom window; the overview shows the whole reel with the window and playhead; the window follows the playhead.
- Decisions: one `time` state at animation-frame rate, lanes memoised so only the playhead and the current phrase and word re-render; Space and arrows are ignored while typing; arrows step one frame at 30 fps (shift: one second); a reel with no version yet plays its footage alone.

## Steps

1. Failing tests: core (pieces, timeline transcript, spoken line), pure timeline (web), e2e (pick a video, play, pause, step; a snipped version skips).
2. Core read.
3. Stage player, review module, CSS.
4. Full checks.

## Risks

- Video seeks across a join are not instant; the step re-seeks only when the next piece does not start where the last ended.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, `rtk proxy npm run test:e2e`.

## Changelog

### 2026-10-05
- Plan created.
