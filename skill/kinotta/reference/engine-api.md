# Writing a clip

A clip is a small HTML fragment in `motion/clips/NN-name.html`. `engine/build.py` wraps it with the engine, fonts and a cursor into one self-contained page, where `seek(t)` draws the frame at time `t`. Every style is a pure function of `t`: no CSS transitions, no timers, no state carried between frames. That is what makes frame-by-frame rendering with motion blur possible.

## Fragment skeleton

```html
<title>04 Master prompt</title>
<style>/* clip-specific CSS */</style>

<div data-slot="world">  <!-- optional: elements beside the shape (a drop target, a folder tab) --> </div><!--/world-->
<div data-slot="shape">
  <!-- one layer per state; .L layers are anchored inside the shape -->
  <div class="L" id="Lnotes"> … </div>
  <div class="L" id="Ldoc"> … </div>
</div><!--/shape-->

<script>
M.scene({
  W:1920, H:1080, T:10,            // frame size (match the video) and clip length in seconds
  bg:'#E9E7E2',                    // canvas colour; null = transparent (panel clip → render to .mov)
  center:[960,540],                // screen point the camera centres on (move it for panels)
  intro:0.15,                      // shape pops in at this time; null = already on screen
  SH:{                             // the states the one shape morphs through
    notes:{w:780,h:560,r:36,bg:'#FFFFFF',cam:1.3},
    doc:{w:600,h:720,r:28,bg:'#FFFFFF',cam:1.2},
  },
  start:'notes', SEQ:[[5.1,'doc']],               // [clip-local time, state] – put each on its word
  layers:[
    {el:'Lnotes', tin:0.15, tout:5.1, anchor:'t'}, // anchor 'c' centre (default), 't' top-centre, 'l' left-centre
    {el:'Ldoc', tin:5.1, tout:null, anchor:'t', update:(t,g)=>{ /* per-frame content, e.g. typing */ }},
  ],
  cursor:{size:44, clicks:[2.3], drags:[[6.9,7.8]], keys:[[0,760,460],[1.2,760,460],[1.9,330,250]]},
  geom:(t,g)=>g,     // optional: change geometry (e.g. follow the cursor while dragged, g.fx/g.fy camera focus)
  extra:(t,g)=>{},   // optional: per-frame work outside layers (world elements, indicators)
});
</script>
```

Coordinates are **world pixels**. The shape is centred at world (0,0) unless `geom` moves it (`g.cx`, `g.cy`). The camera draws world → screen as `center + cam × (world − focus)`. Choose `cam` per state so the state fills the frame: roughly 1.2–1.6 for cards, 1.8–2.2 for pills. The cursor keeps a constant size on screen.

Layer content is positioned relative to its anchor, e.g. `left:-330px; top:40px` inside an `anchor:'t'` layer = 330px left of centre, 40px below the shape's top edge. Top-anchored content rides the top edge when the shape grows.

## Names for review in Kinotta

`build.py` makes each built page one Kinotta scene: `#stage` gets `data-scene` (the fragment's file name), `data-start="0"` and `data-duration` (the `T` in `M.scene`). It also names what a reviewer can click: the shape is `shape`, the cursor `cursor`, and every element with an `id` gets `data-el` set to that `id`. The `.L` layer anchors are skipped because they have no size.

- **Give every part a reviewer could point at an `id`:** the pill, the badge, a card, a row, a button, an icon. The `id` is its name in comments, so make it readable (`badge`, `costBar`, not `b2`) and keep it for the same thing in every version.
- **Put the `id` on the element that has the size**, not on a zero-size wrapper whose children are absolutely placed. A click inside a wrapper with no box goes to the nearest named element around it, usually `shape`.
- **Ids are unique on the page**, so names never repeat. An element you give a `data-el` yourself keeps it.
- Elements made at runtime (`innerHTML` in the script) are not named, because `build.py` only sees the fragment's markup. Write `data-el` into the generated markup when a reviewer should be able to pin one.

## Engine API (`window.M`)

| Call | What it does |
|---|---|
| `M.track(v0, [[t, value, preset?], …])` | A value that changes target many times: bounded state interpolation by default, or an explicit closed-form spring pair. Returns `t => value`. |
| `M.ctrack('#hex', [[t,'#hex'], …])` | The same for colours. Returns `t => 'rgb(...)'`. |
| `M.MORPH`, `M.FAST`, `M.SLOW`, `M.SOFT`, `M.CAM`, `M.INSTANT` | Bounded state-response functions: .267s MORPH, .233s FAST, .5s SLOW/SOFT/CAM. INSTANT remains `[Infinity,1]`. An explicit `[ω, ζ]` still selects a spring. |
| `M.vis(t, tin, tout, {din, lin, lout, blur})` | Signature entrance: .5s rise from scale 1.07, y 26px and blur 20px; .333s sink exit. Returns `{o, blur, s, y, a, b}`. Explicit timings override defaults. |
| `M.apply(el, v)` | Applies a `vis` result to an element (opacity, blur, scale). |
| `M.path([[t,x,y], …])` | Cursor or any point path, eased between keys with a slight human arc. |
| `M.crossTimes(f, t0, t1, thresholds)` | When a rising value first crosses each threshold. Use it to trigger springs from a dragged value. |
| `M.icon(name, size, colour, strokeW?)` | Icon from the set in `M.IC`, with stroke normalised so all icons match. |
| `M.setText(el, s)` | Set text only when it changed (cheap per frame). |
| `M.eo`, `M.eio`, `M.clamp`, `M.lerp`, `M.S` | Easing and spring helpers. |
| `M.curves.rise/state/sink`, `M.bezier(x1,y1,x2,y2)` | Sourced B1 curves, overridden by plan `brand.curves`; cubic-bezier solver returns a pure progress function. |

Icons in `M.IC`: arrow, check, x, plus, folder, terminal, file, pencil, coin, clock, chip, sparkle, castle, search. Add more as 24-grid stroke paths (e.g. from Lucide, ISC licence).

## Patterns (see `examples/opus-aoe2/`)

| Pattern | How | Example |
|---|---|---|
| Pill → card → control | SH states + layers with tin/tout | 01 |
| Liquid indicator | Two `M.track`s for left/right edges; the edge moving forward uses `M.FAST`, the trailing one `M.SLOW` | 01 (levels), 02 (effort) |
| Typing | `PROMPT.slice(0, n)` with `n` from time, and a caret | 02 |
| Rows or bars appearing on words | Per-row `M.vis(t, wordTime, …)` + width or height from a spring | 02, 04, 05 |
| Direct manipulation | While the cursor is held, the value comes from its position; on release it springs from where it was | 03 (slider) |
| Drag and drop | `geom` sets `g.cx/cy` from the cursor while held; a world-slot drop target; `g.fx` moves the camera focus | 04 |
| Transparent panel | `bg:null`, `center` in the empty area, light shapes | 02 |

## Interaction vocabulary

Map what the speaker says onto these:
- primary action (pill + click)
- progress (loader, bars, lanes)
- confirmation (check, toast)
- live status (island)
- detail card with a drag
- slider with rubber band
- toggle
- tabs
- chart with tooltip
- search and filter list
- file → drag → drop target
- terminal typing
- side-by-side comparison
- chapter card

## plan.json

```json
{
  "title": "Opus 5.5 · Age of Empires II",
  "video": "work/source.mp4",
  "fps": "30000/1001",
  "clips": [
    {"id":"01","title":"Opus 5.5 drop","line":"“Opus 5.5 just came out …”","in":0.30,"out":6.75,"kind":"full","file":"out/01-opus-drop_0m00s30.mp4"},
    {"id":"02","title":"Folder → Claude Code → four builds","line":"“I created a blank folder …”","in":6.75,"out":22.5,"kind":"panel","file":"out/02-pip-builds_0m06s75.mov"}
  ],
  "notes": ["The typed prompt and the cost/time/tokens bars are illustrative."]
}
```

Paths are relative to `plan.json`. `out` is when the clip leaves the timeline; if the clip is shorter, the composed page holds its last frame. `duration` (optional) is the video's length in seconds.

## One Kinotta page from a plan

```bash
python3 $SKILL/engine/build.py --plan motion/plan.json reels/<slug>/v<n>/index.html
```

Every clip becomes a scene on the video's timeline: `data-start` is its `in`, `data-duration` is `out − in`, and the page's `seek(t)` shows the scenes running at `t`, each at its own local time, holding its last frame if the slot outlasts it. The page is transparent wherever no clip paints, so panel clips (`bg:null`) sit over the footage, and full-frame clips cover it with their canvas. `window.DURATION` is the plan's `duration`, else the last `out`.

- A clip's fragment is the plan clip's `clip` path, else `clips/<id>-*.html` or `<id>-*.html` beside the plan.
- Clips may reuse ids and class names. Each clip's CSS is nested under its scene, and its script gets a `document` whose lookups (`getElementById`, `querySelector…`) only see its own scene. Both sit inside the scene's element, so Kinotta, which compares scene markup between versions, sees a clip whose motion alone changed as changed. Don't reach the page another way (`window.document`, `document.body` lookups of other clips' elements). Because of the nesting, a clip's `<style>` holds plain element rules only: no `@keyframes`, `@font-face`, `:root` or `body` rules (animate with the engine, and the fonts come with `base.css`).
- With `captions` and `transcript` in the plan, each caption phrase is a scene `cap-001`, … (`data-caption`) holding one element `caption`, a span per word with its times; `seek` shows the phrase under way and marks words `said` and the current one `now`. The look (`highlight`, `phrase`, `words`) and colour sit on each caption, and the caption CSS is on the page. Captions sit bottom centre over everything; keep a clip's key content above the bottom ~200 px.
- The first moments of a clip are often an empty canvas while the shape pops in, so a shot's still belongs where its clip has settled, not on its in-point.

## Effect templates in a footage plan

```json
{
  "title": "Founder talk",
  "videoType": "explainer",
  "pieces": [{ "in": 10, "out": 12 }, { "in": 14, "out": 20 }],
  "brand": {
    "fonts": [{ "family": "Project Sans", "weight": "100 900", "file": "inputs/project-sans.woff2" }],
    "curves": {
      "rise": [0.16, 1, 0.3, 1],
      "state": "cubic-bezier(0.65, 0, 0.35, 1)",
      "sink": [0.5, 0, 0.75, 0]
    },
    "tokens": { "fx-font": "\"Project Sans\"", "fx-accent": "oklch(.8 .12 225)" }
  },
  "clips": [{
    "id": "02", "template": "chip-tally", "in": 11, "out": 19,
    "fill": { "chips": [{ "text": "First point", "at": 11.5 }, { "text": "After cut", "at": 15 }] }
  }]
}
```

`template` selects `templates/effects/<name>/r1/`. To edit a template, copy that revision and set
`clip` to the copied folder, retaining `template`. The composer uses the shot's existing root
selector, scopes CSS and private helpers to the clip, sets its duration from the mapped slot,
and registers its `seek(local)` with `M.clips`. Two clips may use the same template independently.
Style and script remain inside the scene so changes appear in Kinotta's scene comparison.

`fill` keys are `data-el` names. A string replaces copy; `{ "text", "at", "src" }` changes copy,
start time and/or media source. Text is escaped, retaining SVG decoration. An array fills a
container's direct child items, cloning the last item if needed. Use arrays for title words too.
`at` is always source seconds, mapped through `pieces` and then relative to the mapped clip start.
In the example, 15 becomes clip-local 2 seconds, not 4. Items whose `at` lies in removed footage
are omitted; a named scalar cue in a snip remains present for script lookups but stays hidden.
Unfilled timings retain their template-local values. Attached native-media clips
map through their named placement and cycle; unattached native-media clips use reel seconds.

The footage is the plate: the composer omits plate and subject layers by default. Set
`keepLayers: ["plate"]` to keep a supplied plate. Framing, grade and plate-punch effects need
that picture to affect it; they cannot alter footage outside the composed page. `text-behind`
requires `fill.subject.src` with the subject matte and keeps it. Media source paths resolve beside
the shot, including filled `src` paths; brand font paths resolve beside the plan. Local asset
bytes are embedded so the built page does not depend on the source folders.

The composer includes `shared.css` and `presets.css` once. `brand.tokens` accepts CSS values for
`fx-*`, `cap-*` and `grade-*` custom properties. `brand.fonts` embeds binary FontFaces once before
scenes run, with the first family as `fx-font` unless that token is supplied. Await `window.seek(t)`
before taking a still; it waits for brand fonts and template video seeks. Brand curves override
the engine defaults for both fragments and templates. Without a brand, Geist (OFL) and the
sourced B1 curves apply; `.type-*` classes and `--type-*` tokens expose the scale documented in
`reference/motion-broll.md`.

`videoType` is authoring guidance, one of `explainer`, `interview`, `tutorial`, `demo`, `short`,
`lecture` or `vlog`. Apply SKILL.md section 5's treatment; it does not mechanically change layout.
