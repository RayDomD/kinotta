# A real engine clip in the footage tests (T21): run summary

Date: 2026-10-04. Branch: `feat/storyboard-phase` (local, not pushed). Plan:
`docs/plans/2026-10-04-engine-footage-sample.md`. Ticket: T21 (#24), criteria ticked in `docs/tickets.md`.

## What shipped

- `tests/fixtures/projects/footage-project/motion/`: `plan.json` and four clip fragments (two cutaways,
  two panels) at the old scene times, with ids carrying the old element names (`laptop-left`,
  `document`, `conflict-panel`, `lww-panel`, `edit-a`, `merged`, …).
- `reels/founder-talk/v1/index.html` is now `build.py --plan motion/plan.json` output (179 KB, fonts inlined).
- `tests/engine/compose.test.ts`: the committed page must equal a fresh build from the plan.

## Deviations

- The ticket names "the panel"; the whole page is engine-built, cutaways included, since a composed page
  is all engine clips.

## Checks

- `kinotta check founder-talk` clean. Typecheck clean, `npm test` 142/142, `npm run test:e2e` 77/77,
  including the footage, word-pin and section-batch specs, and the existing test that a click on the
  panel pins `conflict-panel` while a click on the footage pins a position only.
- Viewed both sections in the editor: cutaways alone, panels drawn over the footage.
