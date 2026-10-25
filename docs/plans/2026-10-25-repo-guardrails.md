---
title: Repo guardrails from the 2026-10-25 retro
date: 2026-10-25
status: In Progress
summary: Stop tests dirtying tracked files, check doc paths and commit messages, and run cheap checks on every pull request.
spec:
---

## Intent

- Problem: The Direction and Storyboard session lost time to mechanical problems. A viewer test rewrites tracked screenshots on every run. Plans named paths that did not exist. A branch landed without a Conventional Commit prefix. Nothing runs on a pull request, so a stale test stayed red on `main` for about a week.
- Why: Each of these is deterministic, so a check should catch it. A written rule would only add steering text.
- Proposed outcome: Running the test suite leaves the worktree clean. A plan or brief that names a missing doc fails a check. Every commit on a pull request is checked for its prefix. Pull requests run the cheap checks.
- Affected: `tests/core/render-viewer-transport.test.ts`, new `scripts/check-docs.mjs` and `scripts/check-commits.mjs`, `package.json`, new `.github/workflows/ci.yml`.
- Constraints: No new dependencies. Node 20 or newer, as in `package.json` engines. The committed viewer screenshots and `measurements.json` stay as the record the 2026-10-15 session summary points to.
- Out of scope: Running the full `npm test` in CI (needs ffmpeg and a browser; prove it on a draft pull request first). The e2e `KINOTTA_HOME` guard (codex is editing those fixtures). The stale `editor-settings` test (own branch). `~/.claude` wording changes.
- Open questions: Whether the full suite can run stably on the CI runner.

## Goal

A pull request that breaks types, names a missing doc, or uses a commit message without a prefix fails before review. A full local test run leaves `git status` empty.

## Approach

Each fix is a small deterministic check, not a rule in `REVIEW.md`.

- **A. Viewer test output.** The test writes its screenshots and `measurements.json` to `tests/artifacts/viewer-transport-clips/` (already gitignored) instead of the tracked `docs/session-summaries/` folder.
- **B. Doc paths.** `scripts/check-docs.mjs`, run as `npm run check:docs`. It reads `docs/plans/*.md` and `docs/briefs/**/*.md`, finds backticked `docs/...` paths, and fails if one is missing. Known misses are listed with a reason in `scripts/check-docs-known.txt`; a new miss fails. Code paths are not checked: the first run showed 12 hits, all in Done plans naming files that were later renamed or removed, which is history and not a mistake.
- **C. Commit prefix.** `scripts/check-commits.mjs <base>`, run as `npm run check:commits -- origin/main`. It fails for any commit between the base and HEAD whose subject does not start with `feat:`, `fix:`, `docs:`, `chore:`, `refactor:` or `test:` (an optional scope in parentheses is allowed). Merge commits are skipped.
- **D. CI.** `.github/workflows/ci.yml` on pull requests: `npm ci`, `npm run typecheck`, `npm run check:docs`, `npm run check:commits`.

## Steps

1. Save this plan; regenerate the dashboard.
2. A: change the output path in the viewer test; run it and confirm `git status` stays clean.
3. B: write `check-docs.mjs`; add the script; run it on `main` content and note the existing failures.
4. C: write `check-commits.mjs`; add the script; run it against this branch.
5. D: write the workflow.

## Risks

- `check:docs` may flag older plans that already name missing files. Mitigation: run it first, then decide per hit whether to fix the plan or scope the check, without silently skipping.
- The CI job cannot be run locally. Mitigation: run each of its commands locally; read the first Actions run on the pull request.
- Pre-existing merge-style commits on older branches may fail `check:commits`. Mitigation: it checks only the range of the pull request.

## Checks to run

- `npm run typecheck`
- `npm run check:docs` and `npm run check:commits -- origin/main`
- `npx vitest run tests/core/render-viewer-transport.test.ts`, then `git status --short` is empty.

## Changelog

### 2026-10-25
- Plan created and approved by the owner after the session retro.

### 2026-10-26
- A, B, C and D built on `chore/repo-guardrails`, one commit each. Viewer test now writes to `tests/artifacts/viewer-transport-clips/`; the test passes and `git status` stays clean after it.
- B narrowed: the code-path half was dropped after its first run found 12 hits that were all renamed or removed files in Done plans. Four real doc misses are listed with reasons in `scripts/check-docs-known.txt`. A fresh bad reference fails the check.
- C verified against a real bad commit: it flags `c8fa5bd` ("Add built-in brand...") on `origin/feat/built-in-brand`.
- D not yet run on GitHub; its three commands pass locally. Full `npm test` in CI is still open (see Out of scope).
