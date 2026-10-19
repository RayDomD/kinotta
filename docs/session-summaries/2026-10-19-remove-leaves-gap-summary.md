# Remove and snip leave a gap

Branch `feat/remove-leaves-gap` in `.worktrees/remove-leaves-gap`. Plan: `docs/plans/2026-10-19-remove-leaves-gap.md`.

## Shipped vs. planned

Shipped as planned. On the main picture sequence, Delete, the clip menu Remove, the ClipSettings Remove button and Apply snip leave a gap of the removed length (`leaveGap: true`), and later clips keep their times. Shift+Delete and Shift with Apply snip close the gap. Saved entries without the flag still ripple on replay. The snip bar reads "Remove N s, keep the gap" with the hint "Shift closes the gap".

- Core: `90103b8` (lane A).
- Browser checks for remove and snip on `render-native-lanes`: `9ac7da1` (lane B).
- Editor: `037ceb4` (lane C).
- E2e update for the new default: `61b9931`.

## Deviations

- Four `tests/e2e/snip-save.spec.ts` tests asserted the old ripple default and old confirmation text. Snip-then-Save and keyboard-only now assert the keep-gap default. Undo and agent-built-reel comment redistribution use Shift+Apply so the closing path stays covered. The check that the playhead lands past the snipped stretch was dropped from the Save test, since with a gap the playhead stays at the snip start.
- The cut stall moved to `docs/plans/2026-10-19-cut-stutter.md`.

## Checks run

- Typecheck and build passed.
- Engine and web: 113/114. The one failure, `tests/web/editor-settings.test.ts:11` (expects rail key `M`, default is `R`), fails on main too.
- Core: 818 passed, 8 failed, 1 skipped under full load. All 8 pass alone on both branch and main (load-only). Report: `tests/2026-10-19-core-triage.md` (untracked).
- E2e full run: 120 passed, 8 failed, 4 not run. Alone on both revisions: `alternates:43` and `section-batches:62` fail on main too (pre-existing), `clips:41` and `engine:69` pass (load-only), and four `snip-save` tests failed only on the branch and are fixed by `61b9931`. Report: `tests/2026-10-19-e2e-triage.md` (untracked).
- `snip-save.spec.ts` after the update: 10/10, rerun independently.
