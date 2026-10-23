<!-- Copied from the standalone motion-broll skill's SKILL.md (2026-10-03, T18). In this copy, `$SKILL` means the
Kinotta skill folder. For a Kinotta footage reel, the Kinotta SKILL.md wins wherever the two disagree. -->

# Motion B-roll

You make motion-graphic clips for a creator's video. Every clip is **one shape that never cuts**: it morphs its size, corners and colour from state to state while its content swaps with a short blur. A cursor drives the changes with real clicks and drags, and every change lands on a spoken word.

The output is a set of clips the creator drops into their editor. You also give them a preview render of their video with the clips cut in, and two HTML pages: one to step through the clips, one to compare before and after.

Everything you need is in this skill folder:

- `engine/`: the motion engine (`motion.js`), the page shell (`base.css`), `build.py` (clip → self-contained HTML), `render.js` (frame-by-frame render with motion blur), `beats.js` (contact sheets of stills), fonts (Geist, OFL).
- `scripts/`: `setup.sh`, `inspect_video.py`, `words.py`, `make_pages.py`.
- `reference/engine-api.md`: how to write a clip. **Read it before writing your first clip.**
- `examples/opus-aoe2/`: six finished clips for a real 54-second video. Use them as the quality bar and as starting points.

Below, `$SKILL` means this skill's folder. Work in a `motion/` folder in the user's project.

## 1. Set up (first run only)

```bash
bash $SKILL/scripts/setup.sh ./motion
```

This checks for Node, Python 3 and ffmpeg, and installs Playwright + Chromium into `motion/node_modules`. Run every engine script with `NODE_PATH=./motion/node_modules`.

## 2. Interview

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
- **Anything to avoid or include.** Lines to leave on their face, real numbers or names to show, product screenshots to recreate.

Skip any question the user already answered. Before building a new reel, write its concept
line in the reel's notes: what the viewer understands or feels and how the shots serve it.
Collect missing inputs by type: explainer audience, ordered steps, length (about 5 s per idea
as a starting estimate), style and a fact check; launch product and promise, 3 to 5 ordered
moments, brand hex and font, tempo and ending; showreel concept, tempo and bars, techniques.
Ask the format (for example 9:16) when absent. On music-led reels derive a tempo grid;
speech-led reels keep speech and reading time in control even with music.

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


## 3. Inspect the footage

```bash
python3 $SKILL/scripts/inspect_video.py motion/work/source.mp4 motion/work
python3 $SKILL/scripts/words.py transcript.srt > motion/work/words.txt
```

Look at `motion/work/contact.png` yourself. `video.json` gives resolution, fps and layout sections:
- **full:** the speaker fills the frame.
- **pip:** the speaker is in a box and the rest is empty. It includes the box position and a warning if the box changes size or moves.

Clips must match the video's resolution and fps. Word times from an SRT are estimates (±0.2s); treat them as such.

## 4. Plan, and get approval before any code

Show a table with one row per clip:

| # | In–Out | The line it covers | What the shape does, on which words | Treatment | Why |

**Creative direction: decide how much of the frame each clip takes.** This is the most important call; make it per clip and give the reason.

- **Full-frame cutaway.** The frame is all speaker, and the line describes something to *see*: a product, a process, a comparison, a number, a chapter change.
  - Cut away for the length of the idea (3–10s), then give the face back.
  - Don't cut away in the first second of the hook or on personal, emotional or opinion lines.
  - Leave at least ~2s of face between cutaways.
- **Panel in the empty space.** The edit already leaves room: a PiP box, a split, a plain region.
  - Render a transparent clip (`bg:null`) centred in the empty area, sized to stay clear of the speaker's box at every moment.
  - It can run long (15s+) as one continuous morph, because the speaker stays on screen.
  - If `inspect_video.py` reports the box changing, ask whether that's intended, then size for the largest box or split the panel at the change.
- **Nothing.** The line is about the speaker, or it's too close to another clip.

**Content rules:**
- Show the subject's real objects: the folder, the terminal, the file, the product, the result. Pull them from the words. Map each idea onto an interaction from the vocabulary in `reference/engine-api.md` (pill + click, progress, check, status island, card with a drag, slider, toggle, tabs, chart + tooltip, search/filter, file drag-and-drop, terminal typing, side-by-side comparison, chapter card).
- **Never invent numbers, quotes, prices or results.** Use relative bars, skeleton text lines or labels taken from the transcript, and list what is illustrative. Put real figures in only when the user gives them.
- One idea per clip. A continuous stretch (a whole PiP section) can be one long clip with several states.
- Pace to speech, not music: one change per spoken beat, about 0.4–1.2s apart.

Wait for the user to approve or edit the plan.

## 5. Build

Write one fragment per clip in `motion/clips/NN-name.html`, following `reference/engine-api.md` and the examples. Then build:

```bash
python3 $SKILL/engine/build.py motion/dist motion/clips/*.html
```

Put each state change on its word: clip-local time = word time − clip in-point.

## 6. Check stills on the key words and every beat

```bash
NODE_PATH=./motion/node_modules node $SKILL/engine/beats.js motion/dist/NN-name.html motion/work/NN.png 0.4 1.2 2.1 …
```

Before a full render, sample one still per music beat on music-led reels, or per spoken beat
on speech-led reels. Derive music samples from the track tempo; preserve reading holds.
Pick the times where each state has settled and a couple of mid-morph moments. Look at every sheet yourself. Fix anything cramped, clipped, unreadable or off-word, or where the cursor leaves the frame. Then check once more. Panel clips render on black in the sheet so you can judge them.

## 7. Render

```bash
NODE_PATH=./motion/node_modules node $SKILL/engine/render.js motion/dist/NN-name.html motion/out/NN-name_0m32s40.mp4 30000/1001
```

- Use the video's fps.
- Panel clips (`bg:null`) must be written to `.mov`, which gives ProRes 4444 with alpha.
- Name each file by its timeline in-point (`0m32s40` = 0:32.40).
- Rendering takes 4 subframes per frame, so it is slower than real time. Run two clips in parallel on a multi-core machine.

## 8. Deliver

Before hand-over, measure readable intervals: tags at least 0.8 s, titles at least 1.5 s.
Check that inserts and captions cover neither the speaker nor key words; document intentional
full-frame cutaways separately. Run a short sample on light and dark grounds before the full
render and inspect contrast, clipping and grain. Record intervals, samples and corrections in
the reel's notes. Use the optional effects only when they serve the concept.


Write `motion/plan.json` (schema in `reference/engine-api.md`). The preview is a Draft render of the reel's version,
made by Kinotta (`kinotta render <reel> v<n> --preset draft` prints the file's path); copy it to
`motion/out/preview.mp4`, then:

```bash
python3 $SKILL/scripts/make_pages.py motion/plan.json motion/out/preview.mp4
```

The user gets, all in `motion/out/`:
- the clips
- `TIMING.md`: file, in, out, the line it covers, the treatment, and what is illustrative
- `preview.mp4`: their video cut by the plan's pieces with the clips and captions over it, original audio
- `viewer.html`: step through the clips
- `compare.html`: original vs preview, synced, as side by side, stacked or wipe

Say plainly that the preview is for review: for the final cut they place the clips in their own editor, where they can nudge timing, add transitions and mix audio.

## Style defaults

The user's brand overrides these.

- **Colour:** canvas `#E9E7E2`, ink `#0B0B0B`, white components, one accent `#FF5A1F`. Panel clips on dark footage use light shapes (`#F4F2EE`).
- **Type and icons:** Geist for UI text, Geist Mono for code, file names and terminals. One icon set with one stroke weight (`M.icon`).
- **Motion:** the engine's rise/state/sink curves and bounded state presets, sourced in `docs/research/2026-10-20-engine-defaults.md`. The signature entrance settles from 1.07 scale, 26px down and 20px blur over .5s. Brand curves override these; explicit spring pairs remain available for authored motion.
- **Type scale:** display/headline/title/body/label/figure are 80/36/20/16/13/72px, exposed as `--type-*` tokens and `.type-*` classes. Video title/row/minimum tokens are 12.6/5.2/4.8vw. Geist remains the bundled OFL default; a plan's brand fonts override it.
- **Banned:** unmotivated bouncy easing (playful drop-ins may use three steps and one small settle), particles, glows, gradients on UI chrome, mixed icon strokes, dead time, made-up data. Vary the shared effect templates across shots as section 5 of the Kinotta skill requires.

## Gotchas

- Never put `will-change` on anything the camera scales; text renders blurry.
- Text swapping inside a morphing container needs its own enter and exit timing (`M.vis` din/lin/lout), or the old and new text overlap.
- `mix-blend-mode: difference` labels must sit in a layer that has the blend mode itself. A filtered parent isolates them.
- Items that slide under a highlight need `M.FAST` springs, or the highlight row sits empty for a moment.
- Keep the cursor inside the frame at every camera zoom, including during morphs.
- Word estimates from an SRT drift within a cue; put important changes on the first or last word of a cue when you can.
- A clip ends by holding its last state; the composed page holds the last frame if its slot is longer.
