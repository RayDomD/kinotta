---
title: Codex run cleanup
date: 2026-10-18
status: In Progress
summary: Close the loose ends of the live edits, parts and alternates run: a green full suite, the Draft capture race, stale docs, the skipped review, and the unmerged seeds branch.
spec: docs/briefs/2026-10-14-live-edits-parts-alternates/1-chain-codex.md
---

## Intent

- Problem: The live edits, shots as parts and alternates run is merged to `main`, but it never had one fully passing core suite run (4 of 803 failed in the last full run). A known race lets a second server delete a live Draft's capture inputs. The three plans still read `Approved`, `DESIGN.md` still describes the removed Save, and the reviewer's critique and audit were never done. `codex/random-audio-seeds` is done but not merged.
- Why: Further work (inline alternates, version compare, span pins) builds on this code. Unexplained failures and stale docs make every later change harder to trust.
- Proposed outcome: A full core run passes with nothing failing, the race is closed, docs match the running app, the review findings are recorded, and `main` has the seeds fix.
- Affected: `tests/core/**`, `server/core/_internal/render-queue.ts`, `server/http/_internal/handler.ts`, `DESIGN.md`, `docs/plans/**`, `docs/session-summaries/**`, git branches.
- Constraints: No engine changes (`skill/kinotta/engine/**`). Fix root causes, not timeouts. Review findings are recorded, not fixed here. Push or merge to `main` only after the owner confirms.
- Out of scope: Inline alternates in the Storyboard card (its own plan). The Draft plans for inspector controls, version compare and span pins.
- Open questions: none.

## Goal

1. `npx vitest run tests/core --maxWorkers=1` passes in full in a single run.
2. A server starting while another server is capturing a Draft on the same project leaves that capture's inputs in place. A test proves it.
3. The live edits, shots as parts and alternates plans read `Done` and each has a session summary. `DESIGN.md` describes Working and freezing instead of Save. The dashboard is regenerated.
4. The `/impeccable` critique and audit of the Working screen, Storyboard and ShotSheet are written down, along with a decision on the 39 font-size findings.
5. `codex/random-audio-seeds` is merged into `main`.

## Approach

- Failures: run each of the 4 failing tests on its own first. A pass alone points to load or timing. A fail points to a defect. Exit code 3221226505 (0xC0000409) is a Windows process crash in the render child, so check the render tests for how processes start and shut down before anything else. Fix whatever is actually wrong, then run the full suite once.
- Race: `removeStaleDrafts` (`render-queue.ts:109`) should delete only captures that no live process owns. Each capture gets an owner marker (the owning process's ID or a lock). Startup removes a capture only when its owner is gone. Write the test first and watch it fail.
- Docs: edit `DESIGN.md:197` and `:204`, change the status on the three plans, write summaries from the brief's stop report and the 10-15 merge summary, then run `build-plans-index.ps1`.
- Review: follow `~/.claude/reference/ui.md` and `craft.md` before running `/impeccable`. Findings go into the summary as follow-ups.

## Steps

1. Branch `fix/codex-run-cleanup` from `main`.
2. Rerun the 4 failing tests on their own, then diagnose and fix them. Commit each fix.
3. Write the failing race test, add the capture owner check, and confirm the test passes. Commit.
4. Run the full core suite plus typecheck and build, and record the results.
5. Update the docs, write the summaries, and regenerate the dashboard. Commit.
6. Run the `/impeccable` critique and audit and record the findings.
7. With the owner's go-ahead, merge `codex/random-audio-seeds` and this branch into `main`.

## Risks

- A failure may come from the Windows environment and not be fixable in code. If so, document it and ask how to handle it, without skipping the test.
- The owner marker could leave captures behind after a crash. Startup should still remove captures whose owner process is gone.

## Checks to run

- `npx vitest run tests/core --maxWorkers=1` passes in full.
- `npm run typecheck`, `npm run build`.
- The race test fails before the fix and passes after it.
- Playwright `working`, `parts`, `alternates` and `part3-existing` configs still pass.

## Changelog

### 2026-10-18
- Plan created from the review of recent plans. Approved by the owner; execution started on `fix/codex-run-cleanup`.
- All four inherited failures pass in isolated reruns; no speculative failure fixes or timeout changes.
- Added a failing cross-process regression and fixed live Draft deletion with an owner PID published before the capture rename. All 12 Working render tests pass, including removal after the owner exits. Commits: `ba0a4ac` (saved plan), `49b0492` (race).
- Typecheck and production build pass. The first complete core run finished with 808 passed, three failed and one existing skip. All four inherited failures passed. The three new failures reproduced alone: ambiguous pin selection, checking before the split/Undo response completed, and dragging a handle outside the scrolling tracks viewport. Focused corrections preserve the behavioral assertions and change no timeouts or editor implementation.
- Drafted the three retrospective summaries and corrected Save-era design wording. UI reviewer model authorization and final merge approval remain pending.
- The four requested browser configurations pass all 46 tests. Regression test corrections are in `04e8e60`. The second full invocation exposed another attachment request/Undo synchronization failure, reproduced and corrected in `aea5b3a`; a complete green rerun is still required.
- Fresh full verification from `aea5b3a`: all 109 core files pass; 811 tests pass with one existing opt-in faster-whisper skip; exit 0, 1029.22 seconds. Command: `npx vitest run tests/core --maxWorkers=1 --reporter=verbose --bail=1`. Typecheck, build and all 46 requested browser checks pass. Logs and limitations are recorded in `docs/session-summaries/2026-10-18-codex-run-cleanup-summary.md`.

## Execution status

- Goals 1–3 are complete: one green full core run, the proven Draft owner fix, corrected design wording, three closed original plans with summaries, and the regenerated dashboard.
- Goal 4 is pending reviewer-model approval. The requested choice is two GPT-6.1-sol reviewers at high reasoning effort, or an explicitly disclosed single-context review. No agents have been spawned; the UI critique/audit and the 39 font-size advisories remain unreviewed.
- Goal 5 is pending the owner's final merge approval. Neither this branch nor the seeds branch has been merged or pushed. The plan remains In Progress until the remaining outcomes satisfy the original Intent.
