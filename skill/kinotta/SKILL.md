---
name: kinotta
description: Build reels for the Kinotta review editor inside a project, including motion-graphic b-roll over a video, and build the next version from a pasted comment batch. Use when the user asks for a reel, brand intro, showreel, storyboard or b-roll to review in Kinotta, or pastes text that starts with "Kinotta comments:". B-roll that won't be reviewed in Kinotta is motion-broll's job, not this skill's.
---

# Kinotta

You build **reels** inside the user's project for Kinotta, a local review editor. The owner reviews
each **version** in Kinotta, pins comments to its elements, and pastes the **comment batch** back to
you. You build the next version from it. Sections 1 to 4 cover code-only reels: every scene is an
HTML page, with no footage. Footage reels are sections 5 and 6.

The project folder is the one Claude is running in. Every path below is relative to it unless it
says otherwise.

## Hard rules

- **Versions are frozen.** Never edit, rename or delete a `reels/<slug>/v<n>/` folder that exists.
  Every change is a new `v<n+1>`.
- **Every version is an unanimated storyboard.** Each scene is built in its final look, but nothing
  moves: no CSS animations or transitions, no `requestAnimationFrame` loops, no timers. When the
  owner asks for motion, say that Kinotta can't review motion yet (it comes with the Review phase),
  describe the motion in the shot's description, and keep the page still. Footage reels are the
  exception: their clips carry the engine's real animation (section 5).
- **The owner runs `kinotta`.** Never start it, and never start a server for it.
- **`shots.json` is written last.** Its appearance is the editor's signal that a version is ready.
- **The timing contract holds.** Read `reference/contract.md` before writing your first page in a
  session. `kinotta check` must pass before you tell the owner a version is ready.

## 1. Preflight (every run)

1. Run `kinotta check` with no arguments. Installed, it prints `Usage: kinotta check <reel>
   [version]`. If the shell says the command is not found, stop and tell the owner: "Run
   `npm link` in the Kinotta repo, then open a new terminal." Do nothing else.
2. Pick the branch: a pasted `Kinotta comments:` batch is **section 4**. A request for b-roll over a
   video in the project is **section 5**. Any other request for a new reel is **section 2**, then
   **section 3**.

## 2. Brand file (before any build)

The **brand file** `reels/brand.md` records where the project's brand sources live. It points at
them and never copies their values (no hex codes, font sizes or copy lifted from a source).

**If `reels/brand.md` exists:**

- `checked:` holds a date: read the file and the sources it points at, then go to section 3.
- `checked: no`: don't build. Show the owner the file's summary and ask them to check it. When they
  say it is right (or tell you what to fix and you fix it), set `checked:` to today's date
  (`YYYY-MM-DD`) and go to section 3.

**If it doesn't exist (first use in this project):**

1. Look for `DESIGN.md` at the project root. If it is missing or empty, stop. Tell the owner the
   reel needs a design system for colour and type, and suggest `/impeccable init` then
   `/impeccable document`. Offer one alternative: "proceed without". Only if they choose it, ask
   for the colours and typefaces and record their answers in the brand file under
   `## Answers (standing in for a missing DESIGN.md)`.
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
   building**. The owner checks it once.

Done when `reels/brand.md` exists with `checked:` set to a date, or you have stopped and asked.

## 3. Build storyboard v1

1. **Read the taste lists.** `~/.kinotta/taste.md` (global) and `reels/taste.md` (this project,
   optional). Every rule applies to every shot. You may suggest a new rule in chat; only the owner
   adds one. If the global file is missing, say so and carry on.
2. **Read the brand sources** the brand file points at. `DESIGN.md` decides colour and type.
3. **Plan the shots** in chat only if the owner's request leaves the length, shot count or message
   open; otherwise plan silently. One idea per shot.
4. **Pick a slug**: lowercase kebab-case from the reel's name (`brand-intro`). If `reels/<slug>/`
   exists, pick another or ask.
5. **Write the reel** (layout and rules in `reference/contract.md`):
   - `reels/<slug>/reel.json`: `{ "title": "<Reel title>" }`
   - `reels/<slug>/v1/assets/`: copies of every logo, image and font file the page uses. The editor
     serves only files inside the version folder, and a frozen version must not change when a
     source does.
   - `reels/<slug>/v1/index.html`: the page.
   - `reels/<slug>/v1/shots.json`: **last**.
6. **Check it**: run `kinotta check <slug>` from the project folder. Fix every issue in the files of
   the version you are building (it isn't frozen until you hand it over), then run it again.
7. **Hand over**: tell the owner the reel and version, the shot list in one line per shot, and to
   run `kinotta` in this project to review it.

Done when `kinotta check <slug>` prints `no contract issues` and the owner has the hand-over.

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
   `answers.md` and every `comments*.json`. Never write into `v<n>`.
5. **Edit `v<n+1>`** to answer each comment and note. Keep `data-scene` and `data-el` names for
   anything that is still the same thing, so the editor can compare versions; give a new name only
   to something new. On a reel with sections, change only the section the batch covers.
6. **Write `v<n+1>/answers.md`**, one entry per comment in the batch's numbering, then the notes:

   ```markdown
   # Answers to v1 comments

   1. Done. Shot 02 headline: darkened to the deep ink from DESIGN.md.
   2. Partly done. Shot 04: removed the second card; kept the price tag, which the brief needs.
   3. Not done. Shot 05 animation: Kinotta can't review motion yet, so the description says how it moves.

   Notes
   - Done. Cut shot 06; the reel is 13s.
   ```

   Each entry starts with **Done**, **Partly done** or **Not done**, and the last two give the reason.
   Fix every listed contract issue too, and add a line for each under `Contract issues`.
7. **Write `v<n+1>/shots.json` last**, with the updated shots, and `changedSections` listing the ids
   of the sections you changed (a reel with no `sections` has one, id `reel`).
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
  this section wins: no plan table or approval, no MP4 render, no composite or viewer pages.
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

1. **Ask only what the request leaves open**, in one round: which video and the density (light,
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
   products most of all, such as "Cloud" for "Claude"), keeping each word's times. The captions and the
   spoken lines show these words. List the corrections in the hand-over.
5. **Inspect the footage**: `python3 $SKILL/scripts/inspect_video.py <video> motion/work`. Look at
   `contact.png`; `video.json` gives the length, and where the speaker is full frame or in a box.
6. **Sections.** Split the video by topic into sections of a few minutes each, contiguous from 0 to
   the video's length. A video under about three minutes is one section. Ids are short kebab-case.
7. **Plan the clips** with `reference/motion-broll.md` section 4 (density, cutaway or panel or
   nothing, one change per spoken beat, never invented numbers). Write `motion/plan.json` directly:

   ```json
   {
     "title": "Founder talk",
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
   captions, one scene per phrase with an element named `caption`; turn it on for every footage reel.
   `true` is the default look, the phrase with the word being said lit in the engine's accent. To change
   it, give `{ "look": "highlight" | "phrase" | "words", "color": "<hex>" }`: `phrase` is the phrase
   alone, `words` shows each word as it is said; `color` is the lit word's colour (the brand file's
   accent when there is one). Phrases break at pauses and clause ends by themselves.
8. **Build the clips** in `motion/clips/<id>-<name>.html` (`reference/engine-api.md`). Lay them out for
   1920x1080 whatever the video's size, since Kinotta draws every page in that frame; map a speaker box
   from `video.json` to that frame before keeping a panel clear of it. Check stills on the key words
   with `engine/beats.js`, including each clip's `still` time, and fix what is cramped or off-word.
9. **Compose v1**: `python3 $SKILL/engine/build.py --plan motion/plan.json reels/<slug>/v1/index.html`.
10. **Write the shot list last**: `python3 $SKILL/scripts/shots.py motion/plan.json reels/<slug>/v1/shots.json`.
    One shot per clip, or per state of a clip with `stills` (`05a`, `05b`, … with `"clip": "05"`),
    with its section, type (`cutaway` or `panel`) and spoken line.
11. **Check it**: `kinotta check <slug>`. Fix the sources in `motion/`, compose again, write the shot
    list again, and repeat until it is clean.
12. **Hand over**: the reel, its sections with their clip counts, one line per clip, what is
    illustrative, the words corrected in the transcript, and to run `kinotta` in this project. Say that Kinotta shows stills of the clips
    until the Review phase, and that nothing is rendered to video yet.

Done when `kinotta check <slug>` prints `no contract issues` and the owner has the hand-over.

## 6. Next footage version from a section batch

A footage reel's batch covers one section, from `comments-<section>.json`. You rebuild only that
section's clips from the sources in `motion/` and carry every other section over unchanged. Kinotta
works out which sections changed by comparing each section's scenes and shots with the version
before, and moves every unsent comment forward by itself, to the same moment of the footage in the new version.

1. **Read the batch file** and confirm `v<n>` is the newest version, as in section 4 steps 1 and 2.
   The look follows section 5.
2. **Confirm the sources build `v<n>`.** Compose `motion/plan.json` into a scratch file and compare it
   with `reels/<slug>/v<n>/index.html`. If they differ, the sources changed since `v<n>`: stop and ask.
3. **Answer each comment in the batch's section only.** Edit only the clips whose `section` is the
   batch's (their fragments in `motion/clips/` and their entries in `motion/plan.json`). The shot
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
4. **Compose** `v<n+1>`: `python3 $SKILL/engine/build.py --plan motion/plan.json reels/<slug>/v<n+1>/index.html`.
   Nothing else is copied: the transcript belongs to the reel, and the page is self-contained.
5. **Write `v<n+1>/answers.md`** as in section 4 step 6: every comment in the batch's numbering, then
   the notes, each Done, Partly done or Not done with a reason.
6. **Write the shot list last**, naming the batch's section as changed:
   `python3 $SKILL/scripts/shots.py motion/plan.json reels/<slug>/v<n+1>/shots.json <section>`.
7. **Check it**: `kinotta check <slug>`; fix, compose and write the shot list again until clean.
8. **Hand over**: repeat the answers in chat, and say Kinotta will show `v<n+1>` as ready with only
   that section changed.

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
