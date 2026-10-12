---
title: editor-keys-drag-handles
date: 2026-10-12
status: Done
summary: Shortcuts work wherever focus is, the toolbar works on sound in code-built reels, clips follow the pointer, and trim handles are visible.
spec:
---

## Intent

- Problem: In the Review editor Ctrl+Z does nothing, half the toolbar is dead on a code-built reel, a dragged clip does not follow the pointer, and the trim handles are close to invisible.
- Why: These are the basic gestures of an editor, and the showcase reel is edited mostly through its sound tracks.
- Proposed outcome: Shortcuts work as soon as the editor is open. Split, Blade and Duplicate work on sound clips in any reel, and a disabled button says why. A clip moves and trims under the pointer and stays where it is dropped. Handles can be seen and grabbed.
- Affected: `web/src/review/_internal` (`MediaEditor.tsx`, `NativeLanes.tsx`, `EditorialLanes.tsx`, `EditorToolbar.tsx`, `useEdits.ts`, `review.css`), `server/core/_internal/code-edits.ts`, tests under `tests/core` and `tests/e2e`.
- Constraints: A code-built reel's picture timing still changes only through the agent. Motion follows the craft checklist: transform and opacity only, nothing animated on a drag.
- Out of scope: The track layout (`2026-10-12-timeline-tracks.md`). Undo across a Save, which `2026-10-12-live-edits-freeze-at-render.md` removes.
- Open questions:
  - O1: settled. Thick ends on every clip, brighter when selected (option C of the `clip-handles` screen).

## Goal

The four problems are fixed and covered by tests, without changing the layout.

## Approach

Findings, measured in the running editor on `kinotta-showcase` v14:

- F1, shortcuts: the key handler is on `<main>` in `MediaEditor.tsx`, which cannot take focus. The page opens with focus on `body`, and a click on empty timeline leaves it there, so no shortcut reaches the handler. Fix: listen on the window while the editor is mounted, with the same guards (settings open, typing in a field).
- F2, undo after Save: Save deletes `edit-list.json`, so `canUndo` is false afterwards (it is false now on the showcase). Not fixed here; the live-edits plan removes Save.
- F3, toolbar: Blade, Snip, Split and Insert gap are disabled by `!version.code`, and `assertCodeOnlyOperations` has no `placement-split`, so sound clips cannot be split either. Fix: allow `placement-split` on sound placements for code-built reels, enable Split, Blade and Duplicate when the target is a sound clip, and put the reason in the tooltip of a button that stays disabled.
- F4, dragging: in `NativeLanes.tsx` the drag offset is applied only for `kind === 'move'`, but sound clips drag as `kind === 'sound'`, so they stay still and jump on release. Trims have no preview. Each pointer move re-renders every lane, and after the drop the clip waits for the server before it moves. Fix: apply the offset for every drag kind with `transform`, preview trims, keep the drag state out of the lanes' render, and show the dropped position at once while the operation is sent (put back if refused).
- F5, handles: `.native-trim` is 5px wide at 7% opacity. Fix: the chosen design, with a hit area of at least 10px.

## Steps

1. F1 with an e2e test: open the editor, press Space and Ctrl+Z without clicking anything.
2. F3 core: `placement-split` on a sound placement in a code-built reel, with a core test; picture operations still refused.
3. F3 UI: enable rules and tooltips, with an e2e test on a code-built reel.
4. F4: live preview for move, sound move and trim; drop without a jump. E2e test that the bar moves during the drag.
5. F5: handles from the chosen mockup.
6. Run the checks.

## Risks

- A window key listener can fire while another surface is open. Keep the existing guards and remove the listener on unmount.
- Showing the drop before the server answers can show a state the server refuses. The clip goes back and the existing error line says why.

## Checks to run

- `tests/core` for code-only edits, `tests/e2e/editing.spec.ts` and the new e2e cases, typecheck and lint.

## Changelog

### 2026-10-12
- Plan created from findings in the running editor. Awaiting approval and the handle choice.
- Approved. Handles: thick ends on every clip (option C).
- F1 fixed: `MediaEditor.tsx` hears keys on the window. A control outside the editor keeps its plain keys; chords with a modifier reach the editor from anywhere.
- F3 fixed: `placement-split` allowed on code-built reels; Blade and Split enabled there; disabled toolbar buttons give their reason in the tooltip.
- F4 fixed: a drag is drawn on the clip's element (move, carry to another track, trim) and the clip stays where it is dropped (`useEdits` lands the list in the render that ends `busy`). Deviation: pointer drags now snap only within reach of an edge (`magnetDelta`). The old rule stopped a dragged clip at the first edge it crossed, so it could not pass the playhead. Keyboard nudges keep `snapDelta`.
- F5 fixed: 10px hit area, a 4px end on every clip, 6px in the accent when selected. Mockup: `docs/mockups/2026-10-12-clip-handles.html`.
- Test: `tests/core/render-editor-keys-drag.test.ts`, and a `magnetDelta` case in `tests/core/media-beats.test.ts`.
- Handoff verification completed: build and typecheck pass; native trim test passes; full Vitest run has 772 passes, 3 timing failures and 1 skip. All three failing files pass with one worker (19 tests). No clean single full-suite run is claimed. See the session summary for evidence and the single-context UI review.
