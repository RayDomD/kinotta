# Beat editing implementation

Implemented phase 7 after ducking and track EQ, following the approved Sound sidebar. Changes are local and uncommitted. No git writes, model downloads or external sends were performed.

## Result

- F1: `scripts/beats.py` reads local music through FFmpeg and writes tempo, ordered source beats and estimated downbeats. Librosa 0.11.0 and Numba 0.68.0 installed successfully on Python 3.14.3. A known 120 BPM accented click track and silence passed detection checks.
- F2: The source's optional beat grid is validated by both engines, edited through source-beats operations and frozen on Save. The editor caches analysis by exact content hash. A changed or missing original is rejected. Detect again explicitly replaces cached timing.
- F3: Timeline ticks follow trims, placement offsets and loops. Downbeats are taller and highlighted. Display, emphasis and snapping are separate preferences. Beat snapping also needs the timeline Snap switch. The browser checks snapping on and off, failed detection and retry, saved timing and the unchanged prior version.

## Choices and deviations

- D1: Librosa tracks beats and tempo. Downbeats use recurring accent strength in a default four-beat bar, so the UI labels them as estimates. The script accepts `--beats-per-bar` from 1 to 12 and a zero-based `--first-downbeat` index for correction. No claim of automatic musical-meter recognition is made.
- D2: A source-beats operation carries the computed grid as a snapshot. Analysis changes neither the source bytes nor frozen versions. Undo restores the earlier grid. New versions preserve the updated timing alongside the exact source copy.
- D3: Detection is optional. Argument validation and missing-runtime guidance work without Librosa. Tests that perform live detection skip when the package is absent. This machine ran them with the installed runtime.
- D4: The existing responsive test found the Sound tab extended 20 pixels beyond the sidebar at 1024 pixels. Tabs now wrap when needed. This small layout correction belongs to the approved Sound sidebar, and the existing test now reports overflow details.

## Test evidence

The detection test failed before the script existed. The timing test failed before the source-beats operation and mapper existed. Shared invalid-grid fixtures failed in Python before its validation was added. The browser test failed before markers were drawn. Visual inspection exposed a pre-existing span-position rule overriding marker positioning, confirmed by a failing computed-style assertion and corrected by excluding beat spans from that rule.

The missing-runtime test exposed a Windows stderr encoding issue in a non-ASCII range label. The command's argument error now uses an ASCII range. No detection logic changed for that correction.

```text
npm run typecheck
> tsc --noEmit
Exit 0

npm run build
✓ 98 modules transformed.
Exit 0

npm test -- --project=unit --maxWorkers=4
Test Files  69 passed (69)
Tests       647 passed | 1 skipped (648)
Duration    59.59s

npm test -- tests/core/media-beat-detection.test.ts tests/core/media-beats.test.ts tests/engine/media-model.test.ts tests/core/media-model.test.ts --maxWorkers=2
Test Files  4 passed (4)
Tests       140 passed (140)
Duration    30.32s

npm test -- tests/core/render-timeline-window.test.ts tests/core/render-media-beats-editor.test.ts --maxWorkers=2
Test Files  2 passed (2)
Tests       2 passed (2)
Duration    17.44s

npm test -- tests/core/render-media-beats-editor.test.ts
Test Files  1 passed (1)
Tests       1 passed (1)
Duration    15.79s
Includes kinotta check founder-talk v2 --project <temporary-project>:
founder-talk v2: no contract issues

npm run test:e2e -- tests/e2e/clips.spec.ts --workers=2
3 passed (1.1m)

git diff --check
Exit 0, no whitespace errors
```

The unit suite's skip is the existing live transcription test. The full render suite was not run in this step. The first broader targeted run passed the beats, ducking, EQ and 13 existing playback tests, and failed only the responsive timeline test. That failure was fixed and both the timeline and beats browser tests then passed. The sidebar was visually inspected at 1440 × 1000, including marker positions and downbeat emphasis. The responsive test checks 1024, 1272 and 1600 pixels, with the media rail open and closed. Beat timing does not change rendered audio.

The final browser fixture includes a scene so its saved version can also pass the page contract check. The earlier audio-only fixture correctly failed that check for having no scenes. No application behavior was changed to suppress the contract issue.

## Next

Preview the sound-effects shelf before implementing it. Kokoro synthesis and Stable Audio generation retain their documented owner gates. The full sound-sourcing goal remains active.
