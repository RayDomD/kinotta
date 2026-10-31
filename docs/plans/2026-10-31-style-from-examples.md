---
title: Style from your own examples
date: 2026-10-31
status: In Progress
summary: A /kinotta style step reads 2–3 reference videos the owner likes and suggests a readable project style; the owner reads, edits and keeps it on the Direction screen.
spec:
---

## Intent

- Problem: A style can only come from a built-in (`clean`, `creator`, `editorial`, …), from hand-written
  rules, or from the agent reading one reference video during Direction for one reel
  (`skill/kinotta/stages/direction.md`, "Reference analysis and choice sheets"). There is no step that turns
  "videos I like" into a style that every later reel in the project can start from. The talking-head taste was
  rebuilt by hand from a reference reel (`2026-10-20-talking-head-effects.md`).
- Why: Voogle Edit (edit.voogle.app, read 2026-10-31) makes a template from 2–3 videos the user likes and
  writes a style guide the user can read and change. It is the step that makes a creator's first video feel like
  theirs. Kinotta already has every part needed: project styles, reference analysis, and the Direction screen.
- Proposed outcome: The owner gives 2–3 reference videos. The agent measures them, then suggests one named
  project style made of settings, effects and short rules, each rule saying which reference it came from. The
  owner reads it, removes or rewrites lines, and keeps it. Nothing is applied until the owner keeps it.
- Affected: `skill/kinotta/SKILL.md` (step table), new `skill/kinotta/stages/style.md`,
  `skill/kinotta/scripts/` (one measuring script), `server/core/_internal/style.ts` (suggested styles),
  `server/http/_internal/handler.ts`, `web/src/Direction.tsx`, `CONTEXT.md` (if "suggested style" becomes a term).
- Constraints:
  - The agent suggests; only the owner confirms (Product principle 5, D12). The skill never writes a reel's
    `reels/.kinotta/<slug>/style.json` (direction.md).
  - Styles keep the existing `Style` shape and `validateStyle` (`style.ts`). Project styles live in
    `reels/styles/<id>.json`. `taste.md` is now only a migration fallback, so the suggestion is a project
    style, not a new `reels/taste.md`.
  - References give technique, not story or assets: no copied code, copy, fonts or media (direction.md).
    Fonts in a style must be ones the page can embed (brand fonts or Geist, `engine-api.md`).
  - Name what was measured and what was inferred, as reference analysis already requires.
  - Uses the owner's own agent and account. Reference videos stay on disk; only stills and transcripts reach
    the agent.
- Out of scope: Learning a style from the owner's own past reels; sharing styles between projects (user scope
  exists already); new effect templates for devices the references show (record them as "new device" instead).
- Open questions:
  1. Where does the owner confirm: a "Suggested style" card on the Direction screen with Keep and Discard
     (recommended), or a plain file the owner edits and then picks?
  2. Should the suggestion be readable as Markdown as well (a `reels/styles/<id>.md` beside the JSON, generated
     from it), or is the Direction screen's view of rules enough?

## Goal

`/kinotta style <video> <video> [<video>]` produces one suggested project style. The Direction screen shows it
next to the others with its evidence, and the owner keeps it as a project style or discards it.

## Approach

- **Measure, don't guess.** A new `scripts/measure_style.py` (or `inspect_video.py --style`) reports per
  reference:
  - cut rate and median shot length (ffmpeg scene detection);
  - words per minute and pause lengths (faster-whisper, already a dependency);
  - caption density: words on screen at a time and position, read from the contact sheets (inferred);
  - b-roll share: the fraction of time the speaker is off screen (inferred from frames);
  - main colours and loudness.
  The agent then reads the contact sheets and frames, as reference analysis already does.
- **Map to the style's own fields.** Measurements become `settings` (`pace`, `broll`, `captions`), `look`,
  `effects` (devices mapped to existing templates in `templates/effects/README.md`) and one-line `rules`.
  Each rule ends with its source, for example "Hard cuts every 3–5 s (refs 1, 2)". Rules that only one
  reference supports are marked as such.
- **Suggested, not saved.** The skill hands the style to Kinotta as a suggestion (for example
  `kinotta style suggest <file.json>`, or a `reels/styles/.suggested/<id>.json` the server lists). `style.ts`
  validates it with `validateStyle` and lists it with a `suggested` flag. Only the owner's Keep calls
  `saveStyle(projectDir, 'project', …)`.
- **Direction screen.** A suggested style appears in the style list with its rules and evidence, each rule
  removable or editable before Keep. Keeping one makes it a normal project style and leaves Working unchanged.
  Choosing it for a reel stays the existing Direction action.

## Steps

1. Answer the open questions with the owner; draw the Direction card in `docs/mockups/` if Keep and Discard
   are on screen.
2. Add the measuring script with a test on a short synthetic clip (known cuts, known word rate).
3. Write `stages/style.md` (Reads / Does / Writes / Owner's check like the other stages) and add the row to the
   step table in `SKILL.md`.
4. Add the suggested-style store and listing to `style.ts`, with core tests (validation, Keep, Discard, refusal
   of fonts the page cannot embed).
5. Add the HTTP routes and the Direction screen card, with an e2e test of Keep and of editing a rule before
   Keep.
6. Run it on 2–3 real talking-head references and compare the suggested rules with the owner's judgement.

## Risks

- Inferred items (caption look, b-roll share) may be wrong. Mark them as inferred and keep them out of
  `settings` unless the owner keeps them.
- Three references can disagree. Use only rules that most references support, and list the rest as
  "only in ref N".
- The style can come out as a description of another creator's brand. The constraint on technique, not story,
  and the brand file's fonts and colours keep reels on the project's brand.

## Checks to run

- `npm test` (style store, measuring script fixtures), `npm run typecheck`, `npm run test:e2e` (Direction
  card).
- The exact interaction on the Direction screen: a suggested style appears, a rule is edited, Keep saves it to
  `reels/styles/`, and a new reel can pick it.

## Changelog

### 2026-10-31
- Plan created from the Voogle Edit comparison.
- Step 2: `skill/kinotta/scripts/measure_style.py ref… [--transcripts …]` measures each reference from the file:
  frame shape, cuts (FFmpeg scene changes), shots per minute, median shot and loudness, plus words per minute and
  median pause with a transcript. With two or more references it gives each measure's median and spread, so a rule
  one reference alone supports can be marked (`tests/engine/measure-style.test.ts`). Caption style, b-roll share and
  colour stay inferred by the agent from the contact sheets.
- Not done: the stage (step 3) and the suggested-style store and Direction card (steps 4 and 5), which wait on open
  questions 1 and 2.

### Owner decisions, 2026-10-31
- Open question 1: a "Suggested style" card on the Direction screen with Keep and Discard; rules can be edited or
  removed before Keep.
- Step 3: `skill/kinotta/stages/style.md` (in the `SKILL.md` step table; README lists `/kinotta style`):
  measure with `measure_style.py`, look at contact sheets, write one suggestion with rules that end in their
  evidence, record it with `kinotta style suggest`.
- Step 4: `server/core/_internal/suggested-style.ts`: suggestions wait in `reels/styles/.suggested/`, outside the
  style list. Keep saves the edited style as a project style; Discard removes it; an id already in use is refused.
  `kinotta style suggest <file>` and `/api/styles/suggested` (`tests/core/suggested-style.test.ts`).
