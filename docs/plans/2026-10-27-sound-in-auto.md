---
title: Sound in every first build
date: 2026-10-27
status: In Progress
summary: Auto and Copy first builds write a synthesized score and sound effects onto the audio tracks by default, and each effect is shaped by what is on screen at that moment.
spec:
---

## Intent

- Problem:
  - The synthesized score and effects (`2026-10-23-synth-score-and-effects.md`, Done) only run when a comment or request asks for sound. The first-build contract (`skill/kinotta/stages/02-first-build.md`) never mentions sound, and the "Music: make a score that fits the cut." line reaches the agent only when the reel has a Direction style (`server/core/_internal/reels.ts:85`, `start.ts:175`). Verified on 2026-10-27: the Auto reel `sample-vid` v2 and v3 plans have no audio tracks and no sound placements.
  - Every effect has one fixed recipe and seed (`skill/kinotta/scripts/synth.py`, `synth_click(seed=102)` and so on), and score mode cycles whoosh, impact-bass-1, pop, ping, chime regardless of the picture. A mouse click on a button sounds the same as any other click.
- Why: The owner expects an Auto reel to come with sound, and sound that matches the picture is where native showreels are still ahead of Kinotta's.
- Proposed outcome:
  - A first build (Auto or Copy) writes a score bed and per-hit effects onto the Music and Sound effects tracks, unless Direction says "No music". Placements are ordinary clips the owner can move, trim, mute and comment on.
  - Each hit is chosen and shaped by the on-screen event it lands on: the effect kind plus settings such as pitch, length, brightness and weight, so two clicks on different things sound different. The same plan and seeds still give the same bytes.
  - Owner-imported music (the editor's Media Import and Direction's "Drop your own music") is used instead of the score when chosen, and is checked end to end.
- Affected: `skill/kinotta/stages/02-first-build.md`, `skill/kinotta/reference/sound.md`, `skill/kinotta/scripts/synth.py`, `server/core/_internal/direction.ts` / `reels.ts` / `start.ts` (default music line when there is no style), `tests/engine/sound-skill.test.ts`, synth tests, e2e for import.
- Constraints:
  - Frozen versions never change; old reels keep their audio.
  - Deterministic output (same inputs and seed, same bytes); headroom rules from the synth plan hold (bed near −6 dBFS, effects at −4 dBFS or below) so the overload check passes with speech.
  - The editor needs no Python; the committed catalogue WAVs stay as they are.
  - No enforced style: the default is a sound pass, not a fixed sound palette.
- Out of scope: Pinning comments to sounds (its own plan, `2026-10-23-pin-comments-to-sounds.md`), a sound-design editor UI, Stable Audio, and voiceover.
- Open questions:
  - O1: How does the agent describe the on-screen event per hit? Resolved 2026-10-27, owner approved: a per-hit `sound` object in score input (`kind` plus a few named settings), the agent filling it from the shot it is building, synth deriving the seed from the hit's id.
  - O2: Planned as step 5. Does music import work end to end today? Tests exist (`tests/core/media-http.test.ts`, `tests/e2e/direction.spec.ts:141`) but were not run on 2026-10-27. Step: run them and try an import in the running editor.

## Goal

1. A first build (Auto or Copy), for footage and code-only reels, has a Music track with a score bed and a Sound effects track with per-hit effects, unless Direction says "No music".
2. Two hits of the same kind on different on-screen events produce different audio; the same plan and seeds produce identical bytes.
3. Imported music (Media Import and Direction "Drop your own music") replaces the score when chosen, and plays and renders.
4. The mix passes the overload check with speech on top.

## Approach

**Agent instructions.** `02-first-build.md` gains a sound step that sends the agent to `reference/sound.md` and runs `synth.py score` before `shots.json` is written. With no Direction style, the request still carries "Music: make a score that fits the cut." (sent from `reels.ts` and `start.ts` even when `style` is absent). "No music" and "your own file" keep their current lines.

**Per-hit variation.** Score-input hits (`extract_cuts_and_hits` in `synth.py`) gain an optional `sound` object: `{ "kind": "click", "pitch": 0..1, "length": 0..1, "brightness": 0..1, "weight": 0..1, "id": "<hit id>" }`. Each recipe takes those settings as parameters, with today's values as defaults, and the seed derives from a stable hash of the hit id. The committed catalogue WAVs stay unchanged, and old score calls give the same bytes. `sound.md` gives the agent a short table mapping on-screen events to a kind and settings (button click, toggle, key press, card landing, text reveal, chart rise, transition) and says to vary settings between neighbouring hits.

**Import check.** Run the existing import tests and an import in the running editor; fix only what fails, inside this plan.

## Steps

1. [x] Synth tests (red): default settings reproduce the committed catalogue bytes; two hits with different settings differ; the same input twice is byte-identical; peaks stay at −4 dBFS or below across the settings range.
2. [x] `synth.py`: recipe parameters, `sound` object in hits, seed from hit id.
3. [ ] `sound.md`: event-to-sound table and variation rule. `02-first-build.md`: sound step. `tests/engine/sound-skill.test.ts` updated.
4. [ ] Server: default music line when there is no style; core test for the request text.
5. [ ] Import check: `npx vitest run tests/core/media-http.test.ts`, the Direction music e2e (`tests/e2e/direction.spec.ts:141`), and one manual MP3 import on the Media panel; record results.
6. [ ] Manual run: an Auto build on a scratch reel; confirm the tracks, listen, run `kinotta check` and a Draft render.

## Risks

- Settings can push a recipe past headroom: clamp settings and normalise each effect to its peak.
- A score on every reel may be unwanted for some talking-head reels; Direction's "No music" stays the way out.
- An Auto build takes longer with Python sound; record the added time in the manual run.

## Checks to run

- Synth and sound-skill tests, core request test.
- Import checks from step 5.
- Manual Auto build, `kinotta check`, overload check on the render.
- `npm run typecheck`.

## Changelog

### 2026-10-27
- Plan created with Intent only. Owner asked for sound by default in Auto and for per-event variation on 2026-10-27.
- Owner approved the Intent and its recommended answers; Goal, Approach, Steps, Risks and Checks written. Status Approved.
