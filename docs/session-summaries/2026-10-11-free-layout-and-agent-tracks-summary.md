# Free picture layout and agent audio tracks

Date: 2026-10-11, Asia/Manila.

Implemented the requested F2 and F3 against AM21/AM28 and the October 8 track model. Changes are local and uncommitted. No external sends.

## Finished work

- F2: Video and image occurrences have optional canvas-fraction regions. Full frame is the default. Review plays simultaneous pictures on independent source clocks, with the shared audio clock held when a required picture cannot keep up. Crop/Fit applies inside each region. The Clip tab supplies full-frame, half-frame and inset presets, custom percentage fields, frame move/resize handles and front/back actions for both main pictures and inserts. Explicit layers leave sequence timing independent. Region edits use existing Undo/Redo, replay and frozen Save. Frame pins resolve the top picture under the point.
- F3: The Kinotta skill now routes native plans and sound/layout requests to `reference/native-media.md`. It covers validated track authoring, owner track preservation, gain/mute/envelopes, inserts with detached sound, occurrence identity, picture regions/layers and frozen source/dependency copies. Its JSON example runs through the shared TypeScript model and Python engine, including code-only sound, music looping and fades. The installed skill's existing files are hard-linked to the repository. The new reference was copied to the installed reference folder and its bytes match.

## Verification

- V1: `npm run typecheck` passed, exit 0. `npm run build` passed, exit 0.
- V2: `npx vitest run --project unit --maxWorkers=4` passed 60 files and 611 tests, with one existing skip, exit 0, 45.61 seconds. This includes the shared malformed-region/layer matrix and executable skill example. Region/validator regressions failed before implementation.
- V3: `npx playwright test --workers=1 --reporter=line` passed all 110 checks, exit 0, 4.0 minutes.
- V4: Final focused render/browser coverage spans `render-media-regions.test.ts`, `render-media-layer.test.ts`, `render-media-sync.test.ts`, `render-media-preview.test.ts` and `render-media.test.ts`: 26 checks passed across final runs. The combined run passed four files and failed one framing assertion in the preview file, with 25 passes. The framing test then passed independently. The complete preview file was rerun with `npx vitest run --project render tests/core/render-media-preview.test.ts` and all 13 checks passed, exit 0, 40.70 seconds, without a production or test change. No claim is made that this intermittent first-pass failure was fixed.
- V5: New decoded output checks cover independent picture regions, timed overlap, Fit bars, a main picture in front of inserts, and the authored track mix in single/segmented renders. New browser checks cover presets, drag/resize, Undo, Save, unchanged previous-version bytes, track preservation, reopening, different source offsets, secondary-picture stalls and no page overflow at 1024px. The deliberate invalid picture-count invariant is detected.
- V6: Populated 1440px and 1024px screenshots were inspected in two bounded passes. Percentage fields were shortened to two decimal places, preserving full stored precision unless the owner changes a field. Final captures are beside this summary.
- V7: `git diff --check` passed. Git was used only for read-only status/diff checks.

## Limits

This is reproducible fixture and decoded-render verification. No customer production reel was completed manually. The entire expensive render project was not rerun. Recording and the other deferred features remain outside this request.
