---
title: Merge the Direction and Storyboard stack
date: 2026-10-26
status: In Progress
summary: Land style storage, Auto/Direct/Direction, the effects library and the skill styles on main, one pull request at a time.
spec: docs/plans/2026-10-25-direction-and-storyboard.md
---

## Intent

- Problem: Four finished branches for Phases 1 to 4 and 6 of the Direction and Storyboard plan sit unmerged, so new work (Phase 5, skill docs) would build on code that is not on `main`.
- Why: Later lanes should start from `origin/main`, not from a stack of unmerged branches.
- Proposed outcome: `origin/main` contains style storage, Auto/Direct/Direction, the effects library and the skill styles, each checked before it lands.
- Affected: branches `feat/style-storage`, `feat/auto-direct-direction`, `feat/effects-library`, `feat/skill-styles`.
- Constraints: Compare against `origin/main`, not local `main` (stale). One pull request per branch. Ask the owner before each merge.
- Out of scope: Phase 5 (pinned effects) and Phase 6 docs work. The other worktrees (`storyboard`, `skill-docs-fields`, `sections-music`, `grade`, `transitions`), which need their own look.
- Open questions: Whether `feat/skill-styles` can be merged as is, or needs its scratch merge commits and `c8fa5bd` (bad commit prefix) rewritten.

## Goal

The four branches are on `origin/main`, in dependency order, with checks passing at each step.

## Approach

`feat/style-storage` is the base: `feat/auto-direct-direction` and `feat/skill-styles` both contain it. `feat/effects-library` is independent. Merge in order, rebasing the next branch onto the new `origin/main` after each merge.

## Steps

1. `feat/style-storage` (2 commits): pull request, checks, merge.
2. `feat/auto-direct-direction` (9 new commits after step 1): rebase, checks including e2e, pull request, merge.
3. `feat/effects-library` (2 commits): rebase, checks, pull request, merge.
4. `feat/skill-styles`: inspect its content, then merge as is or cherry-pick onto `origin/main`.
5. Update the Direction and Storyboard plan changelog after each merge.

## Risks

- Rebase conflicts between `auto-direct-direction` and `effects-library` in shared web files. Mitigation: rebase one at a time and report conflicts before resolving.
- `feat/skill-styles` carries `scratch/integration-check` merges. Mitigation: do it last and inspect first.

## Checks to run

- `npm run typecheck`, `npm run check:docs`, `npm run check:commits -- origin/main`
- Unit tests, and the Playwright suite where a branch touches the web app.

## Changelog

### 2026-10-26
- Plan created and approved by the owner.
- Step 1 done: `feat/style-storage` merged as #68.
- Step 2 done: `feat/auto-direct-direction` rebased, AI author and trailers removed from 8 commits, merged as #69 from `feat/auto-direct-direction-rebased` (force-push to the old branch was blocked; the stale `origin/feat/auto-direct-direction` can be deleted).
- Step 4 done before step 3: `feat/skill-styles` rebuilt as `feat/skill-styles-clean` (built-in brand plus the skill change, no scratch merges, `c8fa5bd` reworded and its AI signature removed), merged as #70. It shares no files with the effects library, so order did not matter.
- Step 3 in review: `feat/effects-library` rebased twice (export, client and stylesheet conflicts kept both sides), rail Library button removed, wording fixed; open as #71. Full Playwright on the final base still to run.
