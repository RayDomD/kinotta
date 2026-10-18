# Codex run cleanup handoff

Updated October 18, 2026. The code fixes, full verification, documentation cleanup and UI review are recorded. The cleanup plan remains **In Progress** pending owner-approved merges.

## Resume here

Continue on `fix/codex-run-cleanup`, checked out in `.worktrees/codex-run-cleanup`. The shared checkout is on separate branch `fix/render-hidden-stage`; do not switch or commit that work for this cleanup. The reviewed UI checkpoint is `78db54a`; review records follow it. Read the [cleanup plan](../plans/2026-10-18-codex-run-cleanup.md) and [session summary](../session-summaries/2026-10-18-codex-run-cleanup-summary.md) for evidence and limitations. Check current Git state before editing.

The owner approved the two GPT-6.1-sol/high reviewers and continuation with the proposed Playwright fallback. The review is complete as a bounded assessment with explicit limits. The next owner decision is merge approval; review authorization did not authorize merging or pushing.

## Completed

| Commit | Result |
| --- | --- |
| `ba0a4ac` | Saved the approved cleanup plan. |
| `49b0492` | Fixed startup deleting another live process's Draft capture. |
| `04e8e60` | Corrected pin selection, split/Undo synchronization, and trim-handle scrolling in browser regression tests. |
| `aea5b3a` | Waited for attachment and Undo requests before checking restored attachment state. |
| `a4c29ee` | Updated `DESIGN.md`, closed the three original plans, wrote their summaries and the cleanup record, and regenerated the dashboard. |

Draft captures write `.owner-pid` in staging before the capture rename. Startup retains captures with a live owner and removes unowned or dead-owner captures. Permission errors conservatively retain the capture. A reused PID can retain an abandoned capture until that unrelated process exits.

The race regression failed when a real second server process deleted the live capture, then passed with the fix. Another test creates a capture in a process that exits and proves startup removes it. Completion, failure and cancellation cleanup also pass. Implementation changes are confined to `server/core/_internal/render-queue.ts` and `save.ts`.

The four inherited failures all passed in isolation and in the successful full run. Further browser-test failures reproduced during verification and were corrected at the actual request/visible-control boundaries. Timeouts and behavior assertions were preserved. Application UI code and `skill/kinotta/engine/**` were unchanged.

The live-edits, shots-as-parts and original alternates plans now read Done and have retrospective summaries. `DESIGN.md` describes Working and freezing. The newer inline animated Storyboard-card interaction remains separate work; closing the original chooser plan does not implement it.

## Verification

| Check | Result | Local log |
| --- | --- | --- |
| `npx vitest run tests/core --maxWorkers=1 --reporter=verbose --bail=1` | 109 files passed; 811 tests passed, 1 existing skip; exit 0; 1029.22 seconds | `tests/cleanup-full-core-verified.log` |
| `npm run typecheck` | Passed after the last test correction | `tests/cleanup-typecheck-final.log` |
| `npm run build` | Passed; existing 500 kB bundle advisory | `tests/cleanup-build.log` |
| Playwright `working.config.ts`, one worker | 2 passed | `tests/cleanup-e2e-working.log` |
| Playwright `parts.config.ts`, one worker | 6 passed | `tests/cleanup-e2e-parts.log` |
| Playwright `alternates.config.ts`, one worker | 5 passed | `tests/cleanup-e2e-alternates.log` |
| Playwright `part3-existing.config.ts`, one worker | 33 passed | `tests/cleanup-e2e-existing.log` |

The one full-suite skip is the existing opt-in real faster-whisper integration. Bail never triggered in the successful invocation: every core file ran. Verification ran against code at `aea5b3a`; subsequent changes were documentation only.

Two earlier full invocations failed and remain as diagnostic evidence: `tests/cleanup-full-core.log` (3 failed) and `tests/cleanup-full-core-final.log` (1 failed). Use `cleanup-full-core-verified.log` for the final result. Logs and generated test artifacts are local and untracked.

## Remaining work, in order

1. **Obtain the owner's merge go-ahead.** `main` remains at `5f3a23d`; `codex/random-audio-seeds` remains at `367c95e`. The seeds branch changes its generation script, sound guidance and plan records. Neither branch was merged or pushed. Review authorization alone does not authorize merging.
2. **After explicit merge approval, finish integration and closure.** Merge the seeds and cleanup branches into `main`, resolve any integration issues, and verify the resulting changes appropriately. Regenerate the dashboard after plan/summary updates. Mark the cleanup plan Done only when the seeds fix is on main and integration is verified. Push only with explicit authorization.

## Completed UI review

The [session summary](../session-summaries/2026-10-18-codex-run-cleanup-summary.md#ui-review-result) links the critique (25/40), provisional audit (14/20), every font-size disposition and the [fresh evidence record](../../.impeccable/review/2026-10-18-codex-run-cleanup/completion.md). Two independent source/artifact reviews were supplemented by parent Playwright checks after CUA proved unavailable. This is not two independent live reviews.

The main follow-ups are continuous Working identity, visible sheet submission/Undo, alternate labels on comments, desktop sheet scrolling and tab keyboard behavior. Choosing B, saving its pin identity and advancing B playback are verified. A fresh Back to Working revision wait timed out despite the earlier passing regression; preserve that discrepancy for investigation. No UI fixes were made. All 55 font-size advisories, including the inherited 39, are adjudicated against the documented roles without a blanket 16px conversion or detector ignores.

## Workspace and follow-ups

Preserve the shared checkout's unrelated files, local media, `.kinotta-server.json`, test evidence, and the separate inline-card/portrait plans and mockups. They were excluded from cleanup commits. Four older uncommitted cleanup-document updates remain in that shared checkout; this isolated branch now supersedes those pending-review descriptions. Do not restore the shared dashboard wholesale, because it also indexes concurrent plans.

The viewer regression rewrites historical October 15 evidence. This run's generated copies were saved to `tests/artifacts/codex-run-cleanup-review/render-viewer/` in the original checkout, then the historical tracked files were restored. The fresh review scripts closed their browsers and fixture servers; the diagnostic server on port 8400 was stopped. Saved fixture URLs/PIDs are stale. Representative fresh screenshots and raw measurements are committed under `.impeccable/review/2026-10-18-codex-run-cleanup/`.

Two recorded follow-ups are outside the completed changes: `.impeccable/design.json` is stale relative to `DESIGN.md`, and the legacy-media hint in `MediaEditor.tsx` still mentions Save. The hint is a source-only observation, pending verification on a running legacy surface. Keep inline alternates, inspector controls, version compare, span pins and engine changes outside this cleanup.
