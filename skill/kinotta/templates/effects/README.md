# Effect templates

Starting points for parts-reel shots. Each folder is one shot revision (`<effect>/r1/`) under the timing contract: one `data-scene` root, named `data-el` elements, and a self-contained `shot.js` whose `seek(local)` computes every frame. No CSS animation, timers or randomness.

To use one, copy `<effect>/r1/` to `reels/<slug>/shots/<name>/r1/`, then rename the scene in all three files (the `data-scene` value, every CSS selector, and the `querySelector` in `shot.js`). Replace the placeholder copy and assets. Copy the tokens in `shared.css` into the reel's shared stylesheet and set them from the brand file. Templates that read presets also need `presets.css`: the talking-head caption preset and the warm, mono and cool grades.

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

Any `<img>` layer may be a `<video>` instead; the media templates seek every video in the scene to the shot's local time (plus `data-offset`).

Motion follows the taste list: ease-out entrances from 0.96 to 0.97 scale, 60 to 80ms stagger, faster ease-in exits in the last 0.2 to 0.25 s, and only `transform`, opacity and clip-path animated, plus `filter` for caption blur-in and grades. Vary the placement and entrance when a reel uses one template more than once in a row.
