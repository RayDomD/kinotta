# Review and Edit code-review fixes: run summary

Date: 2026-10-05. Branch: `feat/review-edit-phase` (local, not pushed). Plan: `docs/plans/2026-10-05-review-edit-code-review-fixes.md`.

## What shipped

- P2: Save settles the new version's comments before it returns (footage and code-only).
- P3: a version with no plan of its own takes the nearest earlier own plan, else (newest only) the reel's plan, else is one whole-video piece.
- P6: `save-intent.json` journal around the source writes; the next edit-list read finishes or rolls back a cut-short Save. Crash windows tested by recreating the disk state at each step.
- P7: Save keeps every transcript field beside `words`, in the reel's file and the version's copy.
- P8: a code-only Save copies the page and its assets only.
- P9: `element-removed` comment state, shown as "Element removed".

## Deviations

- P6 journal rather than a reorder, reason in the plan. The code-only Save is not journaled (no source writes).
- P3: nearest-earlier-own-plan added to the brief's rule so an agent build after a Save keeps its pieces.

## Checks

- Typecheck clean. `npm test`: 326 passed, 1 skipped (33 files), 8 of them new in `tests/core/save-review-fixes.test.ts`, all failing before the fixes.
- Scoped e2e through a scratch config (ports other than 4398/4399, servers stopped after): 24 passed (snip-save, review, clips, code-only, handoff, transcription, new-reel, batch, section-batches). The full `npm run test:e2e` was not run.
