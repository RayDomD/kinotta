# Move and scale elements on footage reels (T39, #41): run summary

Date: 2026-10-05. Branch: `feat/review-edit-phase` (local, not pushed). Plan: `docs/plans/2026-10-05-move-scale-elements.md`.

## What shipped

- Plan field: a clip's `offsets` is `{ "<element>": { x, y, scale } }` (CSS px of the element's parent space, a factor about its centre). `@clip` is the clip's root, so a whole panel clip moves the same way.
- Engine: `build.py` writes one `<style>` per clip with CSS `translate` and `scale` on `[data-scene="..."] [data-el="..."]` (the scene itself for `@clip`). The individual properties compose with the clip's own animated `transform`, `left` and `top`, so clip code is untouched (E10). Only non-default offsets write anything, so a plan without offsets builds the same page (the committed footage sample needed no rebuild).
- Core: operation `element-offset { clip, element, x, y, scale }` in `edit-model.ts` (apply, `operationTouches`, `describeOperation`, edit list kinds). It replaces that element's entry; 0, 0 at scale 1 removes it (and an empty `offsets`). A clip must exist; scale is 0.1 to 10; an element name cannot hold spaces, quotes, backslashes or angle brackets (it goes into a CSS selector).
- Editor: `web/src/stage/_internal/ElementLayer.tsx`, drawn over the page by `PagePlayer` (new `elements` prop). With the Select tool a click picks the named element under the pointer (Alt: the whole clip), a drag moves it, the corner grip scales it about its centre. The name tag shows `<clip> · <element>` and the offset (`+x, +y · n%`), a dashed ghost marks where the element sits with no offset (measured with the offset cleared), and an outline and grip mark the selection. The unsaved offsets are previewed as inline `translate` and `scale` on the page's elements. Nothing editor-made is inside the page (tested). A scene is matched to its plan clip by fragment file name, else `<id>-`.
- Edits panel lists "Clip 02 · 00:03.20 · Moved conflict-panel by 83, 83 at 128%".
- Tests: `tests/engine/offsets.test.ts` +3 (real Chrome: an offset stacks on an element whose transform, left and top are animated, at three times, for position and scale; the clip root moves a whole clip; none or all-home offsets build the identical page), `tests/core/edit-model.test.ts` +5, `tests/core/snip-save.test.ts` +1 (real build on the footage sample: plan, v2 page, v1 untouched, changed sections and no claim mismatch), `tests/web/edited.test.ts` +3, `tests/e2e/clips.spec.ts` +1 (port 4384: select, drag, tag shows the offset, ghost, card, no markup in the page, grip scales, Save writes plan and page).

## Decisions and deviations

- The operation names a clip by id only; the editor maps the page's scene to the clip (a scene is `build.py`'s file-name stem). "Clip id or scene" in the brief came to the one.
- Offsets are in the element's parent px. Under a camera zoom a page pixel is not an offset pixel; a drag divides by the ancestors' scale (probed), so it follows the pointer, and the tag shows the stored value.
- Scale is about the element's centre (the CSS default origin), so scaling does not move the centre. Handles are not in the mockup beyond a square corner grip; I drew one at the bottom-right.
- A pointer press calls `preventDefault`; without it Chrome cancelled the pointer a few moves into a grip drag.
- Not done: arrow-key nudging of a selected element (the captions have it); the keyboard pass is T47. The skill's rules for offsets are T46. Code-only reels are T40.

## Checks

- `npm run typecheck`: clean.
- `rtk proxy npm test`: 27 files, 288 tests passed.
- `rtk proxy npm run test:e2e`: not run (ports 4398/4399 held by orphaned servers). With a scratch config outside the repo (ports 4384, 4385, 4386 only, no reuse, servers stopped after): `clips.spec.ts`, `snip-save.spec.ts` and `review.spec.ts`, 12 passed (the T36 test that failed in the T37 run passes). Run after `npm run build`.
