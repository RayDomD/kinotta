Reads: `../SKILL.md`, the owner's brief, project brand sources, reel style, and the references named by the selected procedure below.
Does: Collect missing direction, run preflight, check the brand, then build a parts reel or legacy storyboard v1 as applicable. Section 1 routes footage and comment batches to their contracts.
Writes: Reel notes, `reels/brand.md`, and the selected path's manifest/shot revisions or `reels/<slug>/v1` with `shots.json` last.
Owner's check: Confirm an unchecked brand file when requested, then review the first version in Kinotta.

Paths such as `reference/`, `assets/`, `templates/`, `engine/` and `scripts/` are relative to the skill root, not this stage folder. Numbered section references use the original section numbers: sections 1-3 are in `new-reel.md`, section 4 and section 6 in `04-next-version.md`, and section 5 in `footage-reel.md`. Shared hard rules and "Who built it" are in `../SKILL.md`.

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

## Parts workflow

For new code-built reels, follow **Parts reels** in `reference/contract.md`. Write immutable shot revisions and the authored root manifest, then run `kinotta build <slug> --by <your name>`. Kinotta publishes the generated version. Existing single-page reels follow sections 3 and 4 unless the owner asks to convert them. A request for alternates on a single-page reel is that ask: follow **Converting a single-page reel to parts** in `reference/contract.md`, building the conversion as the same reel's next version. Never start a new reel for it.

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

1. **Read the reel's style and rules.** Read `reels/.kinotta/<slug>/style.json` (where `readReelStyle`
   places it) when present. Treat its `rules` as the owner's kept notes for this reel, and treat any
   `direction` in the request (or fields in the style: `form`, `look`, `settings` like pace/broll/captions,
   `fonts`, `music`, `effects`, `shots`) as the owner's request. If the reel has no style file yet, use the
   built-in style from `assets/styles/` that fits the video type (`flat-2d`, `layered-2d` or `filmed-3d` for
   code-built reels, default `flat-2d`; `clean`, `creator` or `editorial` for footage reels, default `clean`).
   No style is enforced on every reel: universal checks stay mechanical; style guidance and checks
   apply only to the chosen style (for example, `reference/motion-craft.md` turns on only for Filmed 3D).
   Old taste files (`~/.kinotta/taste.md` and `reels/taste.md`) stay readable as a fallback (described as
   migrated into personal and project styles per `style.ts`, never deleted), but do not treat them as an
   enforced global rule source.
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

## Examples of the format

The sample reels in the Kinotta repo's tests show the folder layout and the contract. They are
**contract, not look**: their colours, type and copy are placeholders. The look comes from the brand
file and the reel's style (with old taste files migrated into styles). The repo root is two folders above
this skill's real folder (follow the link); on the owner's machine it is `C:\FIles\Projects\Apps\Kinotta`.

- `tests/fixtures/projects/showreel-project/reels/product-showreel/`: a clean reel with v1 and v2.
- `tests/fixtures/projects/broken-project/reels/launch-teaser/v1/`: a version that breaks the
  static rules. `kinotta check launch-teaser` in that project shows what each break looks like.
- `tests/fixtures/projects/broken-project/reels/no-seek/v1/`: a page with no `seek`, a runtime break.
