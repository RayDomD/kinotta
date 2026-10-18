# Codex run cleanup handoff

Written October 18, 2026. The code fixes, full verification and documentation cleanup are committed. The cleanup plan remains **In Progress**: the UI review and owner-approved merges are unfinished.

## Resume here

Continue on `fix/codex-run-cleanup`. The completed cleanup checkpoint is `a4c29ee`; a handoff-only commit follows it. Read the [cleanup plan](../plans/2026-10-18-codex-run-cleanup.md) for scope and the [session summary](../session-summaries/2026-10-18-codex-run-cleanup-summary.md) for detailed evidence and limitations. Check current Git state before editing; the references below describe this handoff's snapshot.

The next action is resolving the pending reviewer-model choice. The owner has **not** approved delegation or merging. Their latest request was to write this handoff.

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

1. **Resolve review authorization.** The pending proposal is two GPT-6.1-sol reviewers at high reasoning effort. The owner's AGENTS.md requires model approval before delegation; the Impeccable critique requires independent assessments. No agents were spawned. The owner may instead authorize a disclosed single-context review. Check for a newer explicit answer before asking again.
2. **Complete and record the UI review.** Apply the installed Impeccable critique and audit workflows to Working, Storyboard and ShotSheet, using fresh running-browser evidence. Follow the current repo instructions and saved references. Record findings and adjudicate the 39 inherited font-size advisories against `DESIGN.md`; neither task has been completed. Findings are follow-ups in this cleanup, rather than authorization to change the UI. This step is complete when the critique, audit, evidence and typography decision are written into the cleanup record.
3. **Obtain the owner's merge go-ahead.** `main` remains at `5f3a23d`; `codex/random-audio-seeds` remains at `367c95e`. The seeds branch changes its generation script, sound guidance and plan records. Neither branch was merged or pushed. Review authorization alone does not authorize merging.
4. **After explicit merge approval, finish integration and closure.** Merge the seeds and cleanup branches into `main`, resolve any integration issues, and verify the resulting changes appropriately. Regenerate the dashboard with `powershell -NoProfile -File docs/plans/build-plans-index.ps1` after plan/summary updates. Mark the cleanup plan Done only when both remaining outcomes satisfy its original Intent, and update the summary with review, merge and verification evidence. Push only with explicit authorization.

## Workspace and follow-ups

Tracked files were clean before writing this handoff. Preserve the untracked local media, `.kinotta-server.json`, test evidence, and the separate inline-card plan, mockup, brief directory and tickets. They were excluded from cleanup commits.

The viewer regression rewrites historical October 15 evidence. This run's generated copies were saved to `tests/artifacts/codex-run-cleanup-review/render-viewer/`, then the historical tracked files were restored. The temporary review fixture server was stopped. A fixture helper remains at `tests/artifacts/codex-run-cleanup-review/server.mts`; its saved URL/PID are stale, so start a fresh fixture if reusing it.

Two recorded follow-ups are outside the completed changes: `.impeccable/design.json` is stale relative to `DESIGN.md`, and the legacy-media hint in `MediaEditor.tsx` still mentions Save. The hint is a source-only observation, pending verification on a running legacy surface. Keep inline alternates, inspector controls, version compare, span pins and engine changes outside this cleanup.
