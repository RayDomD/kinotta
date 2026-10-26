---
title: Orchestration workflow fix
date: 2026-10-26
status: Done
summary: Turn the slowdowns of the last /goal run into hooks, a verify script, a brief template, and herdr-dispatch rules
spec: C:\Users\ryand\AppData\Local\Temp\2026-10-26-orchestration-workflow-fix-handoff.md
---

## Intent

- Problem: the last `/goal` run stalled on things code could catch: a killed watcher, a stale handoff, conflicting reference docs, brief gaps, and mojibake. The owner had to keep nudging it. Patterns 1 to 8 are in handoff 4 (`C:\Users\ryand\AppData\Local\Temp\2026-10-26-kinotta-handoff-4.md`).
- Why: the next run should move on its own.
- Proposed outcome: hooks and scripts enforce the mechanical checks; a few short skill rules cover the rest.
- Affected: Kinotta (`scripts/check-mojibake.mjs`, `scripts/verify-lane.mjs`, this plan), `~/.claude/skills/herdr-dispatch/SKILL.md`, `~/.claude/templates/brief.md`, the global pre-commit hook `~/.config/git/hooks/pre-commit`, one User environment variable.
- Constraints: one question at a time; branch before committing; Conventional Commits, no AI trailers; skill body under 500 lines.
- Out of scope: finishing pinned effects, its PR, `docs/merge-train` (handoff 4). Vault stub notes are offered, not done.
- Open questions: none.

## Goal

Every Done-when in the spec passes: the variable prints `1`; the hook blocks a mojibake middle dot (U+00C2 U+00B7) and allows clean text; the verify script runs on `feat/storyboard-pinned-effects`; `herdr-dispatch` carries the W1, W4 and W5 rules; commits sit on branches.

## Approach

Decisions (owner answers, 2026-10-26):

| # | Decision | Answer |
|---|---|---|
| D1 | Set `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1` as a User variable | Yes. Set; owner restarts Claude Code after this session |
| D2 | Orchestrator restarts a dead `herdr agent wait` watcher unasked inside an owner-started run | Yes |
| D3 | Mojibake check location | Committed `scripts/check-mojibake.mjs`, called by `.git/hooks/pre-commit`. The global hook finds the repo hook with `--git-common-dir` so it also runs in worktrees (`--git-dir` points at `.git/worktrees/<name>`) |
| D4 | Codex fix-round cap | 3, then escalate |
| D5 | Verify gate location | Kinotta `scripts/verify-lane.mjs` |
| D6 | Low memory at verify start | Stop below 3 GB free. `--force` runs anyway; the orchestrator may pass it on its own judgment and says so in its report |

Findings from checking the handoff:

- `playwright.config.ts` starts all 19 web servers on every run, whatever specs are selected. `--shard` halves browser work, not server memory.
- `docs/plans/build-plans-index.ps1:57` contains mojibake on purpose; the hook allows that file.
- The brief template lives in the `~/.claude` repo, so three repos change.
- `~/.claude/skills` has 131 unrelated uncommitted changes; stage only `herdr-dispatch/SKILL.md` (which already carries one uncommitted agy-subagents line, kept).

## Steps

1. Kinotta worktree `.worktrees/orchestration-workflow`, branch `chore/orchestration-workflow` from `origin/main` (`1e092af`). Save this plan.
2. W1: set the variable (done, prints `1`).
3. W2: `scripts/check-mojibake.mjs` scans added lines of `git diff --cached` (text only) for U+00C2 or U+00E2 U+20AC, allowing `build-plans-index.ps1`. Add `.git/hooks/pre-commit` wrapper; switch the global hook to `--git-common-dir`. Test: a staged mojibake middle dot blocks, a clean file passes, and the same case blocks from a worktree.
4. W3: `scripts/verify-lane.mjs [--brief <path>] [--base origin/main] [--force]`. Checks free memory (D6), runs typecheck, vitest, Playwright `--shard=1/2 --workers=2` then `--shard=2/2`, keeps each log in `tests/artifacts/verify-lane/` (git-ignored), checks `git diff <base>` for mojibake, lists changed files outside the brief's `Touch:` paths. Non-zero exit on any failure.
5. W4: `~/.claude/templates/brief.md` gains an Inputs section, a Lane split line, one `Touch:` path per line, and "mojibake: the hook enforces it".
6. W5: `herdr-dispatch` rules: live PR/branch check before decisions; watcher restart and memory check; review cap and convergence; herdr quirks; model and effort once per run; ask before heavy checks on throwaway artifacts; point at W3 and W4.
7. Run `verify-lane.mjs` on `.worktrees/storyboard-pinned-effects`, memory checked first. Record the result.
8. Commit in each repo on a branch.

## Risks

- The global hook change touches every repo, though only where the repo hook is found.
- Playwright may still run out of memory split in halves; D6 stops first unless forced.

## Checks to run

- `[Environment]::GetEnvironmentVariable('CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP','User')` prints `1`.
- Three hook cases, outputs shown.
- `verify-lane.mjs` on the pinned-effects worktree, logs kept.
- `git branch --show-current` in each changed repo is not main.

## Changelog

### 2026-10-26
- Plan created and approved; D1 to D6 answered. D1 applied.
- W2 done: hook blocked a staged mojibake file from a worktree and allowed the clean commit `94baae8`. The global hook (not versioned) now uses `--git-common-dir`.
- W3 written; the brief file itself is always in scope. Logs go to `tests/artifacts/verify-lane/` (git-ignored) rather than `tests/`.
- W4 and W5 done in `~/.claude/templates/brief.md` and `herdr-dispatch` (65 lines).
- Step 7 waits: codex is still working in the pinned-effects worktree (ports would collide) and free memory was 1.0 GB.
- Out of scope, recorded only: the global `commit-msg` hook has the same `--git-dir` worktree gap; `herdr-dispatch` still says not to answer a blocked lane, which conflicts with the answer-within-plan memory.
- Owner asked to fix both. Global `commit-msg` now uses `--git-common-dir`; a scratch repo's own hook blocked a marked message from a worktree and allowed a clean one. `herdr-dispatch` now answers a blocked lane when the plan, brief, or code settles it (skills `9cdafa4`).
- Code review fixes: git path quoting off in both scripts; `--brief` or `--base` without a value fails; a Touch line that does not parse fails the scope check with a clear note; an added line starting `++ ` is no longer read as a file header; literals named. D6 as built: the memory floor gates the Playwright shards only, because typecheck and unit tests are light. `docs/plans/index.html` restored to `main`'s copy; regenerate it after merge, since a regeneration in a worktree rewrites every link to that worktree.
- Step 7 done: first real `verify-lane` run on `feat/storyboard-pinned-effects` (`8da1907`), forced at 3.5 GB free. Typecheck ok; Playwright 85 + 76 passed in two halves (161, none failed); mojibake ok. Unit failed 2 of 1,235, both in the `render` project under full-suite load (`render-media-preview` timed out, `render-queue` stale port file); both passed alone (23 of 23). Scope flagged the docs commits the orchestrator made on that branch (`CONTEXT.md`, ADR 0007, the mockup, the plan), which the diff explains. Finding: `npm test` includes the `render` project, so the unit step took 21 minutes; lane briefs ask for `--project unit`.
