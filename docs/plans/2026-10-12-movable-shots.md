---
title: movable-shots
date: 2026-10-12
status: Done
summary: A code-built reel's shots appear as clips on the timeline and can be moved and trimmed like media.
spec:
---

## Intent

- Problem: A reel built from code is one continuous picture in the editor. Its shots are not on the timeline at all, so none can be moved, shortened or reordered. Any timing change needs the agent to build a new version.
- Why: The sound on such a reel is already free to move. The picture it is cut to is not, so a beat that lands late can only be fixed from the sound side.
- Proposed outcome: Each shot is a clip on a picture row, named from the storyboard. You drag it, trim it and reorder it as you do a sound clip. The preview plays the new timing straight away and Save keeps it.
- Affected: `server/core/_internal` (`version.ts`, `code-edits.ts`, `edit-list.ts`, `contract.ts`), the timing contract in `docs/adr/0001-timing-contract.md`, `web/src/review/_internal` (`MediaEditor.tsx`, `EditorialLanes.tsx`, `edited.ts`), `web/src/stage/_internal/PagePlayer.tsx`, `skill/kinotta` (what a page must do for its scenes to be movable), `CONTEXT.md`, tests.
- Constraints: Moves are free: a moved shot leaves a gap or overlaps its neighbour, and overlapping shots stack on separate rows, as sound clips do (owner, 2026-10-12). Sound stays where it is. Existing reels keep opening and rendering. Bar edges come from the page's scene timings; names come from `shots.json`.
- Out of scope: A page and a history per shot, and per-shot comment batches. Those stay in `2026-10-12-shots-as-parts.md`, after live edits. Footage reels, whose clips already move.
- Resolved questions:
  - O1: Gaps show the page's bare ground, confirmed by the owner.
  - O2: Each shot keeps its own exit animation, confirmed by the owner.
  - O3: Pages must read current timing attributes on every seek. Static checks cannot prove this for arbitrary scripts, so authoring instructions require a runtime check.
  - O4: Moving the last shot later extends the reel, confirmed by the owner.

## Goal

Code-built scenes appear as storyboard-named clips on the Picture row. Free moves, trims and
reordering preview during the drag and survive Save and reopening. Overlaps stack on separate
rows, sound stays in place, and existing versions remain intact.

## Approach

D1: Reuse graphic clip operations, the editor's overlap rows and PagePlayer's live timing rewrite.
Code plans carry `codeTiming` so footage bounds still apply to footage while scene moves can
extend authored pages. Expose scene ranges through the existing version `clips` field.

D2: Save copies the newest version, rewrites scene timing attributes and the page duration, and
keeps storyboard names associated with stable scene names. Element CSS and sound preservation
continue through the existing Save path.

D3: Owner confirmed background gaps, independent exit animations and duration extension when
the last shot moves later. Moving or trimming earlier preserves the existing reel length.

D4: Require pages to read current scene attributes on every seek. Static checks cannot prove
arbitrary animation code follows them. The page instructions require a runtime move-and-seek
check, and the browser test verifies the existing showcase page follows edited timing.

## Steps

A1: Expose scene timing and storyboard names and accept free clip-slide and clip-trim operations.
A2: Persist timing, storyboard scene identity and duration in the next frozen version.
A3: Enable Picture row gestures and inspector timing, reusing live preview and overlap rows.
A4: Update the timing contract and authoring instructions, and verify Save, reopen and render.

## Risks

R1: Older scripts that cache or hard-code schedules need an agent to update their seek logic
before timing edits can affect animation. They continue opening and rendering as authored.
R2: Overlapping pictures paint in document order. Timeline rows communicate simultaneous shots,
without introducing a new compositing or layering contract.
R3: A scene without an explicit storyboard association is matched by exact start, then by the
scene covering a shot's start. New and saved entries carry `scene` to preserve identity thereafter.

## Checks to run

- `npm run typecheck`
- `npm run build`
- `npm test -- --project unit --maxWorkers 2`
- `npm test -- tests/core/render-movable-shots.test.ts tests/core/render-editorial-lanes.test.ts tests/core/render-overlap-rows.test.ts tests/core/render-save.test.ts`

The new server test covers free timing edits, Undo/Redo, sound timing, stable storyboard names,
Save and reopening, original version preservation, and negative-time rejection. The browser test
covers live dragging, overlap rows, gaps, trimming, length extension, editor invariants, Save,
reopening, and a 570-frame render at 30 fps for the extended 19-second reel.

## Test evidence

- `npm run typecheck`: passed.
- `npm run build`: passed, with the existing bundle-size warning.
- `npm test -- --project unit --maxWorkers 2`: 72 files passed, 666 tests passed, 1 skipped.
  The default-worker run hit four 5-second timeouts. All four passed in this rerun.
- `npm test -- tests/web/edited.test.ts tests/core/movable-shots.test.ts tests/core/render-movable-shots.test.ts`:
  3 files passed, 28 tests passed, including exact scene identity when names share a prefix.
- `npm test -- tests/core/render-editorial-lanes.test.ts tests/core/render-overlap-rows.test.ts`:
  both existing browser regressions passed.
- `npm test -- tests/core/render-save.test.ts`: 4 Save/render regression tests passed.
- Final `npm test -- tests/core/render-movable-shots.test.ts`: passed after adding the expanding
  timeline drag check. The saved 19-second version rendered successfully to 570 frames at 30 fps.

## Deviations

Static script-read detection was replaced with an explicit live timing contract and a runtime
verification requirement. This avoids treating a text match in arbitrary animation code as proof
that the page follows edits. No new operation kinds or static contract issue codes were needed.

## Changelog

### 2026-10-12
- Plan created with Intent only. Decided with the owner: this slice goes ahead of live edits, and moves are free with overlaps on separate rows.
- Findings so far: the server already reads each scene's start and duration (`code-edits.ts` `codeSources`) but sends the editor names only (`version.ts`); the edit list refuses timing edits on a code-built reel (`assertCodeOnlyOperations`); the showcase page reads `data-start` at run time, so rewritten timings would be followed there.
- Implemented the shared scene clip path and recorded the owner's timing defaults. Runtime validation replaces the proposed static proof of script timing reads, which cannot be established reliably for arbitrary page code.
- Completed and verified. Preview keeps a drag's original scale as the reel grows, exact scene
  names win over prefixes, and Save preserves storyboard identity and the extended page duration.
