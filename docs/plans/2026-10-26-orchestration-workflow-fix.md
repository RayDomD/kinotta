---
title: Orchestration workflow fix
date: 2026-10-26
status: In Progress
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

Every Done-when in the spec passes: the variable prints `1`; the hook blocks `Â·` and allows clean text; the verify script runs on `feat/storyboard-pinned-effects`; `herdr-dispatch` carries the W1, W4 and W5 rules; commits sit on branches.

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
- `docs/plans/build-plans-index.ps1:57` contains `â€”` on purpose; the hook allows that file.
- The brief template lives in the `~/.claude` repo, so three repos change.
- `~/.claude/skills` has 131 unrelated uncommitted changes; stage only `herdr-dispatch/SKILL.md` (which already carries one uncommitted agy-subagents line, kept).

## Steps

1. Kinotta worktree `.worktrees/orchestration-workflow`, branch `chore/orchestration-workflow` from `origin/main` (`1e092af`). Save this plan.
2. W1: set the variable (done, prints `1`).
3. W2: `scripts/check-mojibake.mjs` scans added lines of `git diff --cached` (text only) for `Â` or `â€`, allowing `build-plans-index.ps1`. Add `.git/hooks/pre-commit` wrapper; switch the global hook to `--git-common-dir`. Test: staged `Â·` blocks, clean file passes, `Â·` blocks from a worktree.
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
