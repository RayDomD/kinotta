---
title: separate-overlapping-clips
date: 2026-10-12
status: Done
summary: Overlapping timeline clips automatically occupy separate visible rows.
spec:
---

## Intent

- Problem: Sound clips overlap and obscure one another on the timeline.
- Why: Every file needs to remain visible and selectable.
- Proposed outcome: Clips sharing time occupy separate rows automatically. Touching clips can share a row.
- Affected: NativeLanes, EditorialLanes, timeline arithmetic and browser tests.
- Constraints: Preserve clip timing, picture compositing and sound-track ownership, mute, solo and gain. Do not edit the showcase reel or its undo/redo history.
- Out of scope: Live edits, new sound tracks, changing the rendered mix.
- Open questions: None. The owner directly requested separate layers for overlaps.

## Goal

No settled timeline bars obscure each other. Overlapping sound, picture, graphics and caption bars occupy separate rows, including captions widened to reveal words.

## Approach

Partition each existing track's intervals into rows in time order. Reuse the first available row when its previous clip has ended. Draw each row at a fixed vertical offset, with the original track controls spanning the rows. Use the same partitioning for graphics and captions. Account for the displayed width of opened captions and broken-placement repair markers.

## Steps

1. Add a browser regression showing overlapping clips obscuring one another.
2. Implement deterministic row partitioning and apply it to timeline bars.
3. Verify touching clips reuse a row, controls remain shared, and timing operations still work.

## Risks

- More overlapping clips require more vertical space. Track controls must remain usable without creating new mix owners.
- Expanded captions occupy more visible space than their time span. Use their displayed width when assigning rows.

## Checks to run

Typecheck, build, overlap regression, native drag/trim, caption editing, timeline window and media library browser checks.

## Changelog

### 2026-10-12
- Saved the focused implementation plan for the owner's directly requested overlap rule.
- Implemented shared interval stacking for native placements, graphics and captions, including expanded caption widths. Touching intervals reuse rows. Retry/progress badges follow their clip's row. Track ownership, timing and rendering are unchanged.
- Build, typecheck and seven distinct browser regression cases pass across focused runs. Visually checked the running showcase: both sound-effect groups now occupy three rows. See the session summary.
