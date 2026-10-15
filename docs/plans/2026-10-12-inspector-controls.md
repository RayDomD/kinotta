---
title: inspector-controls
date: 2026-10-12
status: Draft
summary: On/off settings become tally lamps and bounded numbers become scrub fields with a typeable number.
spec:
---

## Intent

- Problem: The Review editor's panels use the browser's own checkboxes and bare number boxes. They do not look like Kinotta, and a level or fade can only be typed, not dragged.
- Why: Volume, fades and ducking are set by ear. Dragging while listening is faster than typing a number and tabbing out.
- Proposed outcome: Every on/off setting in the editor is the tally lamp from the mockup. Every number with a known range is a scrub field with its number beside it, still typeable.
- Affected: `web/src/review/_internal` (`SoundSettings.tsx`, `ClipSettings.tsx`, `EditorSettingsSheet.tsx`, the graphic scale field in `MediaEditor.tsx`), `web/src/review/review.css`, `web/src/styles.css`, tests under `tests/core` and `tests/e2e` that drive these fields. Mockup: `docs/mockups/2026-10-12-inspector-controls.html`.
- Constraints: `DESIGN.md` tokens, zero radius, the One Light Rule (the ice blue lights only the lamp that is on and the field being held). The same edit operations are issued with the same values. Labels stay as they are so screen readers and tests find the controls by the same names.
- Out of scope: Numbers with no upper bound stay number boxes: In, Out, Start, Duration, Point time, Playhead, EQ frequency, Sound seed and length. The "Include contract issues" and "Render with the overload" checkboxes outside the editor stay checkboxes; the second is a consent, not a setting.
- Open questions: None.

## Goal

The editor's panels match `docs/mockups/2026-10-12-inspector-controls.html`: no native checkbox or bounded number box remains in `web/src/review/_internal`, and every changed control issues the edit it issued before.

## Approach

Two small components in `web/src/review/_internal`, each with a `.verify.ts` like its neighbours:

1. `Lamp`: a `button` with `role="switch"`, `aria-checked` and the existing label. Props: `checked`, `disabled`, `label`, `onChange`. Replaces the 11 checkboxes in `SoundSettings.tsx` (EQ filter enabled, Bypass EQ, the three beat settings), `ClipSettings.tsx` (Mute, Loop, Speech) and `EditorSettingsSheet.tsx` (Snap, Open rail at start, Show toolbar labels).
2. `ScrubField`: a `role="slider"` bar plus the existing number input. Props: `min`, `max`, `step`, `value`, `disabled`, `label`, `onCommit`. A drag shows the value live and commits once on release, so one drag is one edit and one undo step. Arrow keys step by `step`. The number input keeps today's commit-on-blur behaviour and its `aria-label`.

Fields that become scrub fields, with the range each already declares: clip volume and level (0 to 2), fade in and fade out (0 to the clip's length), ducking amount and ramps, picture region and framing (0 to 1), volume point level (0 to 2), EQ gain and Q, graphic scale, and the nudge and default fade in the settings sheet.

## Steps

1. `Lamp` with its verify file and a failing browser test, then replace the checkboxes in the three files.
2. `ScrubField` with its verify file and a failing browser test for drag, arrow keys and typing, then replace the bounded number fields.
3. Update the tests that call `.check()` or `.fill()` on changed controls where the new roles need it.
4. `/impeccable critique` and `/impeccable audit`, then the session summary.

## Risks

- Tests call `.check()` on some checkboxes (`render-native-lanes`, `render-review-shell`). Playwright's `check()` on `role="switch"` needs confirming; `.click()` is the fallback.
- A fade's maximum depends on the clip's length, so the scrub range changes per clip. The number stays the exact entry.
- A drag that committed on every pointer move would flood the edit list and the undo history. Commit on release only.

## Checks to run

- Typecheck, build, `tests/core/render-media-beats-editor`, `render-media-eq-editor`, `render-media-preview`, `render-overload`, `render-native-lanes`, `render-review-shell`, and the new component tests, one worker.

## Changelog

### 2026-10-12
- Plan created. The owner chose the tally lamp and the scrub field with a number from the preview session; the choice is saved as `docs/mockups/2026-10-12-inspector-controls.html`. Awaiting approval.
