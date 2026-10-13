---
title: viewer-transport-clips
date: 2026-10-13
status: Draft
summary: A draggable picture share and focus view, one transport for every reel, stills and gap closing on clips, plus a shortcut sheet, markers, a snap line and sound prompt chips.
spec:
---

## Intent

- Problem: On the Review screen the picture is the smallest thing. `.rv-frame` caps it at 36% of the window height on code-built reels, so a 1440 × 900 window shows a 576 × 324 picture while the tracks take the rest. There are two transports: a hex play button with a timecode on code-built reels, and a text "Play" with a typed Playhead number on media reels. Neither can be scrubbed under the picture, and the mouse cannot step a frame or jump a shot. A clip on the timeline is a named bar, so a shot is found by reading, and clip actions are reachable only from the toolbar or keys.
- Why: `PRODUCT.md` says the reel is the subject. Motion is judged on the picture, and today the picture is too small to judge it on. The comparison with AIMovieStudiov2 on 2026-10-13 showed its viewer taking about half the screen with a scrub bar under it.
- Proposed outcome: You decide how the height is shared between picture and tracks, and one key gives the picture the screen. One transport, the same on every reel, scrubs under the picture, shows where shots and pins are, and steps by frame and by shot. Clips show what is in them, and a right-click offers the clip actions.
- Affected: `web/src/review/_internal` (`Player.tsx`, `MediaEditor.tsx`, `EditorWorkspace.tsx`, `Review.tsx`, `Lanes.tsx`, `NativeLanes.tsx`, `editor-settings.ts`, `EditorToolbar.tsx`), `web/src/review/review.css`, `web/src/styles.css`, the stage (`web/src/stage`) for stills on code-built shot clips, the server for footage thumbnails if none exist yet, tests under `tests/core` and `tests/e2e` that find the transport or measure the frame. Mockup: `docs/mockups/2026-10-13-viewer-transport-clips.html`. It changes the layout saved in `docs/mockups/2026-10-08-review-media-editor-screen.html`.
- Added 2026-10-13 (N2 to N5 from the second comparison pass): the editor has no list of its own shortcuts; a note to yourself at a time has to be a pin, which is sent to the agent; a dragged clip snaps without showing where; and the sound Generate panel starts from a blank prompt. Affected in addition: `EditorSettingsSheet.tsx`, `SoundGenerate.tsx`, `TimelineOverview.tsx`, the editor state file for markers.
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
  - O2: settled 2026-10-13 in the Approach. Remembered once for the editor, in the same stored settings as the rail and theme.
  - O3: settled 2026-10-13. Only the clip's own track closes up. A clip on another track moves only if it is attached to a clip that moved, using the attachment placements already have.
  - O4: settled 2026-10-13 in the Approach. Footage: about one still per 96px of clip width, at most 12, made by the server on first view and cached. A code-built shot shows one live still at its start.

Decided with the owner in the 2026-10-13 preview session: V1 (a divider you drag, starting at 55%), V2 (focus view), T1 (scrub bar with shot ticks and pins), T2 (frame and shot stepping), C1 (stills along the clip), C2 (right-click menu).

## Goal

On the Review screen the picture's height is set by a divider you drag and can take the whole screen on `F`. One transport sits under the picture on every reel, with a scrub bar that shows shots and pins and buttons that step a frame or a shot. Footage clips and shot clips show stills, and the clip menu can remove a clip and close its gap.

Acceptance criteria:

- At 1440 × 900 with the divider at its default, the frame is at least 55% of the main column's height. Dragging the divider, or arrow keys on it, changes the frame and the tracks together, between 25% and 80%. The position survives a reload.
- `F` hides the rail, the side panel, the toolbar and the tracks and leaves the frame and the transport. `F` or Escape brings them back with the same selection, playhead and divider position. A pin can be placed in focus.
- `Shift+F` fits the timeline. A browser that stored the old bindings ends up with focus on `F` and fit on `Shift+F`, not both on `F`.
- Media reels and the older footage path show the same transport. Dragging the scrub bar moves the playhead and the picture follows. The bar shows one tick per shot boundary and one hex per pin, and clicking a hex seeks to that pin.
- The frame buttons move one frame. The shot buttons move to the previous and next shot start. Each has a registry action and a tooltip with its key.
- The control labelled "Playhead" still accepts a typed time, so existing tests and exact entry keep working.
- A footage clip wider than 96px shows stills of its own frames. A shot clip of a code-built reel shows the still of its first frame.
- "Remove and close the gap" removes a clip on a sound or insert track and moves the later clips on that track earlier by its length. Clips on other tracks move only if they are attached to a clip that moved. One undo restores everything.
- `?` opens a sheet listing every action with its current key, read from the registry, and Escape closes it.
- `M` drops a marker at the playhead. A marker has a time and an optional name, shows on the time row and the scrub bar, can be renamed and removed, and clips snap to it. Markers belong to the reel in the editor and never appear in a comment batch or a render.
- While a clip is dragged and snaps, a line shows at the time it will land on.
- The sound Generate panel offers chips for kind, mood, tempo and instruments. Pressing a chip adds its words to the prompt, which stays editable.

## Approach

UI lane B: the surface exists and its identity stays. The layout follows `docs/mockups/2026-10-13-viewer-transport-clips.html` where it differs from `docs/mockups/2026-10-08-review-media-editor-screen.html`.

Found while reading the code, which changes the size of two items:

- A right-click clip menu already exists in `MediaEditor.tsx` (Clip settings, Split, Duplicate, Replace, Remove), opened from `NativeLanes.tsx`. C2 is therefore one new item plus key hints, not a new menu.
- Removing a clip from the main picture sequence already closes its gap, because the sequence is an ordered list. The new operation is needed only for tracks whose clips sit at a free time.
- Both Review paths share `.rv-well` and `.rv-frame`, so the 36% cap and its fix apply to both at once.

Parts:

1. `Transport` in `web/src/review/_internal`, with a `.verify.ts` like its neighbours. Props: time, total, playing, frame rate, timecode mode, shot starts, pins, and callbacks for toggle, seek, step and shot jump. It holds the hex play mark now in `Player.tsx`, the Playhead field, the scrub bar (`role="slider"`, pointer drag seeks once per animation frame, arrow keys step) and the step buttons. `Player.tsx` and `MediaEditor.tsx` both render it and drop their own transport markup. Status lines such as "Preparing sound…" stay beside it.
2. Divider: `.rv-main` becomes a column of two panes. The frame pane's height is a share stored in `EditorSettings` as `viewerShare` (default 0.55). The frame's width becomes the smaller of the pane width and the pane height at the reel's aspect. The tracks pane scrolls on its own. The divider is a `role="separator"` with `aria-valuenow` and arrow-key steps.
3. Focus: a `focus` action in `EDITOR_ACTIONS` on `F`, and `fit` moves to `Shift+F`. Focus is a `data-focus` attribute on the review shell that CSS uses to hide the rail, side panel, toolbar and tracks pane. `readEditorSettings` gains a settings version; a stored set from before this change with fit on `F` is moved to `Shift+F`.
4. Stepping: `prevShot` and `nextShot` actions on `PageUp` and `PageDown`, and buttons for the existing left and right step.
5. Close the gap: a `placement-ripple-remove` edit operation in `edit-model.ts` built from the existing remove and move operations, so undo and the edit list treat it as one edit. It moves later clips on the same track, then lets attachments resolve as they do today. A menu item and a `closeGap` action on `Shift+Delete`. The menu items show their keys from the registry.
6. Stills: a server route that returns one frame of a footage source at a time, made with the ffmpeg the server already checks for at startup, cached under the project's Kinotta cache by source, time and size. `NativeLanes.tsx` asks for stills when a footage clip is wide enough and paints them behind the name. A shot clip uses one `PageStill` at the shot's start.
7. Shortcut sheet: a `shortcuts` action on `?` and a dialog that renders `EDITOR_ACTIONS` with the bound keys, grouped as the Settings key list is.
8. Markers: stored with the reel's editor state on the server, not in a version. A `marker` action on `M`. Markers are drawn in `TimelineOverview.tsx` and `Transport`, and added to the existing snap points.
9. Snap line: the drag code already computes the snap target; it also reports the snapped time so the lanes can draw one line.
10. Prompt chips: a fixed list in `SoundGenerate.tsx` of our own wording. Chips only edit the prompt text; the generate request is unchanged.

## Steps

Each step is one ticket: a failing test first, then the change.

1. `Transport` with scrub bar and Playhead field; both paths render it.
2. Frame and shot step buttons and actions.
3. Divider, pane layout and frame sizing.
4. Focus view, the `F` and `Shift+F` bindings and the stored-settings move.
5. `placement-ripple-remove`, its menu item, and key hints in the menu.
6. Footage stills route and cache, then stills on clips.
7. Shortcut sheet on `?`.
8. Snap line.
9. Markers on `M`, drawn on the time row and scrub bar, with snapping.
10. Sound prompt chips.
11. `/impeccable critique`, `/impeccable audit`, the verbs they flag, `/impeccable polish`, then the session summary.

## Risks

- The pane layout changes how `.rv-main` scrolls. Browser tests that scroll to a track or measure the frame may need new waits or selectors.
- Not every reel is 16:9. The frame sizing must use the reel's own aspect, and a vertical reel in a wide pane must not overflow.
- A live still is an iframe. One per shot clip matches what the Storyboard already loads; more than one per clip would not. Stills must not load for clips scrolled out of view.
- Scrubbing a media reel seeks sound and several picture layers. Seeking on every pointer move could stall; one seek per animation frame, with the last position winning.
- `F` changes meaning. Anyone with muscle memory for Fit will open focus instead until they relearn it; Escape leaves it.
- Thumbnail extraction on a long source can be slow on first view. The clip must draw as a plain bar until stills arrive.
- Markers take `M` and the Media rail toggle moves to `R` (owner, 2026-10-13). As with `F`, bindings already stored in a browser must not leave two actions on one key. Both stay rebindable in Settings.
- Markers, the shortcut sheet and the chips have no approved mockup. Each needs a preview screen before it is built.

## Checks to run

- `npm run typecheck`, `npm run build`.
- Vitest, one worker: the new `Transport`, divider, focus, ripple-remove and stills tests, plus `render-review-shell`, `render-native-lanes`, `render-editorial-lanes`, `render-timeline-window`, `render-editor-keys-drag`, `render-media-preview`.
- Playwright, one worker: `review.spec.ts`, `editing.spec.ts`, `lanes.spec.ts`, `pins.spec.ts`, `snip-save.spec.ts`.
- Shell checks in dark and light themes at 390, 768, 1024, 1272 and 1600px, as in the 2026-10-08 audit.

## Changelog

### 2026-10-13
- Plan created with Intent only. Options V1, V2, T1, T2, C1 and C2 chosen from `docs/mockups/2026-10-13-viewer-transport-clips.html`. Awaiting approval of the Intent and answers to O1 to O4 before Goal and Approach.
- O1 and O3 settled by the owner from the questions screen: focus on `F` with Fit on `Shift+F`, and closing a gap moves only that track plus attached clips. O2 and O4 remain open.
- Goal, Approach, Steps, Risks and Checks written. O2 and O4 settled in the Approach. Code reading found the clip menu and main-sequence gap closing already exist, which shrinks C2. Awaiting approval before code.
- N2 (shortcut sheet), N3 (sound prompt chips), N4 (markers) and N5 (snap line) added at the owner's request: acceptance criteria, Approach parts 7 to 10 and Steps 7 to 10. Still awaiting approval before code.
- Markers take `M`; the Media rail toggle moves to `R` by default. Decided by the owner.
