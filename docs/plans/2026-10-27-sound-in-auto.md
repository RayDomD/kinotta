---
title: Sound in every first build
date: 2026-10-27
status: Done
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
3. [x] `sound.md`: event-to-sound table and variation rule. `02-first-build.md`: sound step. `tests/engine/sound-skill.test.ts` updated.
4. [x] Server: default music line when there is no style; core test for the request text.
5. [x] Import check: `npx vitest run tests/core/media-http.test.ts`, the Direction music e2e (`tests/e2e/direction.spec.ts:141`), and one manual MP3 import on the Media panel; record results.
6. [ ] (Skipped: needs the owner's real Auto run and agent quota.) Manual run: an Auto build on a scratch reel; confirm the tracks, listen, run `kinotta check` and a Draft render.

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

## Result

Shipped steps 1 to 5. Step 6 (a real Auto build) was skipped: it needs the owner's agent run and quota.

What shipped:
- `skill/kinotta/scripts/synth.py`: every catalogue recipe takes a `sound` argument (`Sound`: pitch, length, brightness, weight, each 0..1 with 0.5 as the catalogue sound). Pitch scales frequencies by up to half an octave either way, length scales durations and decays (about 0.7 to 1.4 times), brightness and weight blend filtered copies, and every effect is re-normalised to its own peak, so settings never raise the level. Score hits accept `sound: { kind, id, pitch, length, brightness, weight }`; `kind` picks the recipe and the seed comes from a CRC32 of the base seed and the hit's id. Hits without `sound` keep the old positional seed and effect cycle. The committed catalogue WAVs still render byte-identically (checked against all 17).
- `reference/sound.md`: a "Sound in a first build" section with the score input shape, the settings meanings, the event-to-sound table (button click, toggle, key press, typing, text reveal, card landing, notification, chart rise, transition, error) and the rule to vary neighbouring hits. It also says how to apply the printed operations to an authoring plan by hand.
- `stages/02-first-build.md`: a sound step before the build and `shots.json` (renumbering build and exit to 6 and 7). It skips the score for "Music: none" and for the owner's own file, and skips sound if numpy or scipy is missing.
- Server: `DEFAULT_MUSIC_LINE` in `direction.ts`; `briefRequest` (Auto/Direct brief starts via `reels.ts` and `start.ts`) and `brollJobPrompt` (Auto and Copy first builds) carry it when the reel has no style. With a style, its own music line is the only one.
- Import check (O2): see Checks. Imports work today; nothing needed fixing.

Deviations and findings:
- Added to `server/core/_internal/runner.ts`: the unattended Claude run's allowlist (`BROLL_COMMANDS`) now includes `python`/`python3 skill/scripts/synth.py *`. The plan did not list this file, but without it the new sound step cannot run in an Auto build (any other command is refused). Not built beyond that.
- Tests were written before the code for the synth and server steps and fail on `origin/main` as expected (4 synth tests, 1 request test). The synth code was written before the test file in the working tree, so the red state was confirmed by running the tests against `origin/main`'s `synth.py`.
- Not built: no explicit sound step in `stages/new-reel.md` (code-only brief reels). They get the default `Music:` line and the router's pointer to `sound.md`, but not the first-build procedure. Not in the plan's Affected list; record for a follow-up if the owner wants it enforced there.
- Not verified end to end: that an agent follows the new step, the added Auto build time (synth alone is about 1.8 s for a 30 s reel with 10 hits), and the overload check on a render with speech. Headroom is covered by the peak test (at most -4 dBFS across the settings range).
- The agent applies the printed operations to `output/plan.json` by hand, because the unattended path has no `kinotta edit`. A run that skips this leaves the reel silent. Cuts that Kinotta applies afterwards are not re-timed for hits placed on the plan timeline; not examined.
- Environment: the container's apt scipy was broken. Fixed with `pip install --user 'numpy<2'` and a binary `scipy 1.14.1`; the committed catalogue still reproduces byte-for-byte under it.

Checks:
- `npx vitest run tests/engine/sound-skill.test.ts`: 10 passed (5 existing, 5 new).
- `npx vitest run tests/core/reel-style.test.ts`: 10 of 10 after the change, including the 2 new request tests.
- `npx vitest run tests/core/media-http.test.ts`: 2 passed.
- `npx playwright test tests/e2e/direction.spec.ts`: 3 passed, including line 141 (own font and music on Direction).
- Manual import in the running editor (a throwaway Playwright spec, not committed): Media rail > Import `tests/fixtures/legacy-effect.mp3` copied it to `footage/legacy-effect.mp3`, listed it in the library, and Add at playhead created an "Added media" edit and an audio lane "legacy-effect.mp3" with mute and solo. Playback and render of it were not exercised by this check; `media-audio` and the render-sound core tests cover those.
- `npm run typecheck`: clean. `npm run check:docs`: ok.
- `npx vitest run --project unit`: 115 files passed, 1 skipped, 1 failed (`proxy-audio.test.ts` file failed to load under full-suite load; 7 of 7 pass when run alone). 1148 tests passed, 10 skipped.
- `tests/core/agent-jobs.test.ts`: "cancel / timeout / shutdown stops a process tree" fail in this container, identically on a clean `origin/main` export (3 failed, 44 passed). They passed inside the full unit run, so they are environment-flaky.
- `npx playwright test` (full): 171 passed, 23 failed, 3 did not run. All failures are in the known container failures: agent-confirm (3), agent-strip (9), simple-mode (10), playback-stutter (1).

Skipped (needs the owner):
- Step 6: an Auto build on a scratch reel with the real agent; confirm the Music and Sound effects tracks, listen, `kinotta check`, a Draft render, the overload check on the render, and the added build time.
