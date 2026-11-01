---
title: Fix the render test failures
date: 2026-11-01
status: Approved
summary: Seven local-only render tests fail on main. Five are stale tests to update; two show a real 2 s edit delay from PR #105 that needs an app fix. Adds guards so it does not recur.
spec:
---

## Intent

- Problem: Seven render tests fail on `main` (`6ec159d`) and nobody noticed. CI runs only `--project unit`; render tests are excluded on purpose and "stay local".
- Why: A lane's verify gate reports these as failures that are not its own (issue #82), and two of them point to an editor slowdown users can feel.
- Proposed outcome: The render suite passes on `main` at the tests' original timeouts, and each failure is either a corrected test or a fixed app, never a hidden one.
- Affected: `tests/core/render-*.test.ts`, `tests/engine/sound-skill.test.ts`, `vitest.config.ts`, and the editor timeline and still-thumbnail code that PR #105 changed (`web/src/review/_internal/`).
- Constraints: Do not raise a timeout to hide a measured slowdown. Do not change app behavior to satisfy a stale test. Follow the owner's layout decision O3 (default `viewerShare` 0.45) in `docs/plans/2026-10-27-editor-layout-scaling.md`.
- Out of scope: Running render tests in CI. Fixing issue #82's media-preview and eq-editor items unless they turn out to share a cause.
- Open questions: whether to add a scheduled render-test job to CI (separate decision).

## Goal

The seven tests pass on a branch from `origin/main`, and the editor edit delay is back to the parent commits' level.

## Approach

Evidence: a bisect over `19b0a43..6ec159d` (24 probes, each failing probe repeated), a PR #123 diagnosis with real-UI screenshots, and a latency measurement (5 runs per commit). Local `main` was stale during triage; every comparison here uses `origin/main`.

**Track 1: stale tests, test-only changes.**
- Retry picture and Retry still (`render-media-sync.test.ts`) and A6 (`render-media-verify.test.ts`), first bad commit `6fd7724` (PR #123). The editor now requests media with `?working=1`; the tests intercept the exact queryless URL, and A6 writes native media only to `v1/plan.json` while the editor opens Working. Verified in the real UI: the failed-picture message and the Retry button both appear. Fix: match `...?*` in the interceptors, check both `working=1` and `retry=1` in the still test, write the current plan and the saved plan in A6.
- Viewer divider and height (`render-viewer-transport.test.ts`, two tests), first bad commit `86423ba` (PR #105). The app follows O3 (0.45 default); the tests still expect 0.55. Fix: expected values 50, 60, 50, 50, 0.5 and `0.45 - 4`.
- Both diffs were already tested in throwaway worktrees (3 of 3 and 2 of 2 passing).

**Track 2: real editor slowdown, app fix.**
- Custom-regions drag (`render-media-regions.test.ts:115`, first bad `48d1f98`) and timeline-window drag (`render-timeline-window.test.ts:89`, first bad `fc711a8`), both PR #105.
- Measured time from the action until the edit is visible in `readEditList`: regions 990 ms to 2930 ms, timeline 231 ms to 2002 ms (medians). The edit POST reaches the server 1.7 to 2.8 s after the action, then finishes in 30 to 95 ms, so the server is not the cause. Still-thumbnail requests during the wait rose from 7 to 25 (regions) and from 0 to 14 to 19 (timeline).
- Hypothesis, not proven: more thumbnail requests queue ahead of the edit POST in the browser. Step 1 isolates the cause before any fix. The fix goes in the editor, for example fewer or lazier still requests; it is chosen after step 1.
- Success has two parts. First, the measured action-to-edit time is back near the parents' (report the medians, using the same timing method). Second, both polls get an explicit `{ timeout: 5000 }`, matching the timeline test's existing line 63. The second part is needed even after the fix: the regions parent measured a 990 ms median and went over 1000 ms in 2 of 5 runs, so the original 1 s poll was always tight. Raising the timeout after the speed is fixed is honest; raising it instead of fixing would hide a roughly 2 s lag.

**Track 4: stop it happening again.**
- Causes found: CI runs only `--project unit`, so render tests never block a merge. PR #105 changed the editor layout and updated the unit and e2e tests for the 0.45 default, but its render test `render-viewer-transport.test.ts` was missed. The lane gate (`scripts/verify-lane.mjs`) does run render tests, because `npm test` is `vitest run` over every project. But `.herdr/CLAUDE.md` step 4 classes failures as "#82 known" or "regression", and issue #82 names files and lines, not exact test names, so new failures in a file #82 mentioned could pass as old ones.
- 4a, global rule in `~/.claude/reference/review.md` (outside the repo): when a repo has test suites CI skips, run the ones covering the touched area before opening a PR and list the result in the PR body. A failure counts as known only when it matches an issue by exact test name; anything else is a regression.
- 4b, repo rule in `AGENTS.md`: changes under `web/src/review/**` or `server/core/_internal/media-*` need `npx vitest run --project render` to pass or each failure matched by exact name to an open issue. Load the `writing-for-agents` skill before editing it.
- 4c, repo guard in `scripts/verify-lane.mjs`: report failing tests by exact name and fail on any not listed in a checked-in `scripts/known-test-failures.txt` (one test name per line, each with an issue number). The file starts empty after this plan, because all seven are fixed here.
- 4d, `.herdr/CLAUDE.md` step 4: match known failures by exact test name, not by file. It is gitignored, so this is a local edit.
- Not in this plan, one decision for the owner later: a scheduled or non-blocking CI job that runs the render project. It is the strongest guard, but it changes CI.

**Track 3: sound-skill timeouts.**
- Two tests in `tests/engine/sound-skill.test.ts` exceed 5 s under full-suite load; all 10 pass at 30 s.
- Option A: move the file to `PROCESS_HEAVY_TESTS` in `vitest.config.ts` (30 s, serial). It leaves CI, because CI runs only `--project unit`.
- Option B: give the slow tests a per-test timeout. The file stays in CI, and its Python child processes keep running beside other unit tests locally.
- Recommendation: Option B. It keeps the CI coverage that the CI setup of numpy and scipy exists for. Decision needed from the owner.

## Steps

1. Track 1 test edits (codex or agy), one commit: `fix: update render tests for Working media URLs and the 45% viewer default`.
2. Track 2 diagnosis (codex, read-only): in a throwaway worktree, revert the layout changes in `48d1f98` and `fc711a8` one rule at a time and trace the request queue, to find which change adds the thumbnail requests or delays the POST.
3. Track 2 fix (codex), verified in the real editor and by the two tests passing five runs each. Then add `{ timeout: 5000 }` to both polls. Commits: `fix: stop timeline thumbnails delaying edits` and `test: give the edit polls an explicit timeout`.
4. Track 3 (agy): give the two slow sound-skill tests a per-test timeout, one commit. The owner approved Option B on 2026-11-01.
5. Track 4b and 4c (agy), in its own commits. 4a and 4d by Claude.
6. Run the render project end to end once: `npx vitest run --project render`, and `npx playwright test tests/e2e/working-sound-preview.spec.ts`.
7. Update issue #82 with what this plan covered and what remains; do not file a duplicate. The update is outward-facing, so ask first.

Lanes: codex takes Track 2 (diagnosis, then fix) in the `fix-render-tests` worktree. agy takes Tracks 1, 3, 4b and 4c in its own worktree off `fix/render-test-failures`, since the two lanes would otherwise commit into one worktree. Their file sets do not overlap: codex edits `web/src/review/**`, agy edits tests, `vitest.config.ts`, `scripts/` and `AGENTS.md`.

## Risks

- Step 2 may show the slowdown is a deliberate trade, such as a 220 ms panel transition, and not a bug. Then the plan returns to the owner for a decision.
- A fix that cuts thumbnail requests could change how clips look. Check the clip row visually.
- The render project is slow and shares one browser lock; runs queue behind other lanes.

## Checks to run

- `npm run typecheck`, `npm run check:docs`.
- `npx vitest run --project unit` (what CI runs).
- `npx vitest run --project render` with no failures, at the original timeouts.
- `npx playwright test tests/e2e/working-sound-preview.spec.ts`.
- The editor lag in the real UI: apply a layout in the Edit tab and press an arrow key on a placement, and the change shows without a visible delay.

## Changelog

### 2026-11-01
- Plan created as Draft from the bisect, PR #123 diagnosis and latency measurement.
- Owner approved the plan and left the choices to Claude: Track 3 is Option B (per-test timeout). Status set to Approved.
- Owner asked for a way to stop this recurring and suggested `review.md`; added Track 4. Track 2's success criterion now has two parts, because the regions test was already tight at parent speed.
- Built the fix on `fix/render-test-failures`: Track 1 and 3 test edits (agy), Track 2 app fix and poll timeouts (codex), Track 4b and 4c (agy), and a tightening of the 4c gate by Claude.
- Track 2 cause found: the browser's 6-connection limit per origin. Two `/api/events` streams plus the thumbnail requests used every slot, so the edit POST waited 1.8 to 3.1 s before it was sent. The server took 30 to 95 ms either way. Fix: `fetchPriority="low"` on the clip thumbnails.

## Result

Status stays In Progress until the PR merges.

**What shipped vs planned.** All four tracks are built and verified on `fix/render-test-failures`. One deviation: Track 4c's gate (written by agy) passed the step when a test file failed to load while another failure was allowlisted. It now fails on a file with no test result; proven with four temporary cases, since removed.

**The seven failures**
- Retry picture, Retry still and A6 (`render-media-sync`, `render-media-verify`): stale tests, updated for the `?working=1` media URLs and a current plan in the A6 fixture. The editor shows the failed-picture message and a Retry button, checked in the real UI.
- Viewer divider and viewer height (`render-viewer-transport`): stale tests, updated to the 0.45 default from O3.
- Custom-regions drag and timeline-window drag: a real slowdown from PR #105, fixed in the app. Their polls now have an explicit `{ timeout: 5000 }`, added after the speed fix because the regions test was already tight at the parent commit.
- Median action-to-edit time on `6ec159d` before and after the fix: regions 1900 ms to 178 ms, timeline 2265 ms to 179 ms. All thumbnails still load (17 of 17 and 12 of 12).

**Checks run on the combined branch**
- `npm run build` and `npm run typecheck` pass.
- `npx vitest run --project render`: 38 of 38 files, 124 of 124 tests (995 s).
- `npx vitest run --project unit --project process-heavy`: 146 of 146 files, 1,374 passed, 7 skipped (569 s).
- Playwright `working-sound-preview.spec.ts` and `editor-layout.spec.ts`: 11 of 12 on the first run. The one failure, "Narrow graphic clips hide their label", timed out waiting for a graphic clip. It did not reproduce: 3 of 3 alone with the fix, 1 of 1 alone with the fix reverted, and 11 of 11 on a rerun of the whole spec. Treated as an unreproduced flake. The e2e project is not in CI either.

**Not covered.** CI still runs only `--project unit`, and the e2e project is also outside CI. A scheduled or non-blocking job that runs the render and e2e projects is a separate owner decision. Issue #82's media-preview and eq-editor items were not examined; render-media-preview and render-media-eq-editor passed in the full run.

**Guards added.** `~/.claude/reference/review.md` (run the suites CI skips; known means an exact test name in an open issue), `AGENTS.md` (render tests for editor and media changes), `scripts/verify-lane.mjs` with `scripts/known-test-failures.txt` (exact-name matching, starts empty), and `.herdr/CLAUDE.md` step 4.
