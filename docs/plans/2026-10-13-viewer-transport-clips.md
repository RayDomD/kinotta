---
title: viewer-transport-clips
date: 2026-10-13
status: Draft
summary: The picture gets a draggable share of the Review screen and a focus view, one transport serves every reel, and clips show stills and a right-click menu.
spec:
---

## Intent

- Problem: On the Review screen the picture is the smallest thing. `.rv-frame` caps it at 36% of the window height on code-built reels, so a 1440 × 900 window shows a 576 × 324 picture while the tracks take the rest. There are two transports: a hex play button with a timecode on code-built reels, and a text "Play" with a typed Playhead number on media reels. Neither can be scrubbed under the picture, and the mouse cannot step a frame or jump a shot. A clip on the timeline is a named bar, so a shot is found by reading, and clip actions are reachable only from the toolbar or keys.
- Why: `PRODUCT.md` says the reel is the subject. Motion is judged on the picture, and today the picture is too small to judge it on. The comparison with AIMovieStudiov2 on 2026-10-13 showed its viewer taking about half the screen with a scrub bar under it.
- Proposed outcome: You decide how the height is shared between picture and tracks, and one key gives the picture the screen. One transport, the same on every reel, scrubs under the picture, shows where shots and pins are, and steps by frame and by shot. Clips show what is in them, and a right-click offers the clip actions.
- Affected: `web/src/review/_internal` (`Player.tsx`, `MediaEditor.tsx`, `EditorWorkspace.tsx`, `Review.tsx`, `Lanes.tsx`, `NativeLanes.tsx`, `editor-settings.ts`, `EditorToolbar.tsx`), `web/src/review/review.css`, `web/src/styles.css`, the stage (`web/src/stage`) for stills on code-built shot clips, the server for footage thumbnails if none exist yet, tests under `tests/core` and `tests/e2e` that find the transport or measure the frame. Mockup: `docs/mockups/2026-10-13-viewer-transport-clips.html`. It changes the layout saved in `docs/mockups/2026-10-08-review-media-editor-screen.html`.
- Constraints:
  - `DESIGN.md` tokens, zero radius, the One Light Rule. The reel stays the only colour on screen.
  - Every new action goes through the one registry in `editor-settings.ts`, so it is rebindable and shows in tooltips.
  - The divider position and the focus view never change what is rendered.
  - Existing edit operations are reused. The right-click menu issues the same operations as the toolbar.
  - WCAG 2.1 AA: the divider, scrub bar and menu are all keyboard operable.
  - AIMovieStudiov2 is AGPL-3.0. Ideas only; no code from it is copied.
- Out of scope:
  - T3 from the mockup: J K L shuttle, I and O marks, loop over a marked range.
  - C3: the speed badge, and clip speed itself.
  - Their on-clip buttons, per-clip audio track staircase and transitions.
  - The Storyboard tab. This is the Review screen only.
- Open questions:
  - O1: settled 2026-10-13. Focus takes `F`; Fit timeline moves to `Shift+F`. Key bindings already stored in a browser must not end up with both actions on `F`.
  - O2: Is the divider position remembered per reel or once for the editor?
  - O3: settled 2026-10-13. Only the clip's own track closes up. A clip on another track moves only if it is attached to a clip that moved, using the attachment placements already have.
  - O4: How many stills does a clip show, and are footage thumbnails generated on import or on first view?

Decided with the owner in the 2026-10-13 preview session: V1 (a divider you drag, starting at 55%), V2 (focus view), T1 (scrub bar with shot ticks and pins), T2 (frame and shot stepping), C1 (stills along the clip), C2 (right-click menu).

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-13
- Plan created with Intent only. Options V1, V2, T1, T2, C1 and C2 chosen from `docs/mockups/2026-10-13-viewer-transport-clips.html`. Awaiting approval of the Intent and answers to O1 to O4 before Goal and Approach.
- O1 and O3 settled by the owner from the questions screen: focus on `F` with Fit on `Shift+F`, and closing a gap moves only that track plus attached clips. O2 and O4 remain open.
