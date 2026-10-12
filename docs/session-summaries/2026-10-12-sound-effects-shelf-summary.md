# Sound effects shelf

The owner chose an Effects tab in Media on 2026-10-12. The approved layout is saved at `docs/mockups/2026-10-12-sound-effects-shelf.html` and recorded as D12 in the sound plan.

The tab lists all 19 bundled effects with name, approximate duration and description, and has independent search. Preview plays the original bundled file in the existing preview frame without importing it. Add at playhead imports exact bytes through the existing content-addressed media library and adds an audio placement on an existing Effects/SFX track, or creates an Effects track. The playhead is captured when Add is clicked. Placement duration comes from probing the file, not the approximate catalogue duration. Gain starts at 0.35 with no fades, preserving short transients. Select the clip and open Sound for detailed controls.

Catalogue loading and failures, failed import, retry, empty search and copying have visible states. Add is disabled while busy and for older versions. Original-file preview remains available in older versions. Repeated adds reuse one source and track. Undo removes the latest placement, and Save freezes the resulting track and source in a new version. Existing project media search, preview, import and dragging remain covered by their regression test.

## Test evidence

Tests were written before implementation at the existing public HTTP and editor seams.

```text
npx vitest run tests/core/sound-effects.test.ts
RED: catalogue request returned 404 instead of 200.
GREEN: 1 file passed, 1 test passed.

npx vitest run tests/core/render-sound-effects-editor.test.ts
RED: Effects tab was absent.
Final GREEN: 1 file passed, 1 test passed, 22.19s.

npm run typecheck
> tsc --noEmit
Exit 0.

npm run build
98 modules transformed. Build passed.
Existing 500 kB bundle warning remains.

npx vitest run --project unit --maxWorkers 4
70 files passed.
648 tests passed, 1 existing live-transcription test skipped (649 total).
98.69s.

npx vitest run tests/core/render-sound-effects-editor.test.ts tests/core/render-media-library.test.ts tests/core/render-timeline-window.test.ts
3 files passed, 3 tests passed, 38.32s.

npm run test:e2e -- tests/e2e/clips.spec.ts
3 passed, 51.1s.

git diff --check
Exit 0. Only existing LF-to-CRLF conversion warnings.
```

HTTP checks prove ranged MP3 preview, no import on preview, refusal of unknown/path-traversal identities, exact imported bytes and content reuse. Chromium checks search, native audio playback, catalogue failure/retry/loading, import failure/retry/busy, placement at 1.25 seconds, gain 0.35, repeated adds, Undo, Save, right Sound sidebar and disabled Add in v1 after saving v2. Companion DOM invariants run on these states, with a deliberately wrong row count rejected.

A real Draft render of the saved version decodes to silence before and after the sound, and its placed RMS matches the original sound multiplied by 0.35 within 0.001. Screenshot `C:/Users/ryand/AppData/Local/Temp/kinotta-effects-shelf.png` was visually inspected.

## Deviations

- The first combined `npm test -- --maxWorkers=4 --reporter=verbose` run reported 98 files passed and one file failed, with 755 tests passed, one failed and one skipped in 800.39 seconds. The native-lane test expected a Redo button while the approved audio-selection behavior had opened Clip. Diagnostics showed Clip selected, zero Redo buttons and `canRedo: true`. The test now opens Edits before checking Redo and focuses the timeline before its keyboard shortcut. Its isolated rerun passed in 5.25 seconds. The subsequent complete rerun passed, as recorded below.
- Effects bypass the editor's general default fades to preserve their short attacks. The source files remain unchanged.
- The existing edit operations create a track and add the first placement separately. Undo of that placement leaves an empty Effects track, which can be removed or undone through the existing track controls. Later adds reuse that track.
- Unit checks and targeted browser regressions overlapped in this run. All passed. The established four-worker limit was retained for unit checks.
- The approval review rejected restarting the existing editor process as blocked by policy before the restart command executed. Its old process therefore still lacks the new catalogue route. Restart Kinotta to load current code. The freshly started test servers ran and verified current code.

The subsequent complete rerun passed:

```text
npm test -- --maxWorkers=4 --reporter=verbose
Test Files 99 passed (99)
Tests 756 passed, 1 existing live-transcription skip (757 total)
Duration 823.82s
```

The native-lane check passed in that complete run. Full output is at `C:/Users/ryand/AppData/Local/Temp/kinotta-sound-final-suite-rerun.log`. Final typecheck and whitespace checks passed.

Kokoro and Stable Audio live proof subsequently passed with owner-supplied local models, recorded in their separate summaries. Changes remain local and uncommitted under the agent-loop git-write prohibition. The owner explicitly authorized the later restart. The live catalogue then returned 19 effects, and browser search and Pop preview passed without importing any project media. Final evidence is in `2026-10-12-sound-validation-summary.md`.
