# One engine clip opens in Kinotta (T19): run summary

Date: 2026-10-04. Branch: `feat/storyboard-phase` (local, not pushed). Plan:
`docs/plans/2026-10-04-engine-clip-in-kinotta.md`. Ticket: T19 (#22), criteria ticked in `docs/tickets.md`.

## What shipped

- `build.py` makes each page one scene (`data-scene` from the file name, `data-start="0"`,
  `data-duration` from `M.scene`'s `T`) and names the shape, the cursor and every element with an
  `id`, except `.L` layer anchors. A fragment with no `T` stops the build with a message.
- `reference/engine-api.md` gains "Names for review in Kinotta": readable, stable ids on the part that
  has the size; runtime-made elements need `data-el` written into their markup.
- `beats.js` makes its temp folder in the OS temp directory (it used `/tmp`, which failed on Windows).
- The editor's hit test (`web/src/stage/_internal/dom.ts`) hands a click inside a named wrapper with no
  box to the nearest named ancestor with one. Before, such a click pinned nothing.
- `tests/fixtures/projects/engine-project`: two one-clip reels (`opus-drop`, `effort-slider`) whose
  pages are built from the skill's examples at test time (`tests/helpers/engine.ts`).

## Deviations

- The hit-test change is in the editor, not the engine: `build.py` cannot see element sizes, and
  three of the six examples carry ids on zero-size wrappers.

## Checks

- Typecheck clean, `npm test` 138/138 (3 new in `tests/engine/build.test.ts`), `npm run test:e2e`
  74/74 (3 new in `tests/e2e/engine.spec.ts`). The wrapper test fails with the old hit test.
- All six examples build with one scene and no duplicate names.
- A built clip renders (186 frames, 1920x1080) and makes a contact sheet, through a shim that
  launches the installed Chrome.

## Open

- `render.js` still hangs when its output folder doesn't exist.
