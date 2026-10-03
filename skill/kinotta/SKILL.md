---
name: kinotta
description: Build reels for the Kinotta review editor inside a project, including motion-graphic b-roll over a video, and build the next version from a pasted comment batch. Use when the user asks for a reel, brand intro, showreel, storyboard or b-roll to review in Kinotta, or pastes text that starts with "Kinotta comments:". B-roll that won't be reviewed in Kinotta is motion-broll's job, not this skill's.
---

# Kinotta

You build **reels** inside the user's project for Kinotta, a local review editor. The owner reviews
each **version** in Kinotta, pins comments to its elements, and pastes the **comment batch** back to
you. You build the next version from it. Sections 1 to 4 cover code-only reels: every scene is an
HTML page, with no footage. Footage reels are section 5.

The project folder is the one Claude is running in. Every path below is relative to it unless it
says otherwise.

## Hard rules

- **Versions are frozen.** Never edit, rename or delete a `reels/<slug>/v<n>/` folder that exists.
  Every change is a new `v<n+1>`.
- **Every version is an unanimated storyboard.** Each scene is built in its final look, but nothing
  moves: no CSS animations or transitions, no `requestAnimationFrame` loops, no timers. When the
  owner asks for motion, say that Kinotta can't review motion yet (it comes with the Review phase),
  describe the motion in the shot's description, and keep the page still.
- **The owner runs `kinotta`.** Never start it, and never start a server for it.
- **`shots.json` is written last.** Its appearance is the editor's signal that a version is ready.
- **The timing contract holds.** Read `reference/contract.md` before writing your first page in a
  session. `kinotta check` must pass before you tell the owner a version is ready.

## 1. Preflight (every run)

1. Run `kinotta check` with no arguments. Installed, it prints `Usage: kinotta check <reel>
   [version]`. If the shell says the command is not found, stop and tell the owner: "Run
   `npm link` in the Kinotta repo, then open a new terminal." Do nothing else.
2. Pick the branch: a pasted `Kinotta comments:` batch is **section 4**. A request for a new reel
   is **section 2**, then **section 3**.

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

A footage reel is motion-graphic b-roll over one of the project's videos; its `reel.json` names the
footage. Its clips are built with the motion engine, which is part of this skill:

- `reference/motion-broll.md`: how clips are planned and built (creative direction, content rules,
  style defaults, gotchas). `$SKILL` there means this skill's folder.
- `reference/engine-api.md`: how to write a clip. Read it before writing your first clip.
- `engine/`, `scripts/`, `templates/`: the engine and its tools. The Geist fonts carry their licence
  in `engine/fonts/OFL-Geist.txt`; keep it beside them.
- `examples/opus-aoe2/`: six finished clips, the quality bar.

The rules for turning clips into a Kinotta version (transcript, sections, shot list, one composed
page) are not written yet. Until they are, tell the owner that footage reels can't be built for
Kinotta yet, and don't build one.

## Examples of the format

The sample reels in the Kinotta repo's tests show the folder layout and the contract. They are
**contract, not look**: their colours, type and copy are placeholders. The look comes from the brand
file and the taste lists. The repo root is two folders above this skill's real folder (follow the
link); on the owner's machine it is `C:\FIles\Projects\Apps\Kinotta`.

- `tests/fixtures/projects/showreel-project/reels/product-showreel/`: a clean reel with v1 and v2.
- `tests/fixtures/projects/broken-project/reels/launch-teaser/v1/`: a version that breaks the
  static rules. `kinotta check launch-teaser` in that project shows what each break looks like.
- `tests/fixtures/projects/broken-project/reels/no-seek/v1/`: a page with no `seek`, a runtime break.
