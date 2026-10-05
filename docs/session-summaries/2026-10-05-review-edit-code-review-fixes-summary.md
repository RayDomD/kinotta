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

## Round 2

- P3: one `resolvePlan` for pieces, captions and clips: own plan, else newest takes the reel's plan, else an older version takes the nearest earlier own plan, else one whole-video piece. Fixes the newest version showing an earlier Save's pieces over the reel's current plan.
- P6: the journal records the operation ids; a Save counts as committed only when `v<n>` is Kinotta-built (`builtBy: you`) with those operations in its `edits.json`. An agent's `v<n>` after a crash rolls the sources back and keeps the list.
- P9: `element-removed` only when a valid scene plays at the pin's moment and `data-el="name"` is nowhere in the page text; script-created elements and timing-less scenes are never flagged.
- Checks: typecheck clean; `npm test` 332 passed, 1 skipped (33 files; one run showed two handoff tests timing out at 5s under load, they pass alone and on rerun); scoped e2e through the scratch config (no 4398/4399) 58 passed. Full `npm run test:e2e` not run.
