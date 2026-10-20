# Codex phases 2 and 3 result

## Baseline before source edits

- `npx vitest run --maxWorkers=2`: sandbox attempt failed before discovery (`spawn EPERM`); elevated attempt stalled between files and was interrupted.
- The stalled run reported `tests/web/editor-settings.test.ts` → `viewer editor settings > keeps Snip, Split, Media and trim keys distinct and identifies equivalent rebindings`: expected `rail`, received `marker` for `M`. An isolated unchanged run confirms the same failure (3 other tests pass).
- A thread-worker diagnostic and an isolated unit-project diagnostic also stalled and were interrupted.
- `npx vitest run --maxWorkers=2 --no-isolate --reporter=verbose`: completed before implementation in 1131.45 seconds: 129 files passed, 2 files failed; 934 tests passed, 2 failed, 1 skipped.
- Complete baseline failure list:
  - `tests/web/editor-settings.test.ts`: `viewer editor settings > keeps Snip, Split, Media and trim keys distinct and identifies equivalent rebindings` (expected rail, received marker).
  - `tests/core/render-media-elements.test.ts`: `reattaches a graphic to the pass of a looping voice under the playhead (A2)` (expected clip-attachment operation, received empty list).
- Unchanged `tests/core/versions.test.ts`: 13 passed. Unchanged `tests/web/transcribing.test.ts`: 4 passed.

## Implementation and verification

Phase 2:

- Removed the approval implementation, HTTP handler, client calls, watcher events, badges and controls.
- Moved `requireVersionDir` to `version.ts` for render and media callers. Legacy version folders and passive approval metadata on disk remain untouched.
- Replaced numbered history with Current, edit count and durable Undo/Redo. New builds refresh Working.
- Kept contract-based rendering refusals; fixed the remaining Render action's alignment so the rail does not cover its popover.
- `npx tsc --noEmit`: passed.
- Targeted Vitest (versions, Working renders, alternate pages, render gate): 34 passed in 4 files.
- Picker browser checks: 2 passed, including refused Overlay, Working Draft render and finished-file playback. Current browser checks: 3 passed, including new-build refresh and retained frozen storage.
- Removed approval-only tests; retained render contract checks.

Phase 3:

- Simple mode opens by default on a new browser tab. An explicit editor switch survives reload in that tab. Switching modes retains the selected reel and loads Working.
- About you records name, handle, what you make, language, destination, finishing preference and music in browser-local storage. Your profile edits those defaults. Storage failures leave the profile usable for the current visit and explain that it was not persisted.
- Reused DropZone for file/folder import and the existing reel-creation API for Make. Existing project videos can also be chosen. Playback can open while transcription finishes; pin creation waits for a version.
- Added a portrait preview using Review's existing player, with a portrait page viewport, play control, timeline and scrubber. Watching, seeking and adding pins do not edit Working.
- Timeline click or keyboard activation opens a composer. Whitespace-only notes cannot be saved. Pins reuse FramePin/comment storage; the list shows timestamp, note and status and supports jump, previous/next, `[` and `]`, editing and deletion.
- Regenerate copies the existing comment-batch request. Multiple sections are combined, following the new version number if the first batch freezes changed Working. Clipboard failure leaves the full saved request available to select and copy.
- Updated detailed-editor test entry points to select that surface explicitly; replaced history-chooser assertions with Current and retained-storage assertions.
- Preserved inline animated alternate playback, reduced-motion behavior, Use/Not this/Undo, and Review loading the chosen Working revision.

Browser validation after Phase 3:

- Five relevant specs (Simple mode, versions, Working, alternates, picker): 22 passed initially; one older alternate test expected a thumbnail element no longer present in the timeline.
- Replaced that obsolete thumbnail assertion with the current graphic row's title, retaining the real player revision and timing assertions. Its focused rerun passed, including focus and Undo.
- All 3 Simple-mode tests passed on the final surface: required-note pins, exact stored time, previous/next and bracket navigation, reload persistence, clipboard content, preview playback without edits, same-reel editor switch, Make, multi-section freeze/copy and blocked-clipboard fallback.
- Combined focused coverage: 24 distinct browser scenarios passed across the main run and focused reruns. Full Playwright was not run.
- Desktop and 390px captures were inspected. The second capture confirms a 9:16 frame, no player/timeline overlap, and no horizontal page overflow.
- Design detector: one advisory for a 16px heading outside the documented ramp; changed it to the documented 15px title step. No detector ignores were added.
- Full post-change command: `npx vitest run --maxWorkers=2 --no-isolate --reporter=verbose`. It completed in 1106.77 seconds: 125 files passed, 5 failed; 918 tests passed, 6 failed, 1 skipped (925 total). Approval removal deleted 12 tests relative to the 937-test baseline.
- That run exposed two additional checks in `render-media-preview.test.ts`: one still expected Current to select frozen media, and one encountered duplicate Undo controls after opening the rail. The first now checks immutable media through the retained frozen endpoint. Review uses its existing side-panel Undo/Redo; the new rail controls are visible in Storyboard. The entire affected file then passed: 13/13. Current/Undo browser checks passed again: 2/2.
- Additional full-run failures and follow-up evidence:
  - `render-media-preview.test.ts` / `previews legacy graphics in source time and saves a deliberate repair after native reordering`: corrected frozen-storage assertion; passed in the 13/13 file rerun.
  - `render-media-preview.test.ts` / `flags an interrupted graphic in the editor and repairs it with an explicit trim or new footage range`: removed duplicate Review Undo controls; passed in the 13/13 file rerun.
  - `render-sound-effects-editor.test.ts` / `previews, searches and adds bundled sound at the playhead with reusable content and Undo/Save`: its last verification now explicitly reopens Media after inspecting Reel; 1/1 passed on rerun.
  - `render-overload.test.ts` / `kinotta render refuses an overloaded mix with where it overloads, and renders it with --accept-overload`: the first child process exited with code 3221226505. It passed unchanged on focused rerun (1 passed, 2 unselected tests skipped); the cause of that process exit was not established.
- The unresolved failures are exactly the two baseline failures listed above. The full run itself was not green; its four additional failures were resolved or passed unchanged on the recorded targeted reruns. A second full run was not performed.
- Final build, `npx tsc --noEmit`, and `git diff --check`: passed.
- Phase 2 commit: `794e210` (`refactor: remove approval and show the current reel`). Phase 3 is committed separately.
- Captured evidence: [desktop](../../session-summaries/2026-10-20-simple-mode-codex/desktop.png), [mobile](../../session-summaries/2026-10-20-simple-mode-codex/mobile.png).

## Boundaries and unfinished work

- Agent launch, per-pin generation progress, generated choices, dead-air cutting and export changes belong to later phases and are not implemented here.
- Regenerate deliberately uses the existing full comment batches, including previously copied pins. New/changed-only dispatch is Phase 5.
- Profile persistence is browser-local on this machine, matching the approved mockup; it is not a shared server-side account/profile store.
- The two pre-existing baseline failures remain outside this brief.
- No independent delegated design review was run. [Impeccable](C:/Users/ryand/.codex/skills/impeccable/SKILL.md), through its [new-work instructions](C:/Users/ryand/.codex/skills/impeccable/reference/new-work.md), says "Then spawn the shipped finish reviewer". AGENTS.md requires approval of the model and effort before delegation; that approval was requested and has not been granted. Direct screenshot inspection and interaction checks were completed.
- No push or merge.
