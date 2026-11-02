---
title: Stop tests leaking temp folders
date: 2026-11-01
status: Approved
summary: Tests leave about 61 GB and 158,000 kinotta-* folders in Temp. One shared helper never deletes what it makes; fix it, move the other sites onto it, and add a guard.
spec:
---

## Intent

- Problem: Every test run leaves `kinotta-*` folders in the Windows Temp folder and nothing removes them. A scan found 158,393 entries, 1.9 million files and 60.9 GB, in 683 name prefixes.
- Why: The disk fills, and the leftovers make every temp scan, backup and cleanup slow. Folders from other lanes' runs also hide the evidence a lane leaves on purpose.
- Proposed outcome: A full unit, render and e2e run leaves no new `kinotta-*` entry in Temp, and a new test cannot add one without a guard failing.
- Affected: `tests/helpers/project.ts`, the 37 test files that call `mkdtemp` directly, `tests/e2e/start-server.mjs`, `vitest.config.ts` and `playwright.config.ts`.
- Constraints: Tests must pass as before. Several lanes run tests at once in different worktrees, so one run must never delete another run's folders. Windows locks files that a child process still holds. CI configuration stays unchanged.
- Out of scope: Deleting the 61 GB already on disk (a separate step, see Open questions). Running render and e2e in CI. The two shipped files that use `mkdtemp` (`server/core/_internal/instant-effect.ts` and `skill/kinotta/engine/beats.js`): both already remove their folder in a `finally`.
- Open questions: Delete the existing leftovers now by mechanical rules (older than 3 days, empty, no links), or leave them? The earlier cleanup attempt was blocked by the permission check and is waiting for the owner.

## Goal

A test run cleans up after itself, and a guard keeps it that way.

## Approach

**Cause (measured, from the Temp inventory).** `kinotta-test-*` alone is 124,298 folders and 45.2 GB; `kinotta-e2e-*` is 8,345 folders and 5.3 GB. Together that is 83% of the space. Other test prefixes account for most of the rest (`copy-round-trip` 2.1 GB, `cuts-pub` 0.7 GB, `edit-reason`, `captions`, `engine`, `templates`). Lane evidence is a few dozen folders.

The creator of the biggest group is `tests/helpers/project.ts`: `copyFixture()` (105 files call it) and `emptyProject()` (29 files) each make a folder with `mkdtempSync` and return the path. Nothing deletes it, and no global teardown exists in `vitest.config.ts` or the Playwright config. The e2e server (`tests/e2e/start-server.mjs`) makes a project folder and a home folder on every start and never removes them. 37 test files call `mkdtemp` directly; most of them have no cleanup either.

**Design.**
1. **One run folder.** A new helper `tests/helpers/temp.ts` gives each test run its own root, `kinotta-test-run-<pid>-<time>` under the system temp folder, and exports `tempDir(prefix)` that makes a folder inside it. The run root name carries the process id, so runs in different worktrees never share one.
2. **Teardown in the main process.** A Vitest `globalSetup` (added to the `unit`, `process-heavy` and `render` projects) creates the run root, passes its path to workers through an environment variable, and deletes the whole root when the run ends. It runs in the main process, so it still happens when a worker is killed. A test file run on its own still goes through it.
3. **Sweep for crashes.** The same setup first deletes any `kinotta-test-run-*` and `kinotta-e2e-*` folder older than 6 hours. That removes what a crashed or interrupted run left, and the age limit keeps it away from runs that are still going.
4. **Fallback.** If a worker sees no run root (a test imported outside Vitest), `tempDir` makes its own root and removes it on process exit.
5. **e2e.** `start-server.mjs` removes its project and home folders on exit and on termination signals, and a Playwright `globalSetup` runs the same stale sweep. Windows can kill the server without running the handler, so the sweep is the backstop.
6. **Move the other sites.** `copyFixture` and `emptyProject` call `tempDir`. The 37 files with direct `mkdtemp` calls switch to `tempDir(<their prefix>)`, keeping their prefix so a leftover is still traceable to its test.
7. **Guard.** A unit test, `tests/core/no-bare-temp-dirs.test.ts`, scans `tests/` for `mkdtemp` and fails with the file and line when a call sits outside `tests/helpers/temp.ts`. It runs under CI's existing `--project unit`, so no CI file changes. It lists exceptions by exact file in the test itself.

**Check on the cause.** The same Temp scan, repeated after a full run, must show zero new `kinotta-*` entries.

## Steps

1. Helper, `globalSetup` for the three Vitest projects, `project.ts` switched over, the guard test and its exception list. One commit: `test: give every test run one temp root and remove it afterwards`. Lane: codex (it needs judgment on workers, Windows locks and concurrent runs).
2. Playwright side: `start-server.mjs` cleanup and the stale sweep. One commit: `test: remove the e2e server's temp folders`. Lane: codex.
3. Move the 37 direct `mkdtemp` files onto `tempDir`, one commit per folder (`tests/engine`, `tests/core`, `tests/e2e`, `tests/web`). Lane: agy, one subagent per folder, since the edits are mechanical and do not overlap.
4. Gate leak check in `scripts/verify-lane.mjs`: list the `kinotta-*` entries in the temp folder before the gate runs and after it finishes, and fail the gate when new ones remain, printing up to 10 names. An entry whose name is a run root with a live process id is another lane's running test and is ignored. This catches any leak the guard test cannot see, such as a new code path that calls `os.tmpdir()` without `mkdtemp`, or a spawned process. One commit: `chore: fail the lane gate when a run leaves temp folders behind`. Lane: codex, after steps 1 and 2 are verified.
5. Claude runs the verification below and writes the Result.

## Risks

- A test that deliberately reads its folder after the run (to keep an artifact) would lose it. Step 3 treats every such file as an exception to list, not to convert.
- Deleting a folder a child process still holds can fail on Windows. Teardown retries briefly, then leaves it for the next run's sweep.
- A global teardown that runs too early deletes a live run. The 6-hour age limit and the pid in the run folder name guard against it.
- Moving 37 files at once could break a test that depends on its prefix. Each file's tests run before it is committed.

## Checks to run

- `npm run typecheck`, `npm run check:docs`.
- `npx vitest run --project unit` and `--project process-heavy`, then `--project render`, and `npx playwright test` on the e2e specs that start a server.
- Before and after count of `kinotta-*` entries in Temp around one full run, from the same scan that found the 158,393. Pass means no net new entry.
- The guard test fails when a bare `mkdtemp` is added to a test file, shown with a temporary change that is then reverted.
- Run two worktrees' test runs at the same time and confirm each run's folders survive the other's teardown.

## Changelog

### 2026-11-01
- Plan created as Draft from the retro finding F7 and the Temp inventory.
- Owner approved the plan. Status set to Approved.
- Owner asked how to avoid this in future; added step 4, a gate leak check that fails when a run leaves `kinotta-*` folders behind.
