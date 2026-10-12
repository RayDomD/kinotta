---
title: timeline-tracks
date: 2026-10-12
status: Draft
summary: Time on top with the pins on it; Footage, Inserts and Clips become picture tracks like the sound tracks; Words open inside a caption.
spec:
---

## Intent

- Problem: The timeline draws eight fixed rows (Reel, Footage, Inserts, Clips, Captions, Words, Pins, Time) before any sound track, and on a reel built from code most of them are always empty. Picture rows and sound tracks behave differently for no reason you can see.
- Why: The rows push the sound tracks, where most editing on a code-built reel happens, off the bottom of the screen, and the split between "lanes" and "tracks" has to be learned.
- Proposed outcome: Time sits above everything and carries the pins. Under it, picture tracks and sound tracks look and behave the same: a header with a name and Mute, clips you select, drag and trim. The bottom picture track is the main cut, where a snip closes the gap. Captions is one track; selecting a caption opens it into its words, where you retype, re-time and pin them. A track with nothing on it is not drawn.
- Affected: `web/src/review/_internal` (`NativeLanes.tsx`, `EditorialLanes.tsx`, `TimelineOverview.tsx`, `MediaEditor.tsx`, `review.css`), the media model in `server/core` if picture placements gain a track, `CONTEXT.md` (a term for a picture track), tests under `tests/e2e`. Mockup: `docs/mockups/2026-10-12-timeline-tracks.html`, option A for words. It replaces the lane layout in `docs/mockups/2026-10-08-review-media-editor.html`.
- Constraints: Words stay in the data; captions, the highlighted word and word-linked graphics are built from them. Word fixes, word timing and word pins keep working. Free layout's front-to-back order stays the source of which picture is in front. `DESIGN.md` tokens apply.
- Out of scope: New editing abilities on picture tracks beyond what Footage, Inserts and Clips do today. Shots as parts.
- Open questions:
  - O1: Is the stacking of picture tracks a new stored order, or drawn from the roles that exist today (graphics, inserts, main cut) with no model change?
  - O2: Does the Reel overview strip stay as a thin row under Time, or move into the Time row itself?

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-12
- Plan created with Intent only. The owner approved the layout in the mockup; option A for words was the recommendation and is assumed.
