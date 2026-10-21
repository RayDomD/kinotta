---
title: Simple mode picture pins
date: 2026-10-21
status: Blocked
summary: Let simple mode pin an exact spot or element on the picture, the way the editor does, alongside timeline pins.
spec:
---

## Intent

- Problem: Simple mode can only pin by clicking the timeline. Every timeline pin is saved as a frame pin at
  the frame centre with no element (`web/src/review/_internal/MediaEditor.tsx:602`, `x: 0.5, y: 0.5,
  element: null`), so a note can't say *which* thing on screen should change. The editor pins the exact spot
  and element: Pin tool on, the cursor becomes the hex with a centre dot, the element under it is outlined
  with a name tag, and a click drops a numbered hex (DESIGN.md "Pinning (signature)"; `pickFrame`,
  `MediaEditor.tsx:219`).
- Why: Owner decision 2026-10-21: "make pinning the same as editor mode", chosen as *add picture pins and
  keep timeline pins*.
- Proposed outcome: In simple mode you can click the picture to pin a spot/element, with the same hex
  cursor, outline, name tag and hex marker as the editor, then type the required note in simple mode's own
  composer. Timeline pins keep working. Both kinds appear in "Your pins" and on the picture.
- Affected: `web/src/review/_internal/MediaEditor.tsx` (simple branch only), `web/src/SimpleMode.tsx`,
  `web/src/simple.css`, `tests/e2e/simple-mode.spec.ts`.
- Constraints: Pins don't change Working. The detailed editor's pinning is unchanged. DESIGN.md pinning
  rules apply (outline and tags drawn in the editor, never in the reel's page; ice light only for state).
  Keep the required note, `[` `]` stepping and Regenerate as they are.
- Out of scope: word pins under footage, the editor's Pin tool button and toolbar, caption editing in simple
  mode, changing what timeline pins save.
- Open questions: none blocking.

## Goal

Clicking the picture in simple mode opens the simple composer with a frame pin carrying the clicked `x`, `y`
and element; saved picture pins show as numbered hexes on the picture and in the pin list with the element
named.

## Approach

Reuse the editor's pin path rather than build a second one. In `MediaEditor`, simple mode gets the frame
pick always on (no toolbar to toggle it, and simple mode has no element editing to conflict with): pass
`onFramePick` to `PagePlayer` when `simple` is set, and route the result to `simple.onPin` instead of the
editor's own `pinDraft`/comments-panel form. Pause playback on pick so the pinned moment is the one shown.
Simple mode's composer then shows "Pin at 0:04 · <element name>" instead of only the time. The existing
`pins` overlay on `PagePlayer` already draws saved frame pins near their time, so picture pins appear there
once saved.

Timeline pins stay at frame centre with no element. They already show as a hex in the centre of the picture;
that is existing behaviour and stays.

## Steps

1. Before: screenshot simple studio and the editor's pin-on-frame state for comparison; confirm
   whether the frame pick also covers footage-only moments (no authored page) in simple mode.
2. `MediaEditor.tsx`: enable frame pick in simple mode and send picks to `simple.onPin`; pause on pick.
3. `SimpleMode.tsx`: composer heading and pin list show the element name for picture pins.
4. e2e: click the picture in simple mode, see the outline/hex cursor, type a note, save; the pin lists with
   its element, appears as a hex on the picture, `[`/`]` jump to it; timeline pinning still works; the
   editor's pin flow test still passes.
5. Typecheck, build, simple-mode, review and the editor pin e2e; after screenshots.

## Risks

- Footage-only moments: if the frame pick only exists over the authored page layer, picture pins may not
  work over plain footage. Step 1 checks; if so, fall back to a centre pin with element `null` there and
  report it rather than reworking `PictureLayers`.
- Click-to-play: if a click on the picture currently toggles playback in simple mode, the pin pick replaces
  it; play stays on the transport button and Space.

## Checks to run

- `npm run typecheck`, `npm run build`
- `npm run test:e2e -- tests/e2e/simple-mode.spec.ts tests/e2e/review.spec.ts` plus the editor pin spec
- Before/after screenshots of simple studio with a picture pin and its composer, 1280x800

## Changelog

### 2026-10-21
- Plan created from owner decision: add picture pins to simple mode, keep timeline pins.
- Implementation investigation started, then blocked before code edits by the brief's scope limit: the current `PagePlayer` picker has a crosshair and click hit-testing, but no element hover outline/name tag. Meeting the approved feedback requires a change in that excluded file. See `docs/session-summaries/2026-10-21-simple-picture-pins-summary.md`.
