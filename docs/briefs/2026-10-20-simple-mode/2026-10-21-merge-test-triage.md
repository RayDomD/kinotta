# Simple merge test triage - 2026-10-21

## Scope and saved work plan

Target: feat/simple-mode, starting HEAD b1ee66f; merge 2e7372b compared with ad7f05f. The later three commits change only docs/plans. Do not edit plans/mockups, other worktrees, or known baseline failures. Leave existing screenshot changes and docs/notes untouched. No push.

1. Run the full Vitest suite with JSON per-test results in TEMP. A sandbox startup attempt failed with spawn EPERM; the requested outside-sandbox run is in progress.
2. Compare all failing test names and setup failures with the combined-branch baseline in codex-result.md. Rerun every new failing file sequentially and retain JSON/log evidence in TEMP.
3. Trace reproducible new failures to ad7f05f..2e7372b. Make only small, scoped source/test corrections; report larger behavior changes without implementing them. Commit each logical fix on feat/simple-mode using Conventional Commits, with hooks/signing enabled.
4. Verify each corrected file alone and npm run typecheck. Append the complete classification table and results to this note and the task brief.

## Baseline used

The brief treats the combined-branch failures as baseline: editor-settings M-key; render-media-elements A2; snip-save's 12 named failures; viewer-state marker ordering; render-media-preview's 3 Current-row waits; render-footage beforeAll snip setup. Do not confuse those with the older two-failure baseline earlier in codex-result.md. Nine footage cases skipped due to the baseline setup failure are not individually failing assertions.

## Results

Full run at starting HEAD b1ee66f, with no source/test edits:

`npx vitest run --reporter=json --outputFile="$env:TEMP/kinotta-simple-merge-full.json"`

The sandbox attempt failed at config loading with spawn EPERM. The same command completed outside the sandbox with exit code 1 in 992.31 seconds: **8 files failed / 124 passed (132); 13 tests failed / 945 passed / 1 skipped (959)**. The JSON reporter also counts nested suites (15 failed / 276 passed); those are not file counts. This run did not reproduce the brief's earlier 15-file / 22-test result. Unlike the recorded combined-branch baseline, this requested command uses default worker/isolation settings rather than --maxWorkers=2 --no-isolate.

Classification: **1 baseline failure; 11 new-flaky timeout failures across six unchanged files; 1 new-merge test-setup failure**. All seven files containing new failures were rerun individually, sequentially, outside the sandbox with verbose and JSON reporters. The six flaky files pass unchanged (55 tests total). Passing alone is the operational flaky classification requested by the brief; it does not prove a particular resource-contention cause.

### Complete full-run failure table
| File | Test name | Class | Isolated-run evidence |
| --- | --- | --- | --- |
| tests/web/editor-settings.test.ts | viewer editor settings keeps Snip, Split, Media and trim keys distinct and identifies equivalent rebindings | baseline | Still fails alone: 3 passed / 1 failed; expected rail, received marker. Left unchanged. |
| tests/core/code-media-save.test.ts | adds sound to an authored page and saves a frozen sidecar without rebuilding its graphics | new-flaky | Full run: 5000 ms timeout. Unchanged file alone: 3 passed / 0 failed. |
| tests/core/handoff.test.ts | a hand-off freezes a snapshot while Working continues records the frozen snapshot, keeps collecting edits, and remembers the hand-off across a restart | new-flaky | Full run: 5000 ms timeout. Unchanged file alone: 4 passed / 0 failed. |
| tests/core/handoff.test.ts | a hand-off freezes a snapshot while Working continues ends the hand-off marker without discarding working edits or history | new-flaky | Full run: 5000 ms timeout. Unchanged file alone: 4 passed / 0 failed. |
| tests/core/legacy-media-editing.test.ts | pins legacy review moments and carries them through first native conversion without jumping to a new duplicate | new-flaky | Full run: 5000 ms timeout. Unchanged file alone: 13 passed / 0 failed. |
| tests/core/parts-batch.test.ts | parts batches keeps flagged feedback for a removed named shot in the pasted batch | new-flaky | Full run: 5000 ms timeout. Unchanged file alone: 2 passed / 0 failed. |
| tests/core/section-batches.test.ts | section batches keeps the numbers the comments column shows, and puts the reel note in every section batch | new-flaky | Full run: 5000 ms timeout. Unchanged file alone: 28 passed / 0 failed. |
| tests/core/section-batches.test.ts | section batches records each copy as the latest hand-off of its section, replacing an earlier one | new-flaky | Full run: 5000 ms timeout. Unchanged file alone: 28 passed / 0 failed. |
| tests/core/section-batches.test.ts | carry-forward leaves the batch files of the old version exactly as they were | new-flaky | Full run: 5000 ms timeout. Unchanged file alone: 28 passed / 0 failed. |
| tests/core/section-batches.test.ts | waiting persists across a version that leaves the section alone, and clears on the first that changes it | new-flaky | Full run: 5000 ms timeout. Unchanged file alone: 28 passed / 0 failed. |
| tests/core/section-batches.test.ts | waiting starts again when the newest version is copied | new-flaky | Full run: 5000 ms timeout. Unchanged file alone: 28 passed / 0 failed. |
| tests/core/version-media.test.ts | a version with independent media placements saves an independent caption correction and preserves the exact source bytes in the new version | new-flaky | Full run: 5000 ms timeout. Unchanged file alone: 5 passed / 0 failed. |
| tests/core/render-native-lanes.test.ts | leaves a gap on Delete and Apply snip so later clips keep their times, and closes the gap with Shift | new-merge | Before fix: 1 passed / 1 failed. Same navigation timeout after a fresh build. After one-line editor-entry fix: 2 passed / 0 failed. |
### Merge cause and smallest fix

The new `leaves a gap on Delete and Apply snip...` test was introduced by ad7f05f..2e7372b in `tests/core/render-native-lanes.test.ts`. It opened `page.goto(server.url)` and immediately searched for the detailed editor's Reels navigation. On feat/simple-mode the default surface is Simple (including its About you gate); the expected navigation is absent. Its neighboring test already uses the imported `openDetailedEditor` helper, which sets the editor session mode before navigating.

Changed only line 183 from `await page.goto(server.url)` to `await openDetailedEditor(page, server.url)`. No application source, assertions, timeout settings, key bindings, gap semantics or baseline tests were changed.

Build evidence matters: the original dist/web/index.html was dated 06:13:47, before merge 2e7372b at 06:37:28 +0800. Preserved the original full/alone results, rebuilt the UI, then reran the unchanged gap test: the same navigation timeout reproduced. Thus the corrected entry setup, rather than a stale-build explanation, is supported by a fresh-build reproduction. After the fix, the entire file passes 2/2 against that build. Its real browser scenario covers Delete leaving a gap, Undo, Apply snip preserving later clip time, Shift+Apply closing the gap, and Shift+Delete rippling. The other native-lanes drag/audio test also passes.

### Verification

- `npm run typecheck`: passed before and after the test correction.
- `npm run build`: passed outside the sandbox after an initial spawn EPERM; only Vite's chunk-size advisory remains.
- `npx vitest run tests/core/render-native-lanes.test.ts --reporter=verbose --reporter=json --outputFile=<TEMP>/kinotta-simple-merge-fixed-render-native-lanes.json`: **2 passed**, 15.66 seconds.
- Unchanged `tests/web/editor-settings.test.ts` alone: **3 passed / 1 failed**, confirming the M-key baseline. Left unchanged.
- `git diff --check`: passed. Only the one-line test correction and this result note are included in the fix commit; pre-existing screenshot modifications and docs/notes are excluded.
- No second full run: the only fix is test entry setup, and its entire file passed; no application behavior changed. The original full run remains red, and the baseline M-key assertion remains unresolved.

The other recorded baseline files happened to pass this full run unchanged: snip-save 27/27, viewer-state 3/3, render-media-preview 13/13, render-media-elements 2/2, render-footage 11/11 (including its formerly failing setup). This does not establish that those historical failures are fixed. No baseline work was performed.

### Raw evidence retained locally

All logs and per-test JSON are under `%TEMP%` (C:/Users/ryand/AppData/Local/Temp):

- `kinotta-simple-merge-full.{json,log}`: original full run.
- `kinotta-simple-merge-alone-<file>.{json,log}` for code-media-save, handoff, legacy-media-editing, parts-batch, section-batches, version-media and render-native-lanes: unchanged whole-file isolated runs.
- `kinotta-simple-merge-fresh-before.{json,log}`: unchanged focused gap test after rebuilding.
- `kinotta-simple-merge-fixed-render-native-lanes.{json,log}`: corrected whole-file rerun.
- `kinotta-simple-merge-baseline-editor-settings.{json,log}`: baseline confirmation.
- `kinotta-simple-merge-build.log`, `kinotta-simple-merge-typecheck-before.log`, `kinotta-simple-merge-typecheck-after.log`.

No plans, mockups, application source or other worktree files were edited. No push.
