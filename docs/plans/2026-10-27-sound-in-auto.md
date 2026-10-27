---
title: Sound in every first build
date: 2026-10-27
status: Draft
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
  - O1: How does the agent describe the on-screen event per hit? Recommended: a per-hit `sound` object in score input (`kind` plus a few named settings), the agent filling it from the shot it is building, synth deriving the seed from the hit's id.
  - O2: Does music import work end to end today? Tests exist (`tests/core/media-http.test.ts`, `tests/e2e/direction.spec.ts:141`) but were not run on 2026-10-27. Step: run them and try an import in the running editor.

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-27
- Plan created with Intent only. Owner asked for sound by default in Auto and for per-event variation on 2026-10-27.
