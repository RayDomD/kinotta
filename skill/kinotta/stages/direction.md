Reads: `../SKILL.md`, `reels/.kinotta/<slug>/style.json` when present, the brief, brand sources and supplied references.
Does: Collect direction and analyse references.
Writes: Reel notes and choice sheets.
Owner's check: Choose any requested option.

Paths such as `reference/`, `assets/`, `templates/`, `engine/` and `scripts/` are relative to the skill root, not this stage folder.

## Direction before building

Before asking anything, read `reels/.kinotta/<slug>/style.json` when present and any `direction` in the request. Treat its `rules` as the owner's kept notes and its `form`, `look`, `settings`, `fonts`, `music`, `effects`, and `shots`, along with the request's direction, as already answered. Ask only for missing inputs. Never write `style.json`; the Direction screen owns it.

For a new reel, collect only missing inputs in one round, then record the answers and one
concept line in the reel's notes: what the viewer understands or feels, and how every shot
serves it. Ask the format (such as 9:16) when absent; a reference does not decide the format.

| Reel type | Brief inputs |
|---|---|
| Explainer | Audience, ordered steps with a clear start and result, length (start near 5 s per idea), style, and sources for a fact check. |
| Launch | Product and promise, 3 to 5 moments in order, brand hex and font, tempo, and ending. |
| Showreel | Concept, tempo and bars, and techniques to demonstrate. |

Put two more questions in the same round unless the request or `style.json` has already answered them:

- **Sound.** Offer a score and effects, effects only, none, or the owner's own file, with the score as the recommended answer. Apply the answer to the whole reel and place it as `reference/sound.md` describes. Without an answer, follow the first-build default in that file.
- **Project style.** When the project holds a written style document (for example `docs/style-guide.md`), name it and offer it as the look, next to the built-in brand. Apply it when the owner accepts, and say in the hand-over which look the reel uses.

On music-led reels, derive event times from tempo and align changes to the beat grid.
Speech-led reels retain speech and reading time even with music. The nine new effects in
`templates/effects/README.md` are optional starting points, never a requirement.

When a reference video is supplied, or a font or palette remains open, follow **Reference analysis
and choice sheets** below before building.

## Interview

Use the AskUserQuestion tool; keep it to one round. You need:

- **The video.** A path. Copy or reference it as `motion/work/source.*`.
- **The transcript.** Don't ask for one: get word timestamps from the audio with faster-whisper (`pip install faster-whisper`). Use an SRT or VTT only when the owner hands one over.
- **Density:**
  - Light: 2–4 clips per minute, only the strongest moments.
  - Medium (default): 4–7 per minute.
  - Heavy: most lines covered, with short gaps of face.
- **Look:**
  - The default palette: warm gray canvas, black and white components, one orange accent.
  - Or their brand: colours, and optionally a font. Ask them to drop a logo, screenshots or brand colours into `motion/inputs/`, and read those.
- **Sound and project style.** The two questions above, in the same round.
- **Anything to avoid or include.** Lines to leave on their face, real numbers or names to show, product screenshots to recreate.

Skip any question the user already answered.

### Reference analysis and choice sheets

When given a reference video, inspect it before building. Use the existing inspection script
for metadata, then extract 12 fps frames and a contact sheet with ffmpeg. Example (write into
the reel's work folder; use numbered pages for a long reference):

```bash
python3 $SKILL/scripts/inspect_video.py reference.mp4 motion/work/reference
ffmpeg -i reference.mp4 -vf fps=12 motion/work/reference/frame-%05d.png
ffmpeg -i reference.mp4 -vf "fps=12,scale=320:-1,tile=4x6" motion/work/reference/sheet-%03d.png
```

Inspect every sheet. Write cut times, approximate motion curves with measured positions at
sample times, main colours, and a device map to optional effect templates (or mark a device
new) in the reel's notes. Name what was measured and what was inferred; 12 fps bounds cut
precision to about 83 ms. Take technique from the reference and story from the brand.
Create original implementation and assets; the reference is not a source of reusable code,
copy or media without permission.

For an open font or palette, render a choice sheet of six to eight numbered candidates using
the actual title, scale and background treatment, with brand fonts locally available. Use
`engine/beats.js` on a seek-driven candidate page (one candidate at each sampled time), then
ask the owner to pick a number. Save the sheet, candidate mapping and answer in the notes;
apply the answer before the full build. Unattended jobs record supplied choices or defaults.


