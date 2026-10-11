---
title: Sound sourcing and effects
date: 2026-10-11
status: Approved
summary: Bundled sound effects, ducking, track EQ, Kokoro voiceover and optional Stable Audio generation, with preview matching render.
spec:
---

## Intent

- Problem: A reel has no sound unless the owner supplies files, and the mix has only gain, fades and volume points. Music under speech has to be levelled by hand.
- Why: HyperFrames ships sound effects, music, voiceover and an effects chain. Kinotta already plays and renders tracks, so the missing part is sourcing the sound and shaping it.
- Proposed outcome: An agent or the owner can add sound effects, a music bed and narration to a reel, music sits under speech, a track can be equalised, and preview still matches the render.
- Affected: `skill/kinotta/` (assets, scripts, references, SKILL.md), `server/core/_internal/` (media model, render, audio, tools check, edit model), `skill/kinotta/engine/pieces.py`, `web/src/review/_internal/` (playback, clip settings, media library), tests.
- Constraints: Versions are frozen. Sources are preserved as exact bytes per version. The mix is never normalized or limited (AM38). Preview and render must agree. Kinotta works with none of the optional tools installed. Network calls stay in one service layer; this plan adds none to the server.
- Open source: the owner intends to open source Kinotta (the GitHub repo is already public, with no licence file). Everything committed must be redistributable. Model weights are never committed or downloaded by Kinotta; a user fetches them under the model's own terms.
- Out of scope: HeyGen catalog access. Compressor, limiter, gate, reverb, delay, chorus, saturation and submix buses. Moving the render mix into the headless browser. Kinotta installing Torch or models itself.
- Open questions:
  - Stable Audio Open on Python 3.14: neither `stable-audio-tools` nor the `diffusers` route has been installed or run on the owner's machine (RTX 4060 Laptop, 8 GB video memory, 16 GB RAM). Phase 5 starts by proving one generation.
  - Stability AI Community License terms for paid client work: the model card defers to stability.ai/license. The owner checks this before using generated sound commercially.
  - MusicGen as a second generator for music beds: left open by the owner. Stable Audio Open is the only generator for now. Revisit if its beds are poor in phase 5; MusicGen's weights are recalled as non-commercial (CC-BY-NC), unchecked.
  - Whether the agent's duck is a skill script or a `kinotta` command (phase 2 decides; the skill may not touch the edit list).

## Goal

Ship five independent phases, each usable alone: bundled sound effects, ducking, track EQ, Kokoro voiceover, Stable Audio generation. Editor surfaces for them come last.

## Approach

HyperFrames runs every effect in one Web Audio graph, live in preview and offline at render. Kinotta mixes with FFmpeg at render and Web Audio in preview and keeps them matched by hand (`audioExpression` against `audioGain`). So only effects with the same behaviour on both sides are added.

- Ducking is written as ordinary `volume` points on the music placement, computed from transcript word times. Volume points already match on both sides, so it needs no new render code and stays editable by hand.
- EQ uses biquad filters, which FFmpeg and Web Audio both derive from the same formulas. Filters are linear, so a track's EQ applied to each of its placements equals EQ on the track's sum; no submix is needed.
- Sourcing lives in the skill: files and scripts the agent runs, placing results as `audio` placements under the existing native-media rules. The server gains only tool-check entries.
- Generation tools are optional. Present, the skill uses them; absent, it uses bundled effects and asks the owner for a music file.

Decisions taken with the owner on 2026-10-11:

- D1: Local generation on Torch, with Stable Audio Open as an optional tool, never a requirement.
- D2: Ducking and EQ only. No compressor or limiter.
- D3: Kokoro voiceover is in scope.
- D4: Bundle HyperFrames' 19 Pixabay effects with their credits file; no licence check requested.

## Steps

### Phase 1. Bundled sound effects (skill only)

1. Copy the 19 MP3s, `manifest.json` and `CREDITS.md` from HyperFrames `skills/media-use/audio/assets/sfx/` into `skill/kinotta/assets/sfx/`, with an Apache-2.0 notice for the manifest (D4 of the grilling log requires notices on copied material).
2. Write `skill/kinotta/reference/sound.md`: choose an effect by manifest description, copy it into the project, place it as an `audio` placement on an `sfx` track at 0.35 gain, time it from the manifest duration (a riser starts its own length before the hit), ask the owner once per reel before adding sound.
3. Point SKILL.md at the reference.
4. Test in `tests/engine/`: every manifest entry has its file, and a plan built per the reference passes `pieces.py` validation.

### Phase 2. Ducking

1. `server/core/_internal/media-duck.ts`: a pure function from speech spans (word times joined across short gaps) and a strength to `volume` points for one placement, with attack and release ramps.
2. Expose it to the owner as an edit operation in `edit-model.ts`, and to the agent by the route the open question settles.
3. Tests: points are ordered and inside the placement, silence leaves the bed alone, and a rendered mix dips where preview's `mixAt` dips.

### Phase 3. Track EQ

1. `MediaTrack.eq`: a list of `{ type: highpass | lowpass | peaking | lowshelf | highshelf, frequency, gain?, q? }`, validated in `media-model.ts`, `pieces.py` and `tests/helpers/media-validation.ts`.
2. Render: append the matching FFmpeg filters to `placementSound` in `media-render.ts`, which `mediaMixArgs` shares, so overload detection covers EQ.
3. Preview: `BiquadFilterNode`s after the track gain in `useMediaPlayback.ts`.
4. Test: render a sweep through each filter and compare its response with the Web Audio filter's `getFrequencyResponse` within a stated tolerance.
5. Document `eq` in `reference/native-media.md`.

### Phase 4. Kokoro voiceover

1. `skill/kinotta/scripts/voice.py`: text and voice in, WAV out, using `kokoro-onnx`.
2. Add Kokoro to `checkTools()` as optional, with its install hint.
3. Reference section: generate, transcribe the result with the existing `transcript.py` so captions and ducking use real word times, place on a `voice` track.
4. Test the script's argument handling and the tool check entry; generation itself is checked by hand.

### Phase 5. Stable Audio generation (optional tool)

1. Prove one generation on the owner's machine through `diffusers` and record the working install in the reference.
2. `skill/kinotta/scripts/generate_audio.py`: prompt and seconds (at most 47) in, WAV out, half precision on CUDA. The model is a named provider behind one function, so another generator can be added without changing the reference or the callers.
3. Add it to `checkTools()` as optional.
4. Reference section: use it for effects outside the bundled set and for short beds; loop with fades for longer beds; fall back to bundled effects and an owner-supplied track when absent.

### Phase 6. Editor surfaces

1. Mockups through `ui-preview` first, after checking `docs/mockups/` for the media library and clip settings.
2. A sound-effects shelf in the media library, and duck and EQ controls in clip settings.

## Risks

- Biquad responses may differ slightly between FFmpeg and Web Audio at extreme `q` or near the band edge. The phase 3 test sets the tolerance and the parameter ranges are narrowed to what passes.
- Generated music loops can have an audible seam. The reference steers long beds to owner-supplied tracks.
- Stable Audio may not install on Python 3.14. Phase 5 is last and optional so nothing else waits on it.
- The repo grows by about 1.3 MB of effects on a 9.7 MB clone.
- D4 conflicts with the open-source constraint. Pixabay's licence summary (read 2026-10-11) says: "You cannot sell or distribute Content (either in digital or physical form) on a Standalone basis", where standalone means no creative effort applied. Unmodified MP3s in a public repo fit that description. The owner chose to keep D4 for now and accept this; a CC0 set is the replacement if it is revisited before a public release.
- Unrelated uncommitted work sits on `codex/review-merge-followup` in files phases 2 and 3 touch. Branch only once that work is committed.

## Checks to run

- `npm run typecheck`
- `npm test`
- `npm run test:e2e` for phase 6
- `kinotta check` and a Draft render of a reel built with `reference/sound.md`, comparing the render's peaks with preview for ducking and EQ.

## Changelog

### 2026-10-11
- Plan created. D1 to D4 decided with the owner.
- MusicGen left as an open question; Stable Audio Open stays the only generator.
- Added the open-source constraint and a provider seam in phase 5. Recorded that D4 conflicts with Pixabay's standalone-distribution term; phase 1 waits on the owner.
- Owner kept D4 for now. Phase 1 is unblocked.
