---
title: Merge queue
date: 2026-10-19
status: Approved
summary: Merge the hidden-stage fix, the playback performance work and the inline alternates card into main, one at a time, each checked against a known baseline.
spec:
---

## Intent

- Problem: Three finished branches are not on `main`. `fix/playback-copy-dedupe` holds the playback and render performance work, `fix/render-hidden-stage` holds a one-commit engine fix, and `feat/inline-alternates-card` holds a reviewed feature. All their plans read Done. `main` (`a330bdc`) already has the codex run cleanup and the random audio seeds.
- Why: Later work builds on `main`, and the performance fixes address real editor lag on RayDom reels. Each branch is 5 to 11 commits behind `main`, so the longer they wait the harder they merge.
- Proposed outcome: All three branches are on local `main`, each merge verified against the baseline below, with any new failure caught before the next merge.
- Affected: `main`, `skill/kinotta/engine/render.js`, `server/core/_internal/{import,media-library,render,runner}.ts`, `web/src/{Storyboard,ShotSheet}.tsx`, `web/src/review/_internal/{MediaEditor,PictureLayers}.tsx`, `web/src/styles.css`, `DESIGN.md`, `tests/**`, `docs/plans/index.html`.
- Constraints: No push. Merge commits (`--no-ff`), one branch per merge. Never rewrite branch history. Do not switch or commit in the shared checkout (`C:/FIles/Projects/Apps/Kinotta`, on `fix/render-hidden-stage` with unrelated uncommitted files); work in `.worktrees/codex-run-cleanup`. Fix conflicts and regressions at their root, not by loosening tests.
- Out of scope: Fixing the baseline failures listed below. Marking the codex run cleanup plan Done (an owner decision still open). Any UI review follow-up. Pushing.
- Open questions: none.

## Goal

1. `main` contains `fix/render-hidden-stage`, `fix/playback-copy-dedupe` and `feat/inline-alternates-card`, in that order, each as its own merge commit.
2. After each merge, typecheck and build pass, and the unit and browser suites show no failure outside the baseline.
3. `docs/plans/index.html` on `main` lists every plan with links into `C:/FIles/Projects/Apps/Kinotta/docs/plans/`, never into a worktree.
4. A session summary records each merge commit, its checks and every deviation.

## Approach

Baseline on `main` at `a330bdc` (2026-10-19, run in `.worktrees/codex-run-cleanup` with the sandbox off):

- Typecheck and build pass.
- Unit: `tests/web/editor-settings.test.ts` fails (expects `rail`, gets `marker`), also on `5f3a23d`. `tests/core/code-media-save.test.ts` fails only under full-suite load.
- Browser, run serially: `alternates.spec.ts:14` (timeline shot still never shows `r2`) and `section-batches.spec.ts:62` (waiting mark never appears) fail on `a330bdc` and `5f3a23d`. Five more fail only in the parallel full run: `clips:41`, `footage:284`, `alternates:113`, `transcription:24`, `review:136`.

A failure counts as new only if it fails when rerun serially and is not in that list.

Order, smallest risk first:

1. `fix/render-hidden-stage` (`056dd05`). One engine commit, merges cleanly. It changes how a hidden stage is sized at 0 s, the path where `alternates:14` fails, so rerun that test first and record whether it now passes.
2. `fix/playback-copy-dedupe` (`bbe21bb`). Six commits: one playback copy per video content, editor-sized copies with frequent keyframes, gentle renders and next-picture preload. Also touches `engine/render.js`; git merges it cleanly after step 1.
3. `feat/inline-alternates-card` (`1be6fca`). Ten commits of feature work that also edit `tests/e2e/alternates.spec.ts` and `DESIGN.md`. Merged last so the two fixes are already on `main` when its tests run.

Every merge conflicts only in the generated `docs/plans/index.html`. Resolve it by regenerating, never by hand.

## Steps

1. In `.worktrees/codex-run-cleanup`, merge `docs/merge-queue` into `main` with `--no-ff`. Confirm `main` is not checked out in any other worktree first (`git worktree list`).
2. For each branch in order:
   1. `git merge --no-ff <branch>`.
   2. On an `index.html` conflict: run `powershell -NoProfile -File docs/plans/build-plans-index.ps1`, then replace `Kinotta/.worktrees/codex-run-cleanup/` with `Kinotta/` in that file, confirm no `.worktrees` or conflict markers remain, `git add` and commit.
   3. Run `npx tsc --noEmit`, `npm run build`, `npx vitest run` and `npx playwright test`.
   4. Rerun every failure serially (`--workers=1`). Compare with the baseline. A new failure stops the queue: diagnose it, fix on the source branch or with a `fix:` commit on `main`, and do not start the next merge until it is resolved or the owner accepts it.
   5. Restore the October 15 evidence the viewer regression rewrites: `git checkout -- docs/session-summaries/2026-10-15-viewer-transport-clips/`.
3. Write `docs/session-summaries/2026-10-19-merge-queue-summary.md`, set this plan to Done, regenerate the dashboard with the path fix, and commit.
4. Return the worktree to `fix/codex-run-cleanup` so `main` is free. Report the new `main` head. Do not push.

## Risks

- The sandbox blocks spawning Python's Windows Store alias (`spawn UNKNOWN`), which stops the test server. Run the browser suite with the sandbox off.
- The dashboard script builds links from its own folder, so running it in the worktree writes worktree paths. The path fix in step 2.2 is required every time.
- The shared checkout holds untracked copies of inline alternates card files (`docs/plans/2026-10-18-inline-alternates-card.md`, its mockup, brief folder, summary and `docs/tickets-inline-alternates.md`). Once step 3 of the queue lands, checking out `main` there will refuse to overwrite them. Tell the owner; do not delete them.
- `feat/inline-alternates-card` changes `alternates.spec.ts`, so the baseline's `alternates:14` and `alternates:113` lines may move. Compare by test name, not line number.

## Checks to run

- After each merge: typecheck, build, full unit and browser suites, serial rerun of failures, baseline comparison.
- `grep -c ".worktrees" docs/plans/index.html` returns 0 after every regeneration.
- `git log --oneline --first-parent main` shows one merge commit per branch, in queue order.
- `git status` clean of tracked changes before each merge.

## Changelog

### 2026-10-19
- Plan created.
