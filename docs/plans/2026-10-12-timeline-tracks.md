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
  - O1: settled. No model change. Picture placements already carry `layer`, the front-to-back order free layout uses, so picture tracks are drawn from it.
  - O2: Does the Reel overview strip stay as a thin row under Time, or move into the Time row itself? Recommended: a thin row under Time, as in the mockup.
  - O3: The mockup shows Mute and Solo on picture tracks. Hiding a picture track is a new ability with a render change behind it. Recommended: picture track headers carry a name only in this pass.

## Goal

The Review editor's timeline matches `docs/mockups/2026-10-12-timeline-tracks.html` (option A for words) with no change to the media model, the edit operations or the render.

## Approach

The change is in the web editor only. Rows, top to bottom:

1. Time: the ruler moves to the top and draws the pins on it. The Pins row goes.
2. Reel: the overview, as a thin row.
3. Graphics: today's Clips row, drawn only when the reel has graphics.
4. Picture tracks: one row per `layer` value among the inserts, highest on top, named Picture 2 upward. Drawn only when they hold something.
5. Picture 1: the main cut (today's Footage row). Drawn when the reel has footage or a gap sequence that matters; a code-built reel with no footage does not show it.
6. Captions: drawn when there are captions. A click on a caption opens it into its words on the same row; a word is retyped, re-timed and pinned there exactly as on today's Words row. A double-click retypes the whole caption. Escape or a click elsewhere closes it. The Words row goes.
7. Sound tracks, unchanged.

While media is dragged from the library, an empty "New picture track" row appears as a drop target, so an insert can still be added to a reel that shows none.

`NativeLanes.tsx` and `EditorialLanes.tsx` draw into one grid in that order instead of two stacked sections. Transcription progress, which sits on the Words row today, moves to the Captions row.

## Steps

1. Ruler on top with pins on it; remove the Pins row. Test: pins seek from the ruler.
2. Draw only rows that hold something, plus the drop row during a library drag. Test on a code-built reel and a footage reel.
3. Picture tracks from `layer`; rename Footage to Picture 1 and Clips to Graphics in the UI. Update `CONTEXT.md` with the term "picture track".
4. Words inside a selected caption; remove the Words row. Carry the existing word tests (`render-editorial-lanes`, `word-pins`) over to the new place.
5. Update the `.verify.ts` invariants and the e2e selectors that name the old rows.
6. `/impeccable critique` and `/impeccable audit` on the result, then the session summary.

## Risks

- Many tests find rows by their labels (Footage, Inserts, Clips, Words, Pins). They change with the rows; the behaviour they check does not.
- Words inside a caption are narrow at low zoom. The opened caption needs a minimum width per word, or it widens over its neighbours while open.
- Hiding empty rows moves the sound tracks up when a reel gains its first caption or insert. That is the intent, but it shifts the layout during an edit.

## Checks to run

- Typecheck, `tests/core/render-native-lanes`, `render-editorial-lanes`, `render-timeline-window`, `render-review-shell`, `word-pins`, and the e2e `lanes`, `pins` and `review` specs.

## Changelog

### 2026-10-12
- Plan created with Intent only. The owner approved the layout in the mockup; option A for words was the recommendation and is assumed.
- Goal, Approach and Steps written. O1 settled from the code: `layer` already orders pictures. Awaiting approval, with O2 and O3.
