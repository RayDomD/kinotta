---
title: Free picture layout and agent audio tracks
date: 2026-10-11
status: Done
summary: Independent picture regions with preview/render parity, and Kinotta skill support for native audio tracks.
spec: docs/2026-10-07-audio-multiple-sources-grilling-decisions.md
---

## Intent

- Problem: Review displays only the last active picture, and the skill does not explain native media tracks.
- Why: Split screen and picture-in-picture need independent pictures. Agent rebuilds must retain the owner's audio mix.
- Proposed outcome: Custom picture regions with independent timing/framing and overlap, and agents able to author and preserve track plans.
- Affected: Shared media model, Python validator, Review Clip panel/player, FFmpeg compositor, Kinotta skill and related tests.
- Constraints: AM21/AM28 layout decisions, frozen versions, occurrence identity, one shared audio mix and existing Undo/Redo/Save.
- Out of scope: Recording, grading, ducking, additional delivery ratios and unrelated documentation corrections.
- Open questions: None. Existing layout decision C permits arbitrary rectangular regions with overlap.

## Goal

Pictures have independently editable rectangles in canvas fractions. Main pictures retain sequence timing; inserts retain independent timing. Picture layers supply front/back stacking for both main pictures and inserts. Preview, Save and render retain regions and audio tracks. The skill documents validated native track authoring and preservation.

## Approach

Extend source placements with an optional region, defaulting to full frame. Reuse placement-change and placement-layer operations, with explicit picture layers independent of main-sequence timing. Add simultaneous picture playback, Clip presets/numeric controls and frame move/resize handles. Apply the same regions in the FFmpeg compositor. Extend the skill through a conditional native-media reference and an executable example.

## Steps

1. A1: Failing model/engine regressions, then region validation and operation support.
2. A2: Composition and simultaneous playback with failure/hold handling.
3. A3: Clip controls and direct manipulation, including keyboard-accessible numeric alternatives.
4. A4: Native-media skill reference, track authoring and frozen-source rules.
5. A5: Browser, decoded render, Save/history and existing regression checks.

## Risks

- R1: Several video clocks must hold with the audio clock when any required picture stalls.
- R2: Region rounding at output pixels must retain framing and overlap across rendering presets.
- R3: Agent rebuilds must retain owner track identities, levels, media bytes and occurrence references.

## Checks to run

Typecheck, build, unit suite, new browser/render checks, existing picture synchronization/preview/render tests and full end-to-end suite.

## Changelog

### 2026-10-11
- Plan created. Region regressions failed before implementation. Shared model and Python validation now pass 113 focused checks.
- Completed F2 and F3. Typecheck/build, 611 unit checks and all 110 end-to-end checks pass. All 26 relevant preview/render checks pass across final runs, with one intermittent first-pass framing failure recorded explicitly. Installed skill reference matches the repository. Evidence: `docs/session-summaries/2026-10-11-free-layout-and-agent-tracks-summary.md`.
