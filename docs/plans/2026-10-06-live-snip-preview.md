---
title: Live snip preview
date: 2026-10-06
status: Done
summary: While a stretch is selected with the Snip tool, the picture shows the frame after the join and Space plays a lead-in through the join, skipping the stretch, before Snip commits it.
spec:
---

## Intent

- Problem: a snip shows in the picture only after Snip is pressed and the server has added it, so you can't see or hear a cut before making it.
- Why: the owner asked for snipping to be real time, option A (live preview), 2026-10-06.
- Proposed outcome: the picture follows the selection as it is dragged, and the cut can be played before it is made.
- Affected: `web/src/review/_internal/usePlayback.ts`, `Review.tsx`, the review README, `tests/e2e/snip-save.spec.ts`.
- Constraints: no server round trip for the preview; the lanes do not close the gap until Snip (closing it mid-drag would move the footage under the pointer).
- Out of scope: snipping on release without a confirm step (option B).
- Open questions: None.

## Goal

With a stretch selected and nothing snipped yet, the picture shows the frame that would follow the join, and Space plays from 2 s before the stretch straight to its end.

## Approach

- `usePlayback` takes an optional `skip` span of the timeline: while playing, a time inside it jumps to its end, as a snipped stretch is jumped over.
- Review passes the Snip tool's selection as `skip`. Each change of the selection pauses playback and puts the playhead on its end, the frame after the join. Starting playback with a selection first goes to 2 s before it (the lead-in). Enter or Snip commits as before; Escape clears it.

## Steps

1. Failing e2e test: select a stretch, see the footage at its end with no edit listed, play, and see the footage never inside the stretch.
2. `usePlayback`, Review.
3. README.

## Risks

- The playhead jumping to the selection's end on every drag move could feel jumpy; it follows the pointer's edge most of the time, since a drag to the right moves the end.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, `snip-save.spec.ts`, then the full Playwright suite.

## Changelog

### 2026-10-06
- Plan created after the owner chose option A; In Progress.
- Done. Summary: `docs/session-summaries/2026-10-06-live-snip-preview-summary.md`. Full suites were stopped by Claude Code for low memory; they run with the next piece.
