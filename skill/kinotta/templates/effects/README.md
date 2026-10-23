# Effect templates

Starting points for parts and footage reels. Each folder is one shot revision (`<effect>/r1/`) under the timing contract: one `data-scene` root, named `data-el` elements, and a self-contained `shot.js` whose `seek(local)` computes every frame. No CSS animation, animation timers or randomness.

To use one, copy `<effect>/r1/` to `reels/<slug>/shots/<name>/r1/`, then rename the scene in all three files (the `data-scene` value, every CSS selector, and the `querySelector` in `shot.js`). Replace the placeholder copy and assets. Copy the tokens in `shared.css` into the reel's shared stylesheet and set them from the brand file. Templates that read presets also need `presets.css`: the talking-head caption preset and the warm, mono and cool grades.

For a footage plan, use `{ "id": "02", "template": "chip-tally", "in": 10, "out": 16,
"fill": { "chips": [{ "text": "PhD, Stanford", "at": 11.86 }] } }` directly. `build.py --plan`
loads the same revision, scopes it to this clip and registers its seek. `fill` targets `data-el`
names; an array fills the target's child items, preserving SVG decoration. Copy and timing can
also be filled with `{ "text", "at", "src" }` on one element. `at` is source seconds, mapped
through `pieces`; items spoken in snips are omitted. Unfilled template timings remain local.
For custom markup, copy a revision and give its folder as `clip` alongside `template`.

Footage supplies the background: plate and subject layers are omitted by default. Use
`keepLayers: ["plate"]` to retain a supplied plate (needed to punch, frame or grade that picture).
These effects cannot transform the editor's underlying footage through a transparent page.
`text-behind` requires `fill.subject.src` pointing to a supplied matte and retains that layer.
Relative asset sources resolve beside `shot.html` and are embedded. Tokens from `shared.css`
and `presets.css` load once; plan `brand.tokens`, `brand.fonts` and `brand.curves` override them.
See `reference/engine-api.md` for the full plan shape.

| Effect | What it does | Inputs |
|---|---|---|
| `section-tag` | A number chip and label wipe in at a corner. | Number, label |
| `text-behind` | Display text rises between the footage and the person. | `plate` (full frame) and `subject` (the same frame with only the person, with alpha). Kinotta does not cut out a person yet; supply the matte. |
| `floating-cards` | Tilted clip cards rise and settle around the subject. | Up to three clips or stills; place each with `--x`, `--y`, `--tilt` |
| `number-cut` | The frame punches in and blurs behind the next section number. | Plate, number |
| `big-word` | One spoken word fills the frame at a time. | Words with `data-at` start times |
| `checklist` | A panel whose items tick at their `data-at` times. | Items |
| `before-after` | Two phone frames, the After time counts down, then a feature row lands. | Two clips, `data-from` and `data-to` in seconds, features |
| `prompt` | A line types into an input, then Send is pressed. | The line, `data-type-at`, `data-cps` |
| `title-card` | A card whose title arrives word by word, then a subtitle. | Title, subtitle |
| `captions` | One word at a time near the top, key words large, filler small, one accent word; each blurs in. | Words with `data-at`, `data-kind` (`key`, `accent` or filler), optional `data-band="low"`; caption preset |
| `chip-tally` | A row of check chips grows by one per spoken item. | Chips with `data-at`; row height `--y` |
| `activity-feed` | Notes stack into two columns beside the speaker. | Notes with `data-at` in `.left` and `.right` |
| `framed-speaker` | The footage shrinks into a rounded card on a dark ground; ring, block, bars and squiggle draw in. | Plate, `data-frame-at` |
| `live-grade` | The footage changes grade on the word that names it. | Steps with `data-at` and `data-grade` (`warm`, `mono`, `cool`, `none`); grade presets |
| `annotate` | Labels enter; a red X strikes one, a hand-drawn loop circles a word. | Labels and word with `data-at`; `.strike` and `.loop` with their own `data-at` |
| `arc-flow` | A thumbnail rides a dotted arc between two devices; the receiver's bar fills, then ticks. | `data-send-at`, `data-arrive-at`; device labels |


| `shape-morph` | Circle becomes bar then open frame with continuous position. | `title`; root `data-bar-at`, `data-frame-at` (local seconds). Match terminal geometry to the next shot. |
| `motif-carry` | Outgoing underline travels into the next scene's spine. | `outgoing`, `incoming`; root `data-carry-at`. Keep the bridge in one shot or match its endpoint in the next. |
| `letter-swap` | Letters exit then replacements enter without overlap. | `old-word`, `new-word` (`text`, `at`); unequal lengths supported. |
| `beat-showreel` | Hook in bar 1, beat events, final bar returns to opening. | `hook`, `events` array; root `data-bpm`, `data-bars`, `data-beats-per-bar`. Duration = bars * beats per bar * 60 / bpm. |
| `phone` | Scrolls supplied screens and taps through them. | `title`, `screens` array of `{ src, at }`, `tap.at`; per-screen `data-scroll` in pixels. |
| `chart` | Labelled bars build from supplied nonnegative data. | `title`, `source`, `data` array of `{ text: "Label\|value", at }`. Replace zero placeholders with verified plan data. |
| `diagram` | Ordered process boxes and arrows draw step by step. | `title`, `steps` array of `{ text, at }`; allow reading time. |
| `film-look` | Frame-indexed grain, light bloom, vignette and optional mono. | `plate.src`, `title`; root `data-fps`, `data-mono`, `data-enabled`; CSS `--film-grain`; mono needs `presets.css`. |
| `presenter-split` | Insert enters while speaker is re-cropped at constant scale. | `plate.src`, `screen.src`, `title`, `insert.at`; root `data-side`, normalized `data-focus-x`. |

Any `<img>` layer may be a `<video>` instead; the media templates seek every video in the scene to the shot's local time (plus `data-offset`).

Templates use the engine/brand rise, state and sink curves when present, with standalone easing
fallbacks. Their authored effect-specific timing and geometry remain adjustable. Use one signature
entrance across a reel and vary devices and placement; never repeat a template in adjacent clips.
Follow the video-type treatment and taste lists in SKILL.md section 5. Animate `transform`, opacity
and clip-path, plus `filter` for blur and grades.

These nine additions are optional. Copy a revision to adjust root attributes or geometry;
plan `fill` changes text, cue times and sources, not arbitrary data attributes. All nine use
brand/shared `--fx-font`, `--fx-ink` and `--fx-accent`; `--fx-ground` is an optional ground
override. Film-look also uses the mono preset. Included SVG plates and screens are original
illustrative fixtures. Replace with supplied assets and record sources before delivery.

Film-look and presenter-split need `keepLayers: ["plate"]` in a footage plan to finish or
re-crop the supplied picture; they cannot alter the editor's underlying video. For a video
plate, copy the revision and replace its image with a muted, preload-auto video. Revision seek functions return promises for video seeks. The existing footage composer
does not await those promises; image-based scratch checks do not prove video-plate seeking. Use matching footage and offset, then check in Review.
Film-look enlarges a 240 x 135 deterministic noise field with no blur pass; tune opacity first.
Compare the same Review playback with `data-enabled="true"` and `"false"` using frame intervals
and video dropped-frame counters. Presenter-split retains a 1920 x 1080 plate, changing only the
clipping viewport and horizontal crop. Choose focus from the actual speaker and verify the
face stays clear. Choice sheets use the actual title treatment, not fixture colours.
