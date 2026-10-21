---
title: Simple mode frame and agent run timer
date: 2026-10-21
status: Done
summary: Preview simple-mode reels in their real shape instead of a fixed portrait frame, and show a live timer while an agent run works.
spec:
---

## Intent

- Problem:
  - Simple mode always previews in portrait. Both frames are fixed at 9:16 in `web/src/simple.css`
    (`.sm-preview-frame` line 70, `.sm-preview .rv-picture-stage > .rv-frame` line 85), whatever the
    footage is. The rest of Kinotta builds reels at 1920x1080, so a landscape video is previewed in a
    shape it will never render in.
  - When Claude Code or Codex runs, the owner can't see how long it has been working. A timer exists
    (`Adding b-roll… (12s)`, `web/src/SimpleMode.tsx:575`), but it is plain seconds inside the title
    text and only changes on the 3 s poll (`SimpleMode.tsx:430`). The owner reported not seeing it
    (2026-10-21); whether it rendered in their session is unverified.
- Why: The owner is reviewing simple mode to decide what to improve. A preview in the wrong shape and
  a run with no visible progress both make the screen misleading.
- Proposed outcome: The simple-mode preview has the same shape as the reel it shows. While an agent
  run is active, a clearly visible timer counts up every second; when the run ends, its total time
  stays visible.
- Affected: `web/src/SimpleMode.tsx`, `web/src/simple.css`, the simple-mode e2e test, possibly the
  b-roll plan preview in `web/src/simple-options.ts`.
- Constraints: Detailed Review and the editor stay unchanged. No server API change unless the reel's
  frame size is not already available to the web client. Existing reels open as they do now.
- Out of scope: Cropping a reel to a different shape (for example landscape footage to a 9:16 reel).
  The owner wants that option, but Kinotta cannot build or render a portrait reel yet; that is
  `docs/plans/2026-10-18-portrait-reels.md` (Draft). Once that lands, a "Crop to portrait/landscape"
  choice in simple mode becomes a follow-up here.
- Open questions: none blocking. Owner decisions 2026-10-21: preview matches the video (crop later),
  "runtime" means the agent run timer.

## Goal

1. The simple-mode picture frame and the b-roll plan preview use the reel's frame shape (16:9 today
   for every reel, since that is what Kinotta builds), not a hard-coded 9:16.
2. While an agent run is queued, running, validating or cancelling, a visible `m:ss` timer next to
   the status ticks every second. A finished, failed or copy-ready run shows its total time.

## Approach

**Frame.** Replace the fixed `aspect-ratio: 9 / 16` rules with a CSS variable (`--sm-frame-ratio`)
set from the reel's frame. Read that from what the client already has for the reel (the Review frame
already uses 16:9, `.rv-frame` in `web/src/review/review.css`); default to 16:9. Size the frame by
width with a height cap so landscape fits the column, instead of the current `58dvh * 9 / 16` width
rule. When portrait reels ship, setting the variable from the reel is the only change needed.

**Timer.** Keep the server's `elapsedSeconds` and `createdAt` as the source of truth. In the client,
compute elapsed time from the job's start and tick a local 1 s interval while the job is active, so
the display moves between 3 s polls without extra requests. Format with the existing `formatClock`
(`web/src/timecode.ts`). Show it as its own element in the agent banner, not inside the title string.
On a finished state, show "took m:ss" from the server's final `elapsedSeconds`.

## Steps

1. Confirm in the browser how simple mode looks today with a landscape reel and during a Copy request
   run (screenshot both, before).
2. Frame: add `--sm-frame-ratio`, replace both 9:16 rules, fix the width/height sizing, check the
   b-roll plan preview frame.
3. Timer: add the ticking elapsed display and the final duration in `SimpleMode.tsx`; style it in
   `simple.css`.
4. Extend `tests/e2e/simple-mode.spec.ts`: frame aspect matches 16:9 for a landscape reel; the timer
   text advances while a (fake) run is active and shows a total afterwards.
5. Typecheck, build, simple-mode and review e2e, then screenshots after.

## Risks

- The frame may need a reel-level size the client doesn't have yet; if so, fall back to 16:9 and
  note it rather than add a server field in this plan.
- A client tick that drifts from the server's count; mitigated by deriving from the start time, not
  by incrementing.

## Checks to run

- `npm run typecheck`, `npm run build`
- `npm run test:e2e -- tests/e2e/simple-mode.spec.ts tests/e2e/review.spec.ts`
- Before/after screenshots of the simple-mode studio at 1280x800 with a landscape reel, and of the
  agent banner mid-run.

## Changelog

### 2026-10-21
- Plan created from owner review of simple mode.
- Implemented the 16:9 studio and plan-preview frames and the per-second agent run timer; all completed states retain their server total. Goal still answers the Intent.
- Owner widened scope to remove only the forced portrait props in `Review.tsx` and, after the iframe check exposed the second path, `MediaEditor.tsx`. Both now use the existing 1920×1080 page viewport.
- Kept `.sm-app` as the scrolling container and changed its layout to block flow so the wider preview cannot overlap the request disclosure.
- Typecheck, build and all 11 Simple-mode/Review e2e checks pass, including frame dimensions, timer advancement between polls, terminal totals after reload, and 500px window scrolling.
- Saved screenshot evidence with baseline limitations recorded in the [session summary](../session-summaries/2026-10-21-simple-frame-and-run-timer-summary.md). Owner removed the Impeccable pass from this run; AGY owns that follow-up.
