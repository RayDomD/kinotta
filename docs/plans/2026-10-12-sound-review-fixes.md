---
title: sound-review-fixes
date: 2026-10-12
status: Done
summary: Fix the three findings from the Opus review of sound sourcing: beat nudge stall, voiceover ducking gap, duplicate effects.
spec: docs/plans/2026-10-11-sound-sourcing-and-effects.md
---

## Intent

- Problem: The independent review of `feat/sound-sourcing` found a keyboard-nudge stall on beats, an agent-placed voiceover that cannot be ducked from the Sound tab, and two effects pairs that are byte-identical.
- Why: Each contradicts the approved plan or its validation claims ("19 effects").
- Proposed outcome: Nudging passes every beat, an agent voiceover is duckable, and the catalogue lists only distinct sounds.
- Affected: `web/src/review/_internal/placement-edits.ts`, `skill/kinotta/reference/sound.md`, `skill/kinotta/assets/sfx/`, effect-count tests.
- Constraints: No other review findings are touched. Match existing style.
- Out of scope: F2, F4 to F7, S2 to S5, standards smells.
- Open questions: none.

## Goal

The three confirmed findings are fixed and covered by targeted tests.

## Approach

- F1: in `snapDelta`, a point within the rounding step (0.005 s) of an edge counts as already reached.
- S1: `sound.md` Kokoro section tells the agent to set `speech: true` on the voiceover placement.
- F3: drop `click-soft` and `whoosh-short` (byte-identical to `click` and `whoosh`) from the manifest, so the shelf lists 17 distinct sounds. Keep the files on disk because `reels/kinotta-showcase` references `click-soft.mp3` by path. Departs from plan D4 (19 unmodified).

## Steps

1. Regression test for F1 with beat 1.234558, then the fix.
2. Edit `sound.md`.
3. Unlist the two duplicates, note them in CREDITS, update the two count tests.
4. Run targeted tests.

## Risks

- Deleting the duplicate files would break the showcase reel, so they stay.

## Checks to run

- `tests/core/sound-effects.test.ts`, the F1 regression test, `tests/core/render-sound-effects-editor.test.ts` if the browser runner is available.

## Changelog

### 2026-10-12
- Plan created and approved.
- F1 fixed in `placement-edits.ts` with a regression test in `tests/core/media-beats.test.ts` (fails without the fix). S1 fixed in `sound.md`. F3 first attempted with file deletion, reverted because the showcase reel references `click-soft.mp3`; redone as manifest-only removal (17 listed effects, files kept).
