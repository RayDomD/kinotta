# Timeline tracks

The approved mockup, `docs/mockups/2026-10-12-timeline-tracks.html` option A, is implemented. The Goal still matches the Intent: the sound tracks are reached without empty picture rows, and word editing remains available inside a selected caption.

## Shipped

- Time and comment pins are above the thin Reel overview.
- Graphics, inserts grouped by effective picture layer, Picture 1 and Captions appear when populated. Picture names are the only picture-header controls.
- A library drag shows a New picture track target for reels that support picture editing. Drops use the existing placement-add operation with the row's layer.
- Selecting a caption opens its words with a 64px minimum per word. Word text, timing and pins keep their source identities. Double-click or F2 retypes the phrase. Outside-click and Escape close it. Enter opens words and transfers focus, and Escape returns focus to the caption.
- Word timing handles support arrow keys through the existing nudge setting and word-timing operation, with visible keyboard focus.
- The glossary, component invariants and affected browser selectors are updated. No core media model or render behavior changed.

## Deviations and implementation findings

- The existing implementation already displayed transcription progress on its sound source's track, rather than on Words. That source-specific progress remains there, preserving the unchanged sound-track behavior and avoiding an empty caption row.
- The temporary drop row is shown only where picture editing is supported. Code-built reels retain their existing sound-only media editing scope.
- Word timing gained keyboard access during the audit. A public browser test failed before the change and passed after it.
- Opened words need their own time-to-pixel mapping when the minimum width expands a phrase. Pointer retiming uses the expanded phrase width and source times.
- Tests wait for a completed edit before issuing the next one. Library drops measure their destination after the temporary row appears. The earlier fixed-coordinate drag missed its shifted destination.

## Verification

| Check | Evidence |
| --- | --- |
| `npm run typecheck` | Passed after the final source changes. |
| `npm run build` | Passed. Existing bundle-size warning remains. Playwright rebuilt before the final keyboard e2e checks. |
| Focused Vitest checks | 12 distinct cases across render-native-lanes, render-editorial-lanes, render-media-library, render-editor-keys-drag, render-timeline-window, render-review-shell and word-pins passed across focused runs and reruns. |
| Final caption/native/window run | `npx vitest run tests/core/render-editorial-lanes.test.ts tests/core/render-timeline-window.test.ts tests/core/render-native-lanes.test.ts --maxWorkers=1 --reporter=verbose`: 3 files and 3 tests passed, 15.82 seconds. Covers the final keyboard timing change. |
| Selected e2e run | `npx playwright test tests/e2e/lanes.spec.ts tests/e2e/pins.spec.ts tests/e2e/review.spec.ts tests/e2e/editing.spec.ts tests/e2e/transcription.spec.ts tests/e2e/snip-save.spec.ts --workers=1 --reporter=line`: 36 passed, 4 failed, 1 did not run. Three failures expected always-visible words. One note-reload case failed independently of the timeline changes. |
| E2e rerun | `npx playwright test tests/e2e/editing.spec.ts tests/e2e/snip-save.spec.ts tests/e2e/transcription.spec.ts --workers=1 --reporter=line`: all 21 passed after updating the word-opening steps, 1.8 minutes. This covers every failed or unrun case from the first run. All 41 selected cases therefore passed across runs. |
| Final keyboard e2e | `npx playwright test tests/e2e/snip-save.spec.ts --grep 'a word is fixed\|keyboard only:' --workers=1 --reporter=line`: 2 passed after the final word-handle change, 52.6 seconds. |
| Deterministic UI scan | Impeccable detector returned `[]` for MediaEditor, NativeLanes and EditorialLanes. |
| Diff check | `git diff --check` passed before closeout. |

One focused test initially assumed Space would open a caption. Space is the editor's playback shortcut. Corrected the test to Enter and verified word focus, Escape focus return, blur-to-save, pointer retiming and keyboard retiming.

Logs are retained under `%TEMP%`: `kinotta-timeline-verified.log`, `kinotta-caption-final.log`, `kinotta-timeline-e2e.log`, `kinotta-timeline-e2e-rerun.log`, `kinotta-keyboard-e2e.log` and `kinotta-word-keyboard-red.log`.

The full Vitest suite was run before this layout change for the editor-fix closeout. Its three timing failures passed in isolation. It was not repeated after the timeline implementation. No clean single full-suite run is claimed.

## Critique and audit

DEGRADED: single-context review, requested by the owner. Browser inspection used the live showcase without edit operations. The browser evaluation API is read-only, so detector injection and a visible overlay were unavailable.

Critique: 32/40. The row hierarchy follows the approved mockup and reduces empty-state clutter. Caption words use progressive disclosure. The neutral frame, square geometry and state accents retain the product identity. Cognitive load is lower in the tracks, with the existing seven toolbar actions still visible.

Audit: 17/20. Accessibility 3, performance 3, responsive behavior 3, theming 4, implementation consistency 4. The shell checks cover both themes and widths from 390 to 1600px. Keyboard caption focus and word timing are tested. Drag previews and source identities retain their existing behavior.

Remaining P2 issue: very short sound bars need zoom for precise grabbing, as their handles shrink with the bars. Existing zoom is the workaround. No P0 or P1 finding remains in this pass. Questions skipped: one priority issue with an existing workaround.

## Next

The live-edits decisions are recorded and its Goal and Approach are drafted. That implementation approach requires approval before code. Shots as parts remains after live edits.
