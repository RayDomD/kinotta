---
title: Sound sourcing and effects
date: 2026-10-11
status: Complete
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
  - Stable Audio Open on Python 3.14 was settled on 2026-10-12: the Diffusers route generated a 12-second bed on the RTX 4060 Laptop GPU using the owner's local snapshot. The working install and render proof are recorded under phase 5.
  - Stability AI Community License terms for paid client work: the model card defers to stability.ai/license. The owner checks this before using generated sound commercially.
  - MusicGen as a second generator for music beds: left open by the owner. Stable Audio Open is the only generator for now. Revisit if its beds are poor in phase 5; MusicGen's weights are recalled as non-commercial (CC-BY-NC), unchecked.

## Goal

Ship six independent phases, each usable alone: bundled sound effects, ducking, track EQ, Kokoro voiceover, Stable Audio generation and beat editing. Editor surfaces for the first five are phase 6.

## Approach

HyperFrames runs every effect in one Web Audio graph, live in preview and offline at render. Kinotta mixes with FFmpeg at render and Web Audio in preview and keeps them matched by hand (`audioExpression` against `audioGain`). So only effects with the same behaviour on both sides are added.

- Ducking is written as ordinary `volume` points on the music placement, computed from transcript word times. Volume points already match on both sides, so it needs no new render code and stays editable by hand.
- EQ uses biquad filters, which FFmpeg and Web Audio both derive from the same formulas. Filters are linear, so a track's EQ applied to each of its placements equals EQ on the track's sum; no submix is needed.
- Sourcing lives in the skill: files and scripts the agent runs, placing results as `audio` placements under the existing native-media rules. The approved editor shelf also reads the bundled catalogue and imports exact bytes through the existing media library. The server checks optional packages and caches local beat analysis. Generation stays in local skill scripts, and neither the server nor those generators downloads model weights.
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

Implemented locally on 2026-10-12. Audio selection opens Clip settings in the right sidebar, and the Sound tab follows the selected clip. Detailed duck controls create editable volume points through a `placement-duck` operation, with Undo and Save using the existing edit history. Speech spans are frozen in clip-local time, so reapply after changing speech timing.

- D8: The agent uses `kinotta duck --plan <file> --placement <id> --speech-track <id>` to print an operation without writing files or touching the owner's edit list. Apply it to the agent's working plan through the shared model, then build a new version.
- D9: Amount is 0–24 dB. Attack and release are 0.01–5 seconds. Word gaps up to 0.3 seconds and overlapping ramps share a dip. No overlapping speech preserves existing points. Muted or silent speech does not trigger ducking.

1. `server/core/_internal/media-duck.ts`: a pure function from speech spans (word times joined across short gaps) and a strength to `volume` points for one placement, with attack and release ramps.
2. Expose it to the owner as an edit operation in `edit-model.ts`, and to the agent by the route the open question settles.
3. Tests: points are ordered and inside the placement, silence leaves the bed alone, and a rendered mix dips where preview's `mixAt` dips.

### Phase 3. Track EQ

Implemented locally on 2026-10-12. The Sound sidebar edits the selected clip's entire track, with presets, up to eight editable filters, per-filter enable and track bypass. Undo and Save use the existing edit history. EQ boosts participate in overload detection without normalization or limiting.

- D10: Frequencies are 20–20000 Hz, gain is within ±24 dB and linear Q is 0.1–10. Preview and render both use 48 kHz. Cut-filter Q is converted for Web Audio, and shelves use the matching FFmpeg shelf filters. A settled tone sweep checks all five types, including parameter boundaries, within 0.1 dB above the −80 dB numerical floor.

1. `MediaTrack.eq`: a list of `{ type: highpass | lowpass | peaking | lowshelf | highshelf, frequency, gain?, q? }`, validated in `media-model.ts`, `pieces.py` and `tests/helpers/media-validation.ts`.
2. Render: append the matching FFmpeg filters to `placementSound` in `media-render.ts`, which `mediaMixArgs` shares, so overload detection covers EQ.
3. Preview: `BiquadFilterNode`s after the track gain in `useMediaPlayback.ts`.
4. Test: render a sweep through each filter and compare its response with the Web Audio filter's `getFrequencyResponse` within a stated tolerance.
5. Document `eq` in `reference/native-media.md`.

### Phase 4. Kokoro voiceover

Implemented and live synthesis verified on 2026-10-12 after the owner supplied local v1.0 model and voices files. `af_sarah` generated an 8.11-second, 24 kHz WAV. Offline transcription produced 22 words. Browser playback, word timing, Save and exact source preservation passed in a temporary project. Evidence is in [the Kokoro summary](../session-summaries/2026-10-12-kokoro-summary.md). Transcript text still needs review for names.

1. `skill/kinotta/scripts/voice.py`: text and voice in, WAV out, using `kokoro-onnx`.
2. Add Kokoro to `checkTools()` as optional, with its install hint.
3. Reference section: generate, transcribe the result with the existing `transcript.py` so captions and ducking use real word times, place on a `voice` track.
4. Test the script's argument handling and the tool check entry; generation itself is checked by hand.

### Phase 5. Stable Audio generation (optional tool)

Implemented and live generation verified on 2026-10-12 with the owner's complete local Diffusers snapshot. CUDA half precision produced a 12-second stereo, 44.1 kHz FLOAT WAV. Browser playback, exact-byte Save, a mix without overload and a Draft render at fixed 0.35 gain with fades passed. Downloads were disabled throughout. Evidence and the working install are in [the Stable Audio summary](../session-summaries/2026-10-12-stable-audio-summary.md).

1. Prove one generation on the owner's machine through `diffusers` and record the working install in the reference.
2. `skill/kinotta/scripts/generate_audio.py`: prompt and seconds (at most 47) in, WAV out, half precision on CUDA. The model is a named provider behind one function, so another generator can be added without changing the reference or the callers.
3. Add it to `checkTools()` as optional.
4. Reference section: use it for effects outside the bundled set and for short beds; loop with fades for longer beds; fall back to bundled effects and an owner-supplied track when absent.

### Phase 6. Editor surfaces

Implemented locally on 2026-10-12 after the owner chose the Effects tab. All 19 bundled sounds have search, original-file preview and Add at playhead. Exact bytes enter the reusable project library, and new placements use an Effects/SFX track at 0.35 gain without fades. Undo, Save, readonly versions, retry and a saved Draft render were verified. The owner subsequently authorized a restart, and the live editor loaded all 19 effects and previewed Pop. Evidence is in [the shelf summary](../session-summaries/2026-10-12-sound-effects-shelf-summary.md) and [final validation](../session-summaries/2026-10-12-sound-validation-summary.md).

1. Mockups through `ui-preview` first, after checking `docs/mockups/` for the media library and clip settings.
2. A sound-effects shelf in the media library, and duck and EQ controls in clip settings.

Approved sound controls mockup: [Detailed right sidebar](../mockups/2026-10-12-sound-right-sidebar.html), selected by the owner on 2026-10-12. Selecting an audio clip opens its settings in the right sidebar. The owner opens the Sound tab for the detailed controls, and the sidebar follows the selected audio clip. The panel scrolls independently while the preview and timeline remain visible.

- D5: Detailed duck controls apply to the selected clip. Applying ducking replaces its volume points, with Undo restoring them. Amount, speech track, attack and release remain visible.
- D6: EQ controls apply to the selected clip's entire track. Show presets, editable filters and bypass, with the shared scope stated beside the controls.
- D7: Beat controls live in the same Sound tab. Show beat ticks inside the music clip, emphasize downbeats, and let beat snapping follow the existing timeline Snap switch. Ticks follow trim and loops.

- D12: The owner chose a dedicated Effects tab in Media on 2026-10-12. The [approved shelf mockup](../mockups/2026-10-12-sound-effects-shelf.html) provides search, original-file preview and Add at playhead. Adding copies exact bundled content into the project and places it on an Effects track at 0.35 gain. Detailed controls remain in the right Sound sidebar.

### Phase 7. Beat editing

The owner approved beat markers and controls in the same `ui-preview` session as ducking and EQ on 2026-10-12. Follow the approved mockup and D7 above.

Implemented locally on 2026-10-12. A local Librosa script produces source beat timing, cached by exact content hash in the editor and frozen by a source-beats edit on Save. Timeline ticks follow trim and loops. The Sound sidebar controls detection, visibility, downbeat emphasis and beat snapping, which also follows the existing Snap switch.

- D11: Librosa 0.11.0 with Numba 0.68.0 installed and passed a 120 BPM accented click-track test on Python 3.14.3. Silence returns an empty grid. Downbeats are recurring-accent estimates in a default four-beat meter. The script accepts another meter and an explicit first-downbeat index. The UI labels downbeats as estimates.

1. Detection: a skill script that reads a music file and writes beat times, tempo and downbeats. Choose the library at the start of the phase and prove it on Python 3.14 (`librosa` is the candidate, unverified).
2. Store beats with the music source so they are computed once per file and frozen with a version's copy.
3. Markers: beats drawn as ticks on the music placement's bar in the timeline, following its `in`, `at` and loop.
4. Snapping: beats join the editor's existing snap points (`snapPoints` in `placement-edits.ts`) for cuts, clip edges and sound placements.
5. Skill: `reference/sound.md` tells the agent to place scene changes and effects on beats when a reel is cut to music.
6. Tests: detection on a click track of known tempo, marker positions for a trimmed and a looped placement, and snapping to the nearest beat.

## Risks

- Biquad responses may differ slightly between FFmpeg and Web Audio at extreme `q` or near the band edge. The phase 3 test sets the tolerance and the parameter ranges are narrowed to what passes.
- Generated music loops can have an audible seam. The reference steers long beds to owner-supplied tracks.
- Stable Audio generation passed on Python 3.14 with the working package versions recorded in phase 5. It remains optional, so missing packages or local weights do not block the other features.
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
- Torch 2.11.0+cu128 and diffusers 0.41.0 installed on the owner's machine; CUDA sees the RTX 4060 and `StableAudioPipeline` imports. The gated model download still needs the owner's Hugging Face login.
- Added phase 7, beat editing (detection, markers, snapping), at the owner's request. Beat markers join the duck and EQ controls in the `ui-preview` session.

- Step 0 first run: reproduced the stacking wait race with delayed edit requests. The test now waits on drawing order. Windows Restart Manager identified FFmpeg overload analysis holding tone.wav. A concurrent regression reproduced indefinite padded silence, fixed by bounding measurement output to reel duration. Final validation is in the handoff brief.
- Phase 1 first run: copied the 19 effects, unmodified manifest and credits from HyperFrames b211fc7cb845c6838cbdb1860506c2fda2804787 with Apache-2.0 notice and licence. Added sound.md and cross-engine validation.
- Phase 4 first run: added local-file Kokoro voiceover, optional package detection and reference instructions. kokoro-onnx 0.4.7 and soundfile 0.14.0 install/import passed on Python 3.14.3. Synthesis is unproven because local model and voices files were not supplied.
- Phase 5 first run: added local-only Stable Audio provider script, optional package detection and reference fallback. Torch/diffusers imports passed. The gated transformer weights returned HTTP 401, so live generation is unproven. No login, licence acceptance or model download was attempted.
- First run leaves changes uncommitted under the standing agent-loop git-write prohibition. Phases 2, 3, 6 and 7 remain for the owner-led UI decisions.

### 2026-10-12
- First run validation complete: both intermittent browser tests passed 10 consecutive runs after a UI rebuild. Typecheck passed. The full suite passed twice consecutively with four workers, each with 87 files and 720 tests passed, plus the existing live-transcription skip. Default-worker timing failures and the worker-limit deviation are recorded in the brief.
- The sound reference plan passed pieces.py validation and kinotta check in a temporary project. Stop report written in docs/session-summaries/2026-10-12-sound-sourcing-summary.md. Kokoro synthesis and Stable Audio generation remain unproven at their documented owner gates. Work is local and uncommitted under the standing contract.
- Owner approved detailed sound controls in the existing right sidebar. Selecting an audio clip opens its settings, then the Sound tab exposes clip ducking, track EQ and source beat controls. Saved the approved mockup in docs/mockups/2026-10-12-sound-right-sidebar.html. The sound-effects shelf still needs its own preview.
- Implemented phase 2 and its approved Sound sidebar controls, one phase at a time. Added editable duck points, transcript mapping for trims and loops, a read-only agent command, and Undo/Save/render checks. Track EQ, beats and the effects shelf remain pending. Validation is recorded in docs/session-summaries/2026-10-12-ducking-summary.md.
- Implemented phase 3 and its approved track EQ controls. Both validators enforce the same bounds, preview and render share enabled/bypass behavior, and saved renders preserve the EQ on every clip on the track. Beat editing is next. Validation is recorded in docs/session-summaries/2026-10-12-track-eq-summary.md.
- Implemented phase 7 beat detection, frozen source timing, trimmed/looped timeline markers and snapping. Verified the approved sidebar controls, failure/retry and Save. The responsive check exposed the Sound tab overflowing at 1024 pixels, fixed by wrapping tabs. Validation is recorded in docs/session-summaries/2026-10-12-beats-summary.md. The effects shelf remains to be previewed, and live model generation retains the documented owner gates.
- Owner chose the Effects tab in Media. Saved its approved mockup, implemented phase 6's remaining shelf and verified preview, Add, Undo/Save, exact content reuse, readonly behavior and a saved Draft render. Typecheck, build, 648 unit tests, three targeted browser regressions and three editing checks passed. The live editor restart was blocked by approval review. Kokoro and Stable Audio live generation remain at the documented owner gates.
- Owner supplied the local Kokoro model and voices files. Live synthesis, cached offline transcription, browser audition and saved source/word preservation passed. Phase 4's live proof is complete. Stable Audio still needs the owner's local Diffusers snapshot. The combined test run exposed a native-lane test looking for Redo while Clip was open. The test now opens Edits before checking history, and its isolated rerun passed.
- The complete rerun passed all 99 files and 756 tests, with one existing live-transcription skip, in 823.82 seconds. The owner supplied a complete local Stable Audio Open snapshot. Local CUDA generation, browser playback, exact-byte Save and a Draft render with fades passed. Kokoro's saved Draft render also matched the expected level. Both model gates are now verified. The running editor's catalogue route still returns 404, so it needs an owner restart to load the current server code.
- Final-code repetition of the original two race-prone browser tests passed ten consecutive runs, each with two files and two tests. Consolidated evidence is in [the validation summary](../session-summaries/2026-10-12-sound-validation-summary.md). All implementation and model checks pass. The owner editor restart remains the only live step.
- Owner explicitly authorized the restart. The idle editor restarted and its live Effects tab loaded all 19 entries, searched Pop and previewed its original file without importing anything. Final live verification passed. Plan complete, with work left uncommitted under the standing git-write prohibition.
