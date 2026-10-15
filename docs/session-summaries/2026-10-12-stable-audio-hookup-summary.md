# Stable Audio hookup

Plan: `docs/plans/2026-10-12-stable-audio-hookup.md`. Mockup: `docs/mockups/2026-10-12-stable-audio-generate.html`.

## Shipped

- `server/core/_internal/audio-generation.ts`: one service for the editor and the CLI. It validates the request (prompt, 0 to 47 s, seed), checks the model folder from `KINOTTA_STABLE_AUDIO_MODEL`, runs one generation at a time (an identical request shares it, a different one is refused), stops the model on abort, and imports the WAV into the project library by content with its prompt, length and seed in the result.
- `runner.generateStableAudio` runs `generate_audio.py` with a ten-minute timeout and an abort signal.
- `POST /api/media/generate`: closing the page mid-run stops the model.
- `kinotta generate-audio --prompt --seconds [--seed] [--out] [--project]`: uses the running editor or starts one headless, prints one JSON line.
- Generate section at the top of the right-rail Sound tab (`SoundGenerate.tsx`): prompt, length, seed, Generate, Cancel with elapsed time, Play, and Add on the selected clip's track (else Music) at the playhead. Works with nothing selected.
- `sound.md` and `SKILL.md`: the command, and how to answer a pinned comment such as "add pulse sound".

## Deviations

- No Discard button: the library has no delete and the sound is already imported. The result row has Play, Add and Done.
- No separate generation cache and no weights probe in the tool check (plan D3, D4 rewritten).
- Pin shortcut (D7) deferred to phase 2.

## Checks

- `tests/core/audio-generation.test.ts`: 15 tests (validation, shared and refused jobs, failure and abort free the slot, empty output, route 400 and 422).
- `tests/core/render-sound-generate-editor.test.ts`: browser test with `SoundGenerate.verify.ts` invariants; the generate route is stubbed, the add path is real.
- `npm run typecheck`: clean.
- Live: `kinotta generate-audio` against `C:/Models/stable-audio-open-1.0` produced a 3 s stereo 44.1 kHz WAV (seed 7), imported it into a temporary project library, and `--out` copied it. Temporary project removed.
