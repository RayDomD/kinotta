---
title: Test guardrails from the merge-train retro
date: 2026-10-26
status: Approved
summary: Leftover e2e servers, stale web builds and unguarded tests cost the merge train hours; make each one fail loudly or go away.
spec:
---

## Intent

- Problem: During the Direction merge train, aborted Playwright runs left `tests/e2e/start-server.mjs` servers holding the fixed e2e ports (only the owner could stop them); vitest render tests served a stale `dist/web` and reported a false failure; seven Playwright tests had silently broken on `main`; AI-authored commits passed `check:commits`; and herdr dispatch reported false timeouts.
- Why: Every later lane runs these suites. Each problem above cost a rerun, an owner interruption, or a false alarm.
- Proposed outcome: A test run cleans up after itself, render tests never run against an old build, `main` refuses AI-authored commits, and the e2e suite tells new failures from known ones without a hand-made baseline.
- Affected: `tests/e2e/start-server.mjs`, `playwright.config.ts`, `vitest.config.ts` (plus a new setup file), PR #67 (`chore/ci-unit-tests-attribution`), the seven failing specs, `~/.claude/skills/herdr-dispatch/SKILL.md`, `~/.claude/templates/brief.md`.
- Constraints: Ports stay at today's numbers unless an override is set. No change to app behaviour except where a failing test proves the app wrong.
- Out of scope: A Playwright job in CI (render timing on CI runners is unproven; #67 keeps render suites local for that reason). Permission rules for force-push or process kills (owner's settings). Deleting the stale remote branches `feat/auto-direct-direction` and `feat/skill-styles` (asked separately).
- Open questions: For each of the seven failing tests, is the test or the app wrong? Agy's read-only diagnosis (`.herdr/briefs/2026-10-26-diagnose-baseline-e2e-agy.md`) answers this before step D.

## Goal

The four mechanical failures from the retro each have a check or a cleanup, and the e2e suite on `main` is green or skips only tracked known failures.

## Approach

Finish what exists before adding anything: #67 already rejects AI authors, committers and Claude `Co-Authored-By` trailers and runs the `unit` vitest project in CI, so it is rebased and landed rather than redone. The other fixes are small, local, and land in one PR from `chore/test-guardrails`, one commit each.

## Steps

A. **Land #67.** Rebase `chore/ci-unit-tests-attribution` onto `origin/main`; also reject a `Claude-Session:` trailer in `scripts/check-commits.mjs`; confirm its CI runs green on GitHub; mark it ready. Owner merges.
B. **E2e servers exit with their parent.** In `tests/e2e/start-server.mjs`, poll the parent process (`process.ppid`, `process.kill(pid, 0)`) every 2 s and exit when it is gone. Verify by starting a Playwright run, killing its root process, and checking that no `start-server.mjs` process remains within 5 s.
C. **Render tests build first.** A vitest `globalSetup` for the `render` project runs `vite build` when `dist/web` is missing or older than the newest file under `web/src`. Verify: touch a file in `web/src`, run one render test, see the rebuild; run it again, see no rebuild.
D. **Seven failing Playwright tests.** Per agy's diagnosis: fix each test whose cause is confirmed and small (test or app, as the diagnosis judges); mark the rest `test.fixme` with a one-line reason and a GitHub issue link. Verify: the seven specs pass or are skipped; no other spec changes.
E. **Herdr dispatch.** In `~/.claude/skills/herdr-dispatch/SKILL.md`, say a `timeout` from `agent prompt --wait` means "read the brief's Status", not failure. In `~/.claude/templates/brief.md`, tell the lane to keep the file UTF-8.
F. **E2e port base (optional, ask first).** `KINOTTA_E2E_PORT_BASE` in `playwright.config.ts` shifts all 22 ports so two worktrees can run suites side by side. Default unchanged.

## Risks

- B on Windows: `process.ppid` may name the `cmd` shell, not Playwright. Mitigation: verify by killing the Playwright root, as in step B; fall back to a stdin-close watch if the shell lingers.
- C adds a build (about 30 s) to the first render test after a web change. Accepted: a stale build costs more.
- D may show the app is wrong. Then the step needs an owner decision before the fix, per `AGENTS.md`.

## Checks to run

- `npm run typecheck`, `npm run check:docs`, `npm run check:commits -- origin/main`
- The step's own verification above.
- `npx vitest run --project unit`, and `npx playwright test` once at the end (needs free memory and ports).

## Changelog

### 2026-10-26
- Plan created from the merge-train retro. Waiting for owner approval.
- Owner approved the plan as written.
