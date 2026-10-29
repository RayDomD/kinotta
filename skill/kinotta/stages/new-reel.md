Reads: `../SKILL.md`, the owner's brief, project brand sources, reel style, and the references named by the selected procedure below.
Does: Collect missing direction, run preflight, check the brand, then build a parts reel or legacy storyboard v1 as applicable. Section 1 routes footage and comment batches to their contracts.
Writes: Reel notes, `reels/brand.md`, and the selected path's manifest/shot revisions or `reels/<slug>/v1` with `shots.json` last.
Owner's check: Confirm an unchecked brand file when requested, then review the first version in Kinotta.

Paths such as `reference/`, `assets/`, `templates/`, `engine/` and `scripts/` are relative to the skill root, not this stage folder. Numbered section references use the original section numbers: sections 1-3 are in `new-reel.md`, section 4 and section 6 in `04-next-version.md`, and section 5 in `footage-reel.md`. Shared hard rules and "Who built it" are in `../SKILL.md`.

Follow [direction.md](direction.md) for direction before building and [check.md](check.md) for stills and readability.

## Parts workflow

For new code-built reels, follow **Parts reels** in `reference/contract.md`. Write immutable shot revisions and the authored root manifest, then run `kinotta build <slug> --by <your name>`. Kinotta publishes the generated version. When no effect template fits a shot, start it from `examples/still-shot/r1/` (see Examples of the format). Existing single-page reels follow sections 3 and 4 unless the owner asks to convert them. A request for alternates on a single-page reel is that ask: follow **Converting a single-page reel to parts** in `reference/contract.md`, building the conversion as the same reel's next version. Never start a new reel for it.

## 1. Preflight (every run)

1. Run `kinotta check` with no arguments. Installed, it prints `Usage: kinotta check <reel>
   [version]`. If the shell says the command is not found, stop and tell the owner: "Run
   `npm link` in the Kinotta repo, then open a new terminal." Do nothing else.
2. Pick the branch: a pasted `Kinotta comments:` batch is **section 4**. A request for b-roll over a
   video in the project is **section 5**. If every request in a batch is a supported mechanical edit, use **Small changes to Working** instead of building a version. Any other request for a new reel is **section 2**, then **section 3**.

## 2. Brand file (before any build)

Follow [00-setup.md](00-setup.md) for the brand file.

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

- `examples/still-shot/r1/` in this skill: the bare shape of one parts shot revision (`shot.html`, `shot.css`, `shot.js`,
  one scene root and one named element, no size, position, colour or motion). Copy it to
  `reels/<slug>/shots/<name>/r1/`, rename the scene in all three files, then design the shot. The fixtures below
  are single-page reels (contract 1); none is a parts reel.
- `tests/fixtures/projects/showreel-project/reels/product-showreel/`: a clean reel with v1 and v2.
- `tests/fixtures/projects/broken-project/reels/launch-teaser/v1/`: a version that breaks the
  static rules. `kinotta check launch-teaser` in that project shows what each break looks like.
- `tests/fixtures/projects/broken-project/reels/no-seek/v1/`: a page with no `seek`, a runtime break.
