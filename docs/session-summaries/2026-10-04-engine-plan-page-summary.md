# Many engine clips on one reel page (T20): run summary

Date: 2026-10-04. Branch: `feat/storyboard-phase` (local, not pushed). Plan:
`docs/plans/2026-10-04-engine-plan-page.md`. Ticket: T20 (#23), criteria ticked in `docs/tickets.md`.

## What shipped

- `motion.js`: `M.scene` works inside a root (`M.root`, set by a composed page while the clip's script
  runs) and registers its `seek` in `M.clips` instead of taking `window.seek`. `M.scope(root)` is the
  clip script's `document`, with lookups limited to its scene. `M.page(duration)` is the page `seek`:
  it shows the scenes running at `t` (class `active`) and hands each its local time, held at the clip's end.
- `build.py --plan plan.json out.html`: one `data-scene` section per clip at `in`, lasting `out − in`;
  clip CSS nested under its scene; one copy of the engine and fonts; transparent page. The fragment is
  the plan clip's `clip`, else `clips/<id>-*.html` or `<id>-*.html` beside the plan.
- `base.css`: the no-shadow rule for transparent clips keys off `.alpha` on any root, not only `html`.
- Example `plan.json` gains `"duration": 54`. `reference/engine-api.md` documents composing.
- `tests/fixtures/projects/broll-project`: the six-clip example as a footage reel over 54 s of ffmpeg
  colour bars (built at test time), with a synthetic transcript.

## Checks

- Typecheck clean, `npm test` 141/141 (3 new), `npm run test:e2e` 77/77 (3 new).
- Two full-frame clips sharing ids (`shape`, `icSpark`, `cursor`) composed on one page are pixel-identical
  to each clip alone at three local times each.
- Viewed the composed reel in the editor: every still draws its clip; the panel still draws the folder
  over the colour bars.
- Single-clip build, MP4 render (87 frames), ProRes 4444 render with alpha (472 frames, `yuva444p12le`)
  and contact sheet all work with the changed engine.

## Found on the way, for T23

- A clip opens on an empty canvas while its shape pops in, so a still at a clip's in-point shows
  nothing. The first draft of the sample did that and a too-weak test passed it (`toBeVisible` accepts
  `opacity: 0`); the sample now starts each shot one second into its clip and the test checks opacity.
  T23's shot list has to place each shot where its clip has settled.
