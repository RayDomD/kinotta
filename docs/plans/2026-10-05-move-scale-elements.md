---
title: Move and scale elements on footage reels (T39)
date: 2026-10-05
status: Done
summary: T39. element-offset operation; click an element in the frame, drag to move, corner handle to scale; build.py applies per-clip offsets with CSS translate and scale so they stack on the clip's own animation.
spec: docs/tickets-review-edit.md T39 (#41); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: An element in a b-roll clip (a badge, a panel) cannot be nudged or resized without an agent re-running the clip.
- Why: Small placement fixes are most of what review finds; the owner should make them by hand.
- Proposed outcome: Click an element in the frame, drag it, scale it from its corner. Save writes the offset into the plan and the next version shows the element moved through its whole animation.
- Affected: `skill/kinotta/engine/build.py`, `server/core` (edit model), `web/src/stage` (PagePlayer), `web/src/review`, `playwright.config.ts`, `reference/engine-api.md`.
- Constraints: Clip code is untouched (E10). The page holds no editor markup: outline, handles, tag and ghost are drawn over the frame. A plan without offsets builds the same page.
- Out of scope: code-only reels (T40), rotating, moving elements in caption scenes (T37), the skill's rules for offsets (T46).
- Open questions: How a whole clip is selected (decided below).

## Goal

`element-offset { clip, element, x, y, scale }` is an operation in the edit list. The editor previews it over the page and Save writes it into the plan; `build.py` applies it.

## Approach

- Plan: a clip's `offsets` is `{ "<element>": { x, y, scale } }` (CSS px of the element's parent space, scale a factor; 0, 0, 1 is no offset). The reserved name `@clip` is the clip's root, so a whole panel clip moves the same way.
- Engine: `build.py` writes one `<style>` per clip with `translate` and `scale` on `[data-scene="..."] [data-el="..."]` (the root: the scene itself). The individual properties compose with the clip's animated `transform`, `left` and `top`, so no clip code changes. Only non-default offsets write anything.
- Core: the operation replaces that element's entry; all-default removes it (and an empty `offsets`). A clip must exist, `scale` is in 0.1 to 10.
- Editor: `PagePlayer` draws an overlay over the frame (select tool): click picks the named element at the pointer (Alt: the whole clip), drag moves, corner handle scales about the element's centre. A tag shows the element name and offset while dragging; a dashed ghost marks the original place (measured with the offset cleared). The unsaved offsets are previewed as inline `translate` and `scale` on the page's elements. A scene is matched to its plan clip by file name.
- Drag distances are page pixels divided by the ancestors' scale (probed), so a camera zoom does not skew them.

## Steps

1. Core tests and `edit-model.ts`, `edit-list.ts`.
2. Engine tests (stacking in a real browser, drift) and `build.py`.
3. `PagePlayer`, `Review`, `edited.ts`, `EditsPanel`, CSS.
4. Playwright in `clips.spec.ts` (port 4384).
5. Checks, rebuild the footage sample only if its page changed.

## Risks

- A clip that sets its own `translate` or `scale` on an element would clash; engine clips use `transform`.
- Under a camera zoom a stored offset is in the element's parent px, not page px.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, e2e through a scoped scratch config (clips).

## Changelog

### 2026-10-05
- Plan created.
- Done. See the session summary.
