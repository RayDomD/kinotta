---
title: Stressed words in captions
date: 2026-10-31
status: Draft
summary: Captions set apart the words the speaker stresses, measured from the voice and editable per word, in every caption look.
spec:
---

## Intent

- Problem: The engine's caption track (`skill/kinotta/engine/build.py`, `caption_scenes`) draws every word
  of a phrase the same way. The only emphasis is the `highlight` look's colour on the word being said now. The
  `captions` effect template (`templates/effects/README.md`) does mark words as `key`, `accent` or filler,
  but it is a separate clip, not the reel's caption track. Stressed-word emphasis exists only as a taste rule
  the agent may follow by hand.
- Why: Voogle Edit (edit.voogle.app, read 2026-10-31) sells "short phrases timed to your voice, with the
  words you stress set apart" as a main feature. Talking-head reels, Simple mode's main case, depend on it.
- Proposed outcome: Each caption phrase can set apart one or two words: bigger, in the accent colour, or both,
  depending on the style. By default the words come from the voice: louder, longer or higher than the words
  around them. The agent can adjust the choice for meaning, and the owner can turn emphasis on or off for any
  word in the editor.
- Affected: `skill/kinotta/engine/build.py` (caption markup and CSS), `skill/kinotta/engine/pieces.py`,
  `skill/kinotta/reference/engine-api.md`, a new script in `skill/kinotta/scripts/` (stress measure),
  `server/core/_internal/edit-model.ts` and `edit-list.ts` (one new operation), the Words lane in
  `web/src/review/_internal/`, `server/core/_internal/style.ts` (a style setting), `CONTEXT.md` (Captions).
- Constraints:
  - The timing contract: emphasis is static markup and CSS, and any motion is computed in `seek(t)`.
  - A plan without emphasis builds exactly the page it builds today (the same rule `caption_style` follows for
    font and background).
  - Emphasis belongs to a placement's captions, like caption text and position (`CONTEXT.md`, Captions). It
    never changes the source transcript or another use of the same source.
  - Phrase breaks stay automatic (T36).
  - The owner's per-word choice outlives the agent's automatic choice and a new transcription (see
    `2026-10-31-keep-manual-fixes.md`).
- Out of scope: New caption looks; emphasis inside the `captions` effect template, which already has its own;
  pitch analysis beyond a simple measure.
- Open questions:
  1. Default emphasis: from the voice (recommended), from meaning chosen by the agent, or off until a style asks
     for it?
  2. How it looks: accent colour only, scale only, or set by the style (`Style.settings` or a caption field)?

## Goal

`captions.emphasis` in a plan marks words by placement and source time, and the engine draws them set apart in
the `highlight`, `phrase` and `words` looks. A `word-emphasis` operation lets the owner change any word in the
Words lane.

## Approach

- **Measure stress.** `scripts/stress.py <audio> <transcript.json>` scores each word by loudness against its
  phrase (RMS over the word's span), length against its expected length, and optionally pitch. It returns the
  top one or two words per phrase above a threshold. This uses the audio and word times already on disk.
- **Plan field.** `captions.emphasis: [{ placement?, at }]` follows the shape of `captions.phrases`
  (`caption_shift`), naming each word by its source start within `CAPTION_AT`. The agent writes it from
  `stress.py`, may adjust it for meaning, and says so in the hand-over.
- **Engine.** In `caption_scenes`, a word in the emphasis list gets `data-kind="key"`. The caption CSS adds
  one rule per look, using `--cap-color` and a `--cap-key-scale` variable. Without the field, no attribute
  and no CSS change.
- **Editor.** A `word-emphasis { at, placement, on }` operation in the edit list, applied in preview and on
  Save, like `word-text`. The Words lane gets a toggle per word (keyboard reachable, WCAG 2.1 AA). It changes
  Working and is undoable.
- **Style.** A caption-emphasis setting (`voice`, `off`) so a style, including one from
  `2026-10-31-style-from-examples.md`, can choose it.

## Steps

1. Ask the owner the two open questions; mock the Words-lane toggle in `docs/mockups/`.
2. Engine: the `emphasis` field and CSS, with engine tests showing an unchanged page without the field.
3. `stress.py` with a fixture: a synthetic clip with one louder word.
4. Skill: `footage-reel.md` and `engine-api.md` describe the field and when to run the script.
5. Core: the `word-emphasis` operation, its validation and carry, with core tests.
6. Editor: the Words-lane toggle, with an e2e test that toggles a word, sees it set apart in the frame, then
   Undo.

## Risks

- Loudness alone over-marks words after a breath or a mic bump. Compare with neighbours, not absolute level,
  and cap at two per phrase.
- Scaled words can push a phrase past `max-width:1180px` and wrap. Test the longest phrase in the fixture.
- Portrait reels (`2026-10-18-portrait-reels.md`) need a narrower caption width, so check emphasis there once
  portrait lands.

## Checks to run

- `npm test`, engine tests, `npm run typecheck`, `npm run test:e2e`.
- On the requested surface: Review's Words lane toggles a word, the frame shows it set apart while it plays,
  and the render matches.

## Changelog

### 2026-10-31
- Plan created from the Voogle Edit comparison.
