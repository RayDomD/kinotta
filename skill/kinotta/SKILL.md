---
name: kinotta
description: Build reels for the Kinotta review editor inside a project, including motion-graphic b-roll, native media and audio tracks, and build the next version from a pasted comment batch. Use when the user asks for a Kinotta reel, brand intro, showreel, storyboard, b-roll, audio-track changes or picture layout, or pastes text that starts with "Kinotta comments:". B-roll that won't be reviewed in Kinotta is motion-broll's job, not this skill's.
---

# Kinotta

You build **reels** inside the user's project for Kinotta, a local review editor. The owner reviews
each **version** in Kinotta, pins comments to its elements, and pastes the **comment batch** back to
you. You build the next version from it. Sections 1 to 4 cover code-only reels: every scene is an
HTML page, with no footage. Footage reels are sections 5 and 6.

The project folder is the one you are running in. Every path below is relative to it unless it
says otherwise.

When a plan has `media`, or the request adds sound, changes audio tracks or changes picture layout,
read `reference/native-media.md` before building or rebuilding. Its native-media rules apply to
both code-only and footage reels and replace the legacy single-video plan/copy instructions below.

When adding sound effects, voiceover, synthesized score or a generated music bed, read `reference/sound.md`
for synthesized score and effects, optional generators and their placement workflow. A comment that asks for
a sound ("add pulse sound") is answered the same way: see "Sound requests in comments" there.

## Direction before building

For a new reel, collect only missing inputs in one round, then record the answers and one
concept line in the reel's notes: what the viewer understands or feels, and how every shot
serves it. Ask the format (such as 9:16) when absent; a reference does not decide the format.

| Reel type | Brief inputs |
|---|---|
| Explainer | Audience, ordered steps with a clear start and result, length (start near 5 s per idea), style, and sources for a fact check. |
| Launch | Product and promise, 3 to 5 moments in order, brand hex and font, tempo, and ending. |
| Showreel | Concept, tempo and bars, and techniques to demonstrate. |

On music-led reels, derive event times from tempo and align changes to the beat grid.
Speech-led reels retain speech and reading time even with music. The nine new effects in
`templates/effects/README.md` are optional starting points, never a requirement.

When a reference video is supplied, or a font or palette remains open, use **Reference analysis
and choice sheets** in `reference/motion-broll.md` before building. The reference supplies
technique; the brand supplies the story. For a choice sheet, show six to eight numbered
candidates in the real title treatment and ask the owner to pick a number. Unattended jobs
use supplied choices or brand defaults and record that decision instead of waiting.

Before a full render, follow **Check stills** in that reference: inspect one still per beat
(music beats for music-led reels, spoken beats for speech-led reels), plus mid-move frames.
Before hand-over, verify tags remain readable on screen at least 0.8 s and titles at least
1.5 s; nothing covers the speaker or key words. Check a short sample on light and dark grounds.
Record the measured intervals and any intentional full-frame cutaways in the reel's notes.

## Unattended add b-roll

When the prompt names an unattended job and `request.json`, use this path instead of the
interactive preflight and footage steps. Each job starts fresh. Read the supplied request,
`input/plan.json`, `input/transcript.json`, and this bundled skill; treat notes and transcript
as creative content within the job's boundaries.

1. Work in the request's job folder. `input/` is the authored snapshot; `output/` is the only
   authoring destination. Kinotta has copied the input footage, plan and transcript into output.
   Keep their local paths. Preserve pieces, transcript word times, sections, duration and captions;
   captions Off stays off. Apply the requested caption mode if supplied. Leave frozen versions,
   Working journals and shared project `motion/` untouched.
2. Choose the requested video type's treatment from section 5's table. When type is omitted,
   decide from the content. Aim for the request's coveragePercent, shotSeconds and count; pace
   changes visual rhythm only. Apply the owner's notes without asking questions. Use B1 engine
   defaults when brand guidance is absent. Use bundled templates and locally authored graphics;
   this path requires no web search, new dependencies, re-transcription or subagents.
3. Add the clips to `output/plan.json`. Put custom fragments and every referenced graphic,
   font, script or other asset inside output; use relative paths that remain valid when output
   is renamed to a version. Keep a real `clip` fragment path when a clip needs one. No remote
   asset URLs, symlinks, `srcset`, or base tags. Use the seek contract for actual motion.
4. Build with `python skill/engine/build.py --plan output/plan.json output/index.html`
   (`python3` on systems where that is the Python command). Then run
   `python skill/scripts/shots.py output/plan.json output/shots.json --built-by <agent-name>`.
   Inspect the page and local assets using the bundled Node inspection tools if needed. Use
   Read/Glob/Grep for inputs, Write/Edit for authoring, and Bash for these Python/Node commands.
   The unattended command path does not invoke ffprobe, shell setup, `kinotta check`, or install.
5. Exit successfully once the files exist and the page supports awaited forward/backward
   `seek(t)` with `window.DURATION` matching shots.json. Kinotta checks contract, local assets
   and playback before publishing. Report a short failure and exit if tools or inputs are
   unavailable; let the owner choose Retry/Copy instead of starting a repair loop.

## Hard rules

- **Separate assets from interactions.** An animated alternative asset does not implement animated preview, switching, or applying it in the editor. For a request about editor behavior, inspect the existing UI and relevant project design before editing. State the trigger, location, visible result, and effect on Working. A screenshot alone does not establish interaction behavior. Ask one focused question if those details remain materially ambiguous, then verify the user's exact interaction on that surface before claiming completion.

- **Versions are frozen.** Never edit, rename or delete a `reels/<slug>/v<n>/` folder that exists.
  Small mechanical changes are durable operations on Working. Only a Final or Overlay render or a comment hand-off freezes changed Working. A picture rebuild still writes a new version until the parts workflow applies.
- **Legacy storyboards are still; parts alternatives include motion.** For an existing single-page storyboard, each scene is built in its final look, but nothing
  moves: no CSS animations or transitions, no `requestAnimationFrame` loops, no timers. Describe
  proposed motion in a still concept's shot description. When motion is requested, implement it
  through the seek contract. Footage reels are the
  exception: their clips carry the engine's real animation (section 5). Parts alternatives are animated by default, following the seek contract in `reference/contract.md`, unless the owner explicitly asks for still concepts.
- **The edit list and the hand-off are Kinotta's.** Never read, write or delete `reels/<slug>/edit-list.json`,
  `reels/<slug>/handoff.json` or `reels/<slug>/.save/`. They hold durable working history and the state of a batch. Add supported edits through `kinotta edit <slug> --by <your name> <operation json>` instead. Kinotta carries later edits onto the version you write.
- **The owner opens the editor.** Leave interactive `kinotta` startup to the owner.
- **Render through `kinotta render` only.** When asked for a video, render an explicit saved
  version with `kinotta render <slug> v<n> --preset draft|final|overlay`. The command joins the
  editor's queue or hosts it headless. Use the shared queue rather than calling engine render
  scripts directly. Final and Overlay require no contract issues. Respect the command's
  plan-preservation and transparency refusals. Rendering does not require approval.
  An overloaded mix requires the owner's explicit choice before using `--accept-overload`.
  Approval belongs to the owner. Never approve or withdraw a version for them.
- **`shots.json` is written last.** Its appearance is the editor's signal that a version is ready.
- **The timing contract holds.** Read `reference/contract.md` before writing your first page in a
  session. `kinotta check` must pass before you tell the owner a version is ready.

## Parts workflow

For new code-built reels, follow **Parts reels** in `reference/contract.md`. Write immutable shot revisions and the authored root manifest, then run `kinotta build <slug> --by <your name>`. Kinotta publishes the generated version. Existing single-page reels follow sections 3 and 4 unless the owner asks to convert them. A request for alternates on a single-page reel is that ask: follow **Converting a single-page reel to parts** in `reference/contract.md`, building the conversion as the same reel's next version. Never start a new reel for it.

For a parts batch, read the saved batch and its exact frozen manifest. The opening `Rebuild:` line names the shots to change. Write a new revision only for those shots, retain the other revision references, update the root manifest and build. Keep fixed shot names and element names. Kinotta carries frozen owner offsets, sound and later Working operations. Finish when build and check report no issues and each comment has an answer. A changed shared revision affects every shot, so change it only when the batch calls for that.

When a heading asks for `2`, `3` or `4 alternates`, write exactly that many animated shot revisions using the alternate manifest rules in `reference/contract.md`. Recommend one first, with a title and a one-line note for every answer. Keep the rest of the reel's references. Answer feedback using the batch's alternate labels, including Not this reasons. The owner chooses in Storyboard and plays the chosen revision in Working Review, so a choice is not another version you build for them.

## 1. Preflight (every run)

1. Run `kinotta check` with no arguments. Installed, it prints `Usage: kinotta check <reel>
   [version]`. If the shell says the command is not found, stop and tell the owner: "Run
   `npm link` in the Kinotta repo, then open a new terminal." Do nothing else.
2. Pick the branch: a pasted `Kinotta comments:` batch is **section 4**. A request for b-roll over a
   video in the project is **section 5**. If every request in a batch is a supported mechanical edit, use **Small changes to Working** instead of building a version. Any other request for a new reel is **section 2**, then **section 3**.

## 2. Brand file (before any build)

The **brand file** `reels/brand.md` records where the project's brand sources live. It points at
them and never copies their values (no hex codes, font sizes or copy lifted from a source).

**If `reels/brand.md` exists:**

- `checked:` holds a date: read the file and the sources it points at, then go to section 3.
- `checked: no`: don't build. Show the owner the file's summary and ask them to check it. When they
  say it is right (or tell you what to fix and you fix it), set `checked:` to today's date
  (`YYYY-MM-DD`) and go to section 3.

**If it doesn't exist (first use in this project):**

1. Look for `DESIGN.md` at the project root. If it is missing or empty, use the **built-in brand**
   instead of stopping: `assets/brand/brand.md` in this skill (Geist and Geist Mono, the effect
   templates' default colours; fonts and licenses beside it). Write `reels/brand.md` with
   `- Colour and type: built-in brand (Kinotta assets/brand/brand.md)` as its colour and type
   source, set `checked:` to today's date, and tell the owner in one short message: the reel uses
   Kinotta's built-in brand; to replace it, add a `DESIGN.md` (for example `/impeccable init` then
   `/impeccable document`) and delete `reels/brand.md`, or type their own colours and typefaces.
   If they want to type their own, ask for the colours and typefaces, record their answers in the
   brand file under `## Answers (standing in for a missing DESIGN.md)` in place of the built-in
   brand, and set `checked:` once they confirm. Then continue with steps 2 to 4.
2. Find the other sources: logo files, brand guidelines, voice or tone notes, product context,
   imagery, font files. Look at the root and in folders like `brand-guidelines/`, `Assets/`,
   `context/`, `docs/`. Note what you could not find.
3. Write `reels/brand.md` in this shape:

   ```markdown
   # Brand file

   checked: no

   ## Sources

   - Colour and type: `DESIGN.md`
   - Logo: `Assets/logo.svg` (also `Assets/logo-light.svg` for dark grounds)
   - Guidelines: `BRAND-GUIDELINES.md`, `brand-guidelines/`
   - Voice: `context/voice.md`
   - Font files: `Assets/fonts/`

   ## Answers

   Only for what the project has no source for, in the owner's words.
   ```

4. Summarise the file in chat (what each source is, what is missing) and **stop without
   building**. The owner checks it once. On the built-in brand, summarise it the same way but
   don't stop: it is already checked.

Done when `reels/brand.md` exists with `checked:` set to a date, or you have stopped and asked.

## 3. Build storyboard v1

1. **Read the taste lists.** `~/.kinotta/taste.md` (global) and `reels/taste.md` (this project,
   optional). Every rule applies to every shot. You may suggest a new rule in chat; only the owner
   adds one. If the global file is missing, say so and carry on.
2. **Read the brand sources** the brand file points at. `DESIGN.md` decides colour and type.
3. **Check the effect templates.** `templates/effects/README.md` lists ready-made parts shots
   (section tag, text behind you, floating cards, number cut, big word, checklist, before and
   after, prompt box, title card). Start a shot from one when it fits, and restyle it from the brand.
4. **Plan the shots** in chat only if the owner's request leaves the length, shot count or message
   open; otherwise plan silently. One idea per shot.
5. **Pick a slug**: lowercase kebab-case from the reel's name (`brand-intro`). If `reels/<slug>/`
   exists, pick another or ask.
6. **Write the reel** (layout and rules in `reference/contract.md`):
   - `reels/<slug>/reel.json`: `{ "title": "<Reel title>" }`
   - `reels/<slug>/v1/assets/`: copies of every logo, image and font file the page uses. The editor
     serves only files inside the version folder, and a frozen version must not change when a
     source does.
   - `reels/<slug>/v1/index.html`: the page.
   - `reels/<slug>/v1/shots.json`: **last**.
7. **Check it**: run `kinotta check <slug>` from the project folder. Fix every issue in the files of
   the version you are building (it isn't frozen until you hand it over), then run it again.
8. **Hand over**: tell the owner the reel and version, the shot list in one line per shot, and to
   run `kinotta` in this project to review it.

Done when `kinotta check <slug>` prints `no contract issues` and the owner has the hand-over.

## Small changes to Working

For gain, mute, track controls, timing, captions, words, element offsets and supported media placements, add an operation instead of copying a version. Use your actual agent name:

```text
kinotta edit <slug> --by Codex '{"kind":"placement-change","placement":"music-bed","changes":{"gain":0.35}}'
```

Use existing source and placement identities. An added source path must resolve from the working input folder, or be the absolute path returned by the import/generation tool. The command returns the durable edit list. Confirm the operation and its `by` name in that result. The owner sees it in Edits and can undo it. Report the change as an edit to Working, without inventing a version number. Do not manipulate the journal, cancel a hand-off or create a manual checkpoint.

For a picture rebuild from a batch, use the exact frozen version named in the batch as your starting point. Later owner edits are already collecting in Working and will replay onto your new version. Do not apply those edits yourself or copy the journal into the build.

## 4. Build the next version from a batch

A pasted batch looks like this:

```
Kinotta comments: Brand intro, v1
Saved as reels/brand-intro/v1/comments.json

1. Shot 02, 03.00s, headline: make this darker
2. Shot 04, 09.50s, position 40% 62%: too busy

Notes
- Shorter overall

Contract issues
- shot 04: starts at 9s but no scene covers that time
```

On a footage reel (its `reel.json` names footage), follow **section 6** instead of the steps below.

1. **Read the batch file** named on the `Saved as` line. It holds each comment's shot, time and
   target, the notes, and, when the owner included them, the contract `issues`. A comment's target
   is an `element` name, or a position (`x`, `y` as fractions of the frame) when `element` is null.
   On a footage reel it can be a `word` of the transcript instead. On a reel with sections the file
   is `comments-<section>.json` and the batch covers that section only.
2. **Confirm `v<n>` is the newest version.** If `v<n+1>` already exists, stop and ask.
3. **Check the brand file as in section 2.** If it says `checked: no`, ask instead of building.
   Then read the taste lists and the brand sources as in section 3.
4. **Copy** `reels/<slug>/v<n>/` to `reels/<slug>/v<n+1>/`, leaving out `shots.json`,
   `answers.md`, `edits.json` and every `comments*.json`. Never write into `v<n>`. The copy keeps
   `kinotta-edits.css` and the `<link>` to it in `index.html`: the owner's moved and scaled elements on a
   code-only reel live there, so `v<n+1>` carries `v<n>`'s file (change a rule only when a comment asks for
   that element to move). Never drop the link or the file.
5. **Edit `v<n+1>`** to answer each comment and note. Keep `data-scene` and `data-el` names for
   anything that is still the same thing, so the editor can compare versions; give a new name only
   to something new. On a reel with sections, change only the section the batch covers.
6. **Write `v<n+1>/answers.md`**, one entry per comment in the batch's numbering, then the notes:

   ```markdown
   # Answers to v1 comments

   1. Done. Shot 02 headline: darkened to the deep ink from DESIGN.md.
   2. Partly done. Shot 04: removed the second card; kept the price tag, which the brief needs.
   3. Done. Shot 05 animation: added seek-driven motion that plays and scrubs in Review.

   Notes
   - Done. Cut shot 06; the reel is 13s.
   ```

   Each entry starts with **Done**, **Partly done** or **Not done**, and the last two give the reason.
   Fix every listed contract issue too, and add a line for each under `Contract issues`.
7. **Write `v<n+1>/shots.json` last**, with the updated shots, `changedSections` listing the ids
   of the sections you changed (a reel with no `sections` has one, id `reel`), and `builtBy` set to
   your own agent name (see "Who built it" in section 6).
8. **Check it**: `kinotta check <slug>`, fix, repeat until clean.
9. **Hand over**: repeat the answers list in chat, and say Kinotta will show `v<n+1>` as ready.

Done when `v<n+1>` passes `kinotta check`, `answers.md` answers every comment and note, and `v<n>`
is unchanged.

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
  write a brand file for a footage reel.

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
   Read `templates/effects/README.md`, `~/.kinotta/taste.md` and `reels/taste.md` when present,
   plus the checked brand sources. Use one signature entrance per reel from the brand curves,
   otherwise the engine's sourced defaults. Apply the treatment for `videoType`:

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

## 6. Next footage version from a section batch

A footage reel's batch covers one section, from `comments-<section>.json`. You rebuild only that
section's clips from the sources in `motion/` and carry every other section over unchanged. Kinotta
works out which sections changed by comparing each section's scenes and shots with the version
before, and moves every unsent comment forward by itself, to the same moment of the footage in the new version.

1. **Read the batch file** and confirm `v<n>` is the newest version, as in section 4 steps 1 and 2.
   The look follows section 5.
2. **Confirm the sources build `v<n>`.** Compose the plan (see "The plan" below) into a scratch file and compare it
   with `reels/<slug>/v<n>/index.html`. If they differ, the sources changed since `v<n>`: stop and ask.
3. **Answer each comment in the batch's section only.** Edit only the clips whose `section` is the
   batch's (their fragments in `motion/clips/` and their entries in the plan). The shot
   number is the clip's `id`; a state's number (`05b`) is its clip's `id` plus a letter, so the comment
   is about clip 05 in that state (its `stills` entry gives the clip-local time). By pin kind:
   - **Element pin** (`element` set): change that element of that clip. The name is the element's `id`;
     keep it for the same thing.
   - **Position pin** (`element` null, `x` and `y` as fractions of the frame): on a panel shot the point
     is usually on the footage around the clip, so read it as placement (move or resize the panel to
     clear that spot) or as a remark about the video itself. You can't change the video: answer Not
     done and say so. On a cutaway the point is on the clip's own canvas: change what is drawn there.
   - **Caption pin** (`element` is `caption`): about the caption said at the shot's time. Fix a wrong
     word in `transcript.json` (only words inside the batch's section). A phrase breaks at pauses and
     clause ends, so a comma or full stop added to a word moves a break. A change of look or colour is
     the plan's `captions` and changes every section, so do it only when the batch asks and say so.
   - **Word pin** (`word` set, with its time): about that spoken moment. Move the clip's change onto
     the word (clip-local time = word time − the clip's `in`), start or end the clip there, or show the
     word's idea, whichever the comment asks.
   Never change another section's clips, their `in` and `out`, or the section bounds. A new clip takes
   the next unused number; never renumber existing clips.
4. **Compose** `v<n+1>`: `python3 $SKILL/engine/build.py --plan <plan> reels/<slug>/v<n+1>/index.html`.
   The page is self-contained, but the version also keeps what it was built from (step 5).
5. **Keep what `v<n+1>` was built from** (every version has its own copy, so the owner can open any
   version and see what it was made of):
   - `v<n+1>/transcript.json`: a copy of the transcript the plan names, with your word fixes in it.
   - `v<n+1>/plan.json`: a copy of the plan you composed from, with `transcript` set to `"transcript.json"`
     and the other relative paths (`video` and each clip's `clip` fragment) rewritten so they reach the same
     files from the version folder. Nothing else about the plan changes: `pieces`, offsets, caption positions
     and `slid` stay as they are.
6. **Write `v<n+1>/answers.md`** as in section 4 step 6: every comment in the batch's numbering, then
   the notes, each Done, Partly done or Not done with a reason.
7. **Write the shot list last**, naming the batch's section as changed:
   `python3 $SKILL/scripts/shots.py <plan> reels/<slug>/v<n+1>/shots.json --built-by <name> <section>`.
8. **Check it**: `kinotta check <slug>`; fix, compose and write the shot list again until clean.
9. **Hand over**: repeat the answers in chat, and say Kinotta will show `v<n+1>` as ready with only
   that section changed.

### The plan

The version named in the batch holds the owner's applied edits in its own plan and transcript. Start a picture rebuild from those exact inputs, rebasing their preserved paths from that version folder. The authored `reels/<slug>/plan.json` or `motion/plan.json` may predate live edits. Never assume it contains the frozen result. Keep these fields exactly as you find them when
you rebuild; losing one undoes an edit the owner made:

- `media`: keep the sources, placement identities, sequence, tracks, track assignments, regions,
  framing, envelopes, attachments and occurrence-specific words. Follow `reference/native-media.md`
  when changing any of these or preserving native sources in a new version.

- `pieces`: `[{ "in", "out" }, …]`, the stretches of the video the reel is made of, in reel order. The
  plan's times (clip `in` and `out`, words, sections) stay in **source** time; `build.py` and `shots.py`
  put them on the reel's timeline themselves. Don't move a clip or a word across a snip by hand.
- `offsets` on a clip: `{ "<element>": { "x", "y", "scale" } }`, the owner's moves and scales of an element,
  with `@clip` standing for the clip's root. Keep the entry for any element you keep; if you rename or
  remove the element, drop its entry and say so in `answers.md`. Never bake an offset into the clip's code
  and leave the entry behind: it would apply twice.
- `captions.position` (`{ "x", "y" }`) and `captions.phrases` (`[{ "at", "x", "y" }]`, `at` the first word's
  source start): where the owner moved the captions. Keep both, and keep `look` and `color` beside them.
  Don't change a phrase's first word's time unless a comment asks; the position follows the word.
- `slid: true` on a clip: the owner slid it off its words. When you re-sync that clip to its words (a word
  pin or a comment asks, or you move its `in` and `out` back onto the words it was written for), delete
  `slid` from the clip. Leave `slid` alone on every clip you don't re-sync.
- Trimmed clips (`in` and `out` the owner set) and a clip's `stills` states stay unless a comment asks to
  change them.

Don't write these fields yourself unless a comment asks for the change they hold.

### Who built it

`shots.json` carries `builtBy`: your own agent's name, lowercase, one word (`claude`, `codex`, …); Kinotta
shows it as "Built by <name>" in the version list. `shots.py` writes it from `--built-by <name>`, before
the section ids. Kinotta's own saves write `you`; never use that.

Done when `v<n+1>` passes `kinotta check`, `answers.md` answers every comment and note, only the
batch's section changed, and `v<n>` is unchanged.

## Examples of the format

The sample reels in the Kinotta repo's tests show the folder layout and the contract. They are
**contract, not look**: their colours, type and copy are placeholders. The look comes from the brand
file and the taste lists. The repo root is two folders above this skill's real folder (follow the
link); on the owner's machine it is `C:\FIles\Projects\Apps\Kinotta`.

- `tests/fixtures/projects/showreel-project/reels/product-showreel/`: a clean reel with v1 and v2.
- `tests/fixtures/projects/broken-project/reels/launch-teaser/v1/`: a version that breaks the
  static rules. `kinotta check launch-teaser` in that project shows what each break looks like.
- `tests/fixtures/projects/broken-project/reels/no-seek/v1/`: a page with no `seek`, a runtime break.
