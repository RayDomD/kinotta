# Codex phases 2 and 3 result

## Baseline before source edits

- `npx vitest run --maxWorkers=2`: sandbox attempt failed before discovery (`spawn EPERM`); elevated attempt stalled between files and was interrupted.
- The stalled run reported `tests/web/editor-settings.test.ts` → `viewer editor settings > keeps Snip, Split, Media and trim keys distinct and identifies equivalent rebindings`: expected `rail`, received `marker` for `M`. An isolated unchanged run confirms the same failure (3 other tests pass).
- A thread-worker diagnostic and an isolated unit-project diagnostic also stalled and were interrupted.
- `npx vitest run --maxWorkers=2 --no-isolate --reporter=verbose`: completed before implementation in 1131.45 seconds: 129 files passed, 2 files failed; 934 tests passed, 2 failed, 1 skipped.
- Complete baseline failure list:
  - `tests/web/editor-settings.test.ts` ? `viewer editor settings > keeps Snip, Split, Media and trim keys distinct and identifies equivalent rebindings` (expected rail, received marker).
  - `tests/core/render-media-elements.test.ts` ? `reattaches a graphic to the pass of a looping voice under the playhead (A2)` (expected clip-attachment operation, received empty list).
- Unchanged `tests/core/versions.test.ts`: 13 passed. Unchanged `tests/web/transcribing.test.ts`: 4 passed.

## Implementation and verification

Phase 2:

- Removed the approval implementation, HTTP handler, client calls, watcher events, badges and controls.
- Moved `requireVersionDir` to `version.ts` for render and media callers. Legacy version folders and passive approval metadata on disk remain untouched.
- Replaced numbered history with Current, edit count and durable Undo/Redo. New builds refresh Working.
- Kept contract-based rendering refusals; fixed the remaining Render action's alignment so the rail does not cover its popover.
- `npx tsc --noEmit`: passed.
- Targeted Vitest (versions, Working renders, alternate pages, render gate): 34 passed in 4 files.
- Picker browser checks: 2 passed, including refused Overlay, Working Draft render and finished-file playback. The updated Current tests are being completed separately.
- Removed approval-only tests; retained render contract checks.
