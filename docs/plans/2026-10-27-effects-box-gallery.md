---
title: Effects box and gallery
date: 2026-10-27
status: Done
summary: The Effects box starts empty; a full gallery of every effect lets the owner pick which ones go in it, then they drag from the box onto a frame.
spec:
---

## Intent

- Problem: The Effects box beside Comments (`EffectsDrawer` in `web/src/PinnedEffects.tsx`) lists all 25 catalogue effects in a small two-column scroll. You can only see about four at a time, there is no grouping, and the effects you actually want are mixed in with the ones you don't.
- Why: The owner asked for it on 2026-10-27. With 25 effects across six categories, picking from a cramped scroll is slow, and the box should hold only what this owner means to use.
- Proposed outcome:
  - The box starts empty, with a short line saying how to fill it and a "Browse effects" button.
  - "Browse effects" opens a full view of every effect, grouped by category (words, lists, speaker, screens, looks, structure), each with its moving preview, name, "Instant · free" or "Needs the agent", and what it needs.
  - Clicking an effect in the full view adds it to the box (and clicking again removes it). The box shows the chosen effects.
  - Dragging from the box onto a frame works exactly as today.
- Affected: `web/src/PinnedEffects.tsx`, `web/src/CommentsPanel.tsx`, `web/src/Storyboard.tsx` (drop target, unchanged behaviour), `web/src/Library.tsx` (`PREVIEW_HTML`), `web/src/styles.css`, the e2e and render tests for the drawer.
- Constraints:
  - The drag type (`EFFECT_DRAG_TYPE`) and the drop onto a frame are unchanged; existing pinned effects and batches read as today.
  - Phones keep "Adding effects needs a computer."
  - The full view follows `DESIGN.md`; previews stay the catalogue's own preview pages.
- Out of scope: New effects, changes to how an effect is pinned or built, and the Direction step's "Effects to try" list.
- Open questions:
  - O1: Is the box's contents remembered per reel, per project, or only for this browser? Resolved 2026-10-27, owner approved: per project, saved with the project, so it survives a reload and another browser.
  - O2: Should the Direction style's "Effects to try" pre-fill the box for that reel? Resolved 2026-10-27, owner approved: no, keep the box the owner's own choice.

## Goal

1. A new project's Effects box is empty and says how to fill it.
2. "Browse effects" shows all catalogue effects grouped by category, with previews; clicking one adds it to the box or removes it.
3. The box's contents survive a reload and a different browser on the same project.
4. Dragging from the box onto a frame pins the effect exactly as today.

## Approach

Store the box as a list of effect ids per project at `reels/.kinotta/effects-box.json`, beside the existing per-reel state (`markers.ts` uses `reels/.kinotta/<slug>/markers.json`). One small server module reads and writes it, with a GET and PUT route in `handler.ts` and a client call in `web/src/api`. Ids no longer in the catalogue are dropped on read.

`EffectsDrawer` shows the stored ids in the order added, plus a "Browse effects" button. The gallery is a dialog over the editor: six category sections, each a grid of the existing preview cards (`PREVIEW_HTML`), each card a toggle with `aria-pressed`. Previews animate only while the dialog is open. The drag source and `EFFECT_DRAG_TYPE` are untouched.

## Steps

1. [x] Core test (red): the box reads empty for a new project; save and read back; unknown ids dropped.
2. [x] Server module, routes, client call.
3. [x] Drawer: empty state, chosen effects, "Browse effects" button.
4. [x] Gallery dialog: categories, toggle cards, keyboard and focus handling, close on Escape.
5. [x] E2e: open the gallery, add two effects, reload, both still in the box, drag one onto a frame, pin saved.

## Risks

- 25 animated previews at once can be heavy: pause previews outside the viewport.
- Existing e2e tests that drag from the full drawer need the box filled first.

## Checks to run

- New core test and the drawer e2e.
- Existing pinned-effect e2e suites.
- `npm run typecheck`, `npm run build`.

## Result

Shipped as planned. A new project's Effects box is empty and says how to fill it; "Browse effects" opens a modal gallery of all 25 effects in six categories; clicking a card adds or removes it; the box is saved with the project; dragging from the box onto a frame is unchanged.

- Server: `server/core/_internal/effects-box.ts` stores the ids at `reels/.kinotta/effects-box.json` (empty when missing, order kept, duplicates and ids no longer in the catalogue dropped on save and on read). `GET /api/effects/box` and `PUT /api/effects/box` in `handler.ts`; the PUT sits before the handler's non-GET gate and refuses cross-site requests like the other mutating routes. Client calls `fetchEffectsBox` and `saveEffectsBox`.
- Web: `EffectsDrawer` shows the stored effects (drag source and `EFFECT_DRAG_TYPE` untouched) and a "Browse effects" button. `EffectsGallery.tsx` is a native `<dialog>` (focus trap, Escape closes, focus returns to the button), category sections from `Library.tsx`'s `CATEGORIES` (now exported), toggle cards with `aria-pressed`. Saves run in order so quick clicks land correctly; the box updates at once.
- Previews animate only while the card is on screen (IntersectionObserver pauses the rest); the drawer's own previews stay still as before. Phones keep "Adding effects needs a computer."
- Verified in the running UI at 1440 wide (Playwright screenshots): empty box, gallery top and bottom, box after reload with the two chosen effects. Drag from the box pinned `big-word` after a reload.

Deviations and additions:
- Added an HTTP-level test (`tests/core/effects-box-http.test.ts`); it caught a 405 from the handler's non-GET gate on the first PUT.
- Updated the Pinned effects paragraph in `DESIGN.md` to describe the empty box and gallery.
- Existing pinned-effect e2e tests now fill the box through `saveEffectsBox` before dragging (the plan's risk).
- Playwright needs `npm run build` first here (web/dist is not in the checkout).
- Not built: removing an effect from the box outside the gallery (the plan removes by clicking again in the gallery), and no change to the Direction step's "Effects to try" (out of scope, O2).

Checks (run in the container, `KINOTTA_E2E_PORT_BASE=5099`):
- `tests/core/effects-box.test.ts` and `effects-box-http.test.ts`: red first, then 2 passed.
- `pinned-effects.spec.ts`: 6 passed (5 existing, 1 new).
- `npm run typecheck`: clean. `npm run build`: no errors. `npm run check:docs`: ok. `npm run check:commits -- origin/main`: ok.
- `npx vitest run --project unit`: 118 files passed, 1 skipped; 1150 tests passed, 3 skipped.
- Full e2e: 173 passed, 22 failed, 3 did not run. Every failure is in `agent-confirm`, `agent-strip`, `simple-mode` or `playback-stutter`, the specs that fail on unmodified origin/main in this container; none touch the Effects box.

## Changelog

### 2026-10-27
- Plan created with Intent only. Owner confirmed the empty box plus full gallery on 2026-10-27.
- Owner approved the Intent and its recommended answers; Goal, Approach, Steps, Risks and Checks written. Status Approved.

### 2026-10-27 (build)
- Built and verified; status Done.
