# Track EQ implementation

Implemented phase 3 after the owner approved the detailed Sound sidebar and asked to proceed one phase at a time. Changes remain local and uncommitted. No git writes or external sends were performed.

## Result

- F1: The Sound sidebar edits the selected clip's entire track. It shows the shared scope, presets, a response curve, editable filters, filter enable and track bypass. Undo and Save use the existing edit history.
- F2: Both validators accept the same five filter types and parameter bounds. Playback and rendered audio apply the active filters after track gain at 48 kHz. Overload measurement includes EQ boosts without normalization or limiting.
- F3: Saved versions retain the track EQ for every clip on that track, while the previous version remains unchanged. Pause, seek and edit disconnect the previous audio graph.

## Choices and deviations

- D1: Added optional `enabled` on each filter and `eqBypass` on each track to preserve settings while using the approved sidebar toggles. These extend the plan's initial filter shape to implement the approved controls.
- D2: Maximum eight filters. Frequency is 20–20000 Hz, gain is within ±24 dB and linear Q is 0.1–10. Missing gain is zero and missing Q is √½. Shelves ignore Q.
- D3: Preview uses the render's 48 kHz rate. Cut-filter Q is converted to the Web Audio representation. The literal FFmpeg low/high shelf filters match the browser response. The bass/treble aliases tested during implementation use a different response and were removed.

## Test evidence

The first track-change test failed before EQ was an allowed edit. Shared malformed-EQ fixtures failed before Python validation was added. Both passed after implementation. The response sweep initially exposed shelf mismatches and insufficient settling time at the lowest resonant frequency. The matching shelf filters and six-second tones resolved both.

```text
npm run typecheck
> tsc --noEmit
Exit 0

npm run build
✓ 97 modules transformed.
Exit 0

npm test -- --project=unit --maxWorkers=4
Test Files  66 passed (66)
Tests       634 passed | 1 skipped (635)
Duration    50.46s

npm test -- tests/core/render-media-eq-response.test.ts tests/core/render-media-eq-editor.test.ts tests/core/render-media-duck-editor.test.ts tests/core/render-media-preview.test.ts tests/core/render-media-tracks.test.ts --maxWorkers=2
Test Files  5 passed (5)
Tests       17 passed (17)
Duration    110.36s

npm run test:e2e -- tests/e2e/clips.spec.ts --workers=2
3 passed (51.6s)

git diff --check
Exit 0, no whitespace errors
```

The unit suite's skip is the existing live transcription test. The full render suite was not run in this step. The targeted run includes the ducking browser/render test, all 13 existing preview tests and the existing track-render test. The response test compares 15 filter configurations against Web Audio at six frequencies, including validation boundaries. Settled responses agree within 0.1 dB above a −80 dB numerical floor. The browser test measures actual preview audio, checks shared-track selection, presets, enable, bypass, Undo and Save, then checks decoded rendered audio on both track clips. Preview and rendered RMS match their expected boosted level within 0.01. The sidebar was visually inspected at 1440 × 1000.

## Next

Beat detection, timeline markers and snapping are next, using the approved Sound sidebar. The effects shelf still needs its own preview. Kokoro synthesis and Stable Audio generation retain their documented owner gates.
