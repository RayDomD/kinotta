# Live snip preview: summary

Date: 2026-10-06. Plan: `docs/plans/2026-10-06-live-snip-preview.md`.

## Shipped

- `usePlayback` takes a `skip` span of the timeline and jumps over it while playing.
- Review passes the Snip tool's selection as `skip`. A selection change pauses and shows the frame at its end, the
  frame the snip would join to; Play or Space with a selection starts 2 s before it. Snip or Enter commits as before.

## Deviations

- None from the plan. The full vitest and Playwright runs were stopped by Claude Code for low memory; they are run with
  the Review and Picker merge, the next piece on this branch.

## Checks

- typecheck clean. New e2e test (red first, then green). `snip-save.spec.ts` and `review.spec.ts`: 13 passed.
