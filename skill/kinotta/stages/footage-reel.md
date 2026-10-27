Reads: `../SKILL.md`, the owner's video and brief, section 1 preflight and "Direction before building" in `new-reel.md`, and the references named below. Cross-references to section 3 (slug) are in `new-reel.md`; section 6 step 5 (version inputs) is in `04-next-version.md`.
Does: Build the first footage reel using section 5 below, including transcript, sections, animated clips and checks.
Writes: The reel metadata and transcript, `motion/` sources, and `reels/<slug>/v1` with its input copies and `shots.json` last.
Owner's check: Review v1 as the plan in Kinotta and return comments; requested video files use `kinotta render`.

Paths such as `reference/`, `assets/`, `templates/`, `engine/` and `scripts/` are relative to the skill root, not this stage folder. Numbered section references use the original section numbers: sections 1-3 are in `new-reel.md`, section 4 and section 6 in `04-next-version.md`, and section 5 in `footage-reel.md`. Shared hard rules and "Who built it" are in `../SKILL.md`.

## 5. Footage reels (b-roll over a video)

A **footage reel** is motion-graphic b-roll over one of the project's videos. Its `reel.json` names the
footage, which stays where it is; its transcript is saved with the reel; long reels split into
**sections**. Each clip is built with the motion engine, which is part of this skill:

- `reference/motion-broll.md`: how clips are planned and built (treatment, content rules, style
  defaults, gotchas). `$SKILL` there means this skill's folder. Where it and this section disagree,
  this section wins: v1 is the plan, the owner approves, and requested video files are made
  through `kinotta render`. Build the composed version page for Kinotta rather than separate
  composite or viewer pages.
- `reference/engine-api.md`: how to write a clip, the names a reviewer pins, and composing a plan into
  one page. Read it before writing your first clip.
- `engine/`, `scripts/`, `templates/`: the engine and its tools. The Geist fonts carry their licence
  in `engine/fonts/OFL-Geist.txt`; keep it beside them.
- `examples/opus-aoe2/`: six finished clips, the quality bar.

Rules that differ from code-only reels:

- **v1 is the plan.** Don't show a plan or wait for approval in chat. The owner reviews the plan as v1
  in Kinotta and answers with comments.
- **Clips are animated.** Build each clip with its real motion. Kinotta shows stills of it until the
  Review phase; the animation is there for then.
- **The look:** a `reels/brand.md` with `checked:` set to a date decides colour and type (read its
  sources). Without one, use the engine's style defaults and say so in the hand-over. Don't stop to
  write a brand file for a footage reel; run `/kinotta setup` to set one.

Below, `$SKILL` is this skill's folder. Sources live in a `motion/` folder in the project; only the
built page and the shot list go in the version.

1. **Ask only what the request leaves open**, in one round: which video, what kind of video they are
   making (when `videoType` is not already given), and the density (light,
   medium or heavy, default medium; see `reference/motion-broll.md`). Don't ask for captions: the
   transcript comes from the audio (step 4).
2. **Set up** (first footage reel in the project): `bash $SKILL/scripts/setup.sh ./motion`. Run the
   engine's Node scripts with `NODE_PATH=./motion/node_modules`.
3. **Reel folder.** Pick a slug as in section 3. Write `reels/<slug>/reel.json`:
   `{ "title": "<Reel title>", "footage": "<the video's path from the project root>" }`. Never copy
   or move the video. One exception: Kinotta shows footage in Chrome, which can't play HEVC (H.265,
   common from phones and cameras) or ProRes. Check the codec with `ffprobe`; if it is one of those,
   make an H.264 copy beside it
   (`ffmpeg -i <video> -c:v libx264 -crf 20 -r 30 -pix_fmt yuv420p -c:a aac -movflags +faststart <copy>.mp4`),
   point `footage` at the copy, and say so in the hand-over. The original stays untouched.
4. **Transcript.** By default, from the audio with faster-whisper:
   `python3 $SKILL/scripts/transcript.py --audio <video> reels/<slug>/transcript.json`. It needs
   `pip install faster-whisper`; if it is missing, ask the owner to install it. Only when the owner
   hands you an SRT or VTT, use it instead: `python3 $SKILL/scripts/transcript.py <captions.srt> reels/<slug>/transcript.json`
   (its word times are estimates; the audio's are the model's own).
   Read the transcript before planning, and fix misheard words in `transcript.json` itself (names and
   products most of all, such as "Cloud" for "Cloudinary"), keeping each word's times. The captions and the
   spoken lines show these words. List the corrections in the hand-over.
5. **Inspect the footage**: `python3 $SKILL/scripts/inspect_video.py <video> motion/work`. Look at
   `contact.png`; `video.json` gives the length, and where the speaker is full frame or in a box.
6. **Sections.** Split the video by topic into sections of a few minutes each, contiguous from 0 to
   the video's length. A video under about three minutes is one section. Ids are short kebab-case.
   Read the reel's style (`reels/.kinotta/<slug>/style.json`), treating its `rules` as kept notes and
   `direction` fields (form, look, settings, fonts, music, effects, shots) as the owner's request. When
   missing, use the built-in style that fits the `videoType` (`clean`, `creator`, or `editorial`, default `clean`).
   No style is enforced on every reel: universal checks stay mechanical, and style guidance and checks
   apply only to the chosen style. Old taste files (`~/.kinotta/taste.md` and `reels/taste.md`) stay readable
   as a fallback (migrated into personal and project styles per `style.ts`, never deleted).
   Read `templates/effects/README.md` plus the checked brand sources. Use one signature entrance per reel
   from the brand curves, otherwise the engine's sourced defaults. Apply the treatment for `videoType`:

   | `videoType` | Treatment |
   |---|---|
   | `explainer` | Mostly full-frame cutaways and punch-ins; cover jump cuts. |
   | `interview` | Cut between speakers; show visuals for visual topics; use split layouts. |
   | `tutorial` | Keep the screen primary; emphasize within it using zoom, cursor and 5–8 word callouts. |
   | `demo` | Screen or product first; show the proposition in the first 3 seconds. |
   | `short` | Full frame; hook in the first 3 seconds; text outside the top 14%, bottom 35% and sides 6%. |
   | `lecture` | Alternate talking head with slides or drawing; chunks under about 6 minutes. |
   | `vlog` | Sparse graphics; favor authenticity over polish (opinion, weak evidence). |

   These treatments come from `docs/research/2026-10-20-broll-by-video-type.md` in the repository.
   Density remains the owner's light/medium/heavy choice; motion comes from the brand or B1 defaults.
7. **Plan the clips** with the treatment above and `reference/motion-broll.md` section 4's content
   rules (one change per spoken beat, never invented numbers). Give each clip its own device from
   the templates; never repeat a template in adjacent clips. Show a real photo or logo on the word
   that names it, with its credit. Write `motion/plan.json` directly:

   ```json
   {
     "title": "Founder talk",
     "videoType": "explainer",
     "duration": 312.4,
     "transcript": "../reels/founder-talk/transcript.json",
     "captions": true,
     "sections": [{ "id": "cold-open", "name": "Cold open", "start": 0, "end": 148.2 }],
     "clips": [
       { "id": "01", "title": "Two laptops, one doc", "line": "“picture two people editing …”",
         "in": 0.4, "out": 4.1, "kind": "full", "section": "cold-open",
         "description": "Two laptops slide in; the shared doc pops between them on “doc”." }
     ]
   }
   ```

   `duration` is the video's length. Clip ids are two-digit, in time order, unique across the reel.
   Put each `in` and `out` in a pause between words, not on one: a shot's spoken line is the words
   that start between them, and caption word times are only estimates, so a boundary on a word can
   take a neighbour's word.
   `kind` is `full` (a cutaway) or `panel`. `description` says what the shape does on which words, and
   what is illustrative. `still` (optional, seconds into the clip, default 1) is where the shot's
   still is drawn: a clip opens on an empty canvas while its shape pops in, so put it where the clip
   has settled.
   `stills` (optional) gives a clip that changes state one shot per state, so the owner can see and pin
   each: `"stills": [{ "from": 0, "title": "StudyBuddy" }, { "from": 8.0, "title": "Schema" }]`, where
   `from` is the clip-local second the state begins (its morph), the first at 0. Give a state to each
   settled change, at most one per ~4 s and at most 4 per clip; a short clip keeps one shot and no
   `stills`. Each state's title says what it shows. Its still is 1 s into it; give a state its own
   `still` (seconds into the state) when it settles later. Check each state's still with
   `engine/beats.js` too.
   `transcript` is the transcript's path from the plan. `captions` puts the transcript on the page as
   captions, one scene per phrase with an element named `caption`; preserve an explicit owner choice of Off.
   `true` is the default look, the phrase with the word being said lit in the engine's accent. To change
   it, give `{ "look": "highlight" | "phrase" | "words", "color": "<hex>" }`: `phrase` is the phrase
   alone, `words` shows each word as it is said; `color` is the lit word's colour (the brand file's
   accent when there is one). Phrases break at pauses and clause ends by themselves.
   Author phrase captions at at most 42 characters per line and about 20 characters per second;
   inspect the generated phrases and revise breaks or placement when needed.
   A template clip names `template` and supplies `fill` with copy and source-second `at` times.
   Set `brand.fonts`, `brand.curves` and `brand.tokens` from the checked brand sources; fonts are
   embedded once, before the first still. The engine maps fill times through `pieces`.
8. **Build the clips** using `template` directly, a copied and edited shot folder via `clip`, or an
   engine fragment in `motion/clips/<id>-<name>.html` (`reference/engine-api.md`). Lay them out for
   1920x1080 whatever the video's size, since Kinotta draws every page in that frame; map a speaker box
   from `video.json` to that frame before keeping a panel clear of it. Check stills on the key words
   with `engine/beats.js`, including each clip's `still` time, and fix what is cramped or off-word.
9. **Compose v1**: `python3 $SKILL/engine/build.py --plan motion/plan.json reels/<slug>/v1/index.html`.
10. **Keep what v1 was built from.** Copy the transcript and the plan into the version folder
    (`reels/<slug>/v1/transcript.json` and `plan.json`), as in section 6 step 5.
11. **Write the shot list last**: `python3 $SKILL/scripts/shots.py motion/plan.json reels/<slug>/v1/shots.json`.
    One shot per clip, or per state of a clip with `stills` (`05a`, `05b`, … with `"clip": "05"`),
    with its section, type (`cutaway` or `panel`) and spoken line. Add `builtBy` (your own agent name,
    see "Who built it" in section 6) with `--built-by <name>` after the output path.
12. **Check it**: `kinotta check <slug>`. Fix the sources in `motion/`, compose again, write the shot
    list again, and repeat until it is clean.
13. **Hand over**: the reel, its sections with their clip counts, one line per clip, what is
    illustrative, the words corrected in the transcript, and to run `kinotta` in this project.
    The owner can play the clips in Review and render a saved version. If a video was requested,
    use the render rule above and report the completed file or the command's refusal.

Done when `kinotta check <slug>` prints `no contract issues` and the owner has the hand-over.
