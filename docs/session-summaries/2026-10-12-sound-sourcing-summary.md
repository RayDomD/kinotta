# Sound sourcing first-run stop report

Completed locally on 2026-10-12. No branch or commits were created, so there are
no commit hashes. The standing AGENTS.md agent-loop contract prohibits Git writes
and explicitly prevents a brief from overriding that rule. Changes are ready for
the reviewing session. Nothing was pushed, merged or published.

## Delivered by step

- F1, Step 0: The picture test waits on actual drawing order after reorder and Undo, with a retained 200 ms edit-request delay to exercise the race. The editor already blocks Undo while an edit is busy. Windows Restart Manager identified FFmpeg overload analysis holding the WAV open. Its padded output could continue for minutes beyond the reel end. An explicit output-duration bound fixes that editor path, covered by a concurrent-measurement regression. The library test also waits for native analysis to finish before moving its file. Commit: none.
- F2, Step 1 / phase 1: Bundled all 19 HyperFrames effects with their unchanged manifest and credits, an Apache-2.0 licence copy and source notice. Added sound.md, its SKILL.md pointer and cross-engine validation. Upstream revision: b211fc7cb845c6838cbdb1860506c2fda2804787. The owner's D4 source choice is retained. Commit: none.
- F3, Step 2 / phase 4: Added voice.py using local Kokoro model and voices files, argument validation, an optional tool-check entry and the generation/transcription/voice-track workflow. Installed kokoro-onnx 0.4.7 on Python 3.14.3. soundfile 0.14.0 was already installed. Both imports passed. Commit: none.
- F4, Step 3 / phase 5: Added generate_audio.py with a named Stable Audio provider, CUDA half precision, local-only model loading, a 47-second limit, optional package detection and reference fallback instructions. Argument handling passes. Commit: none.

## Checks and results

- A1: `npm run build` passed before browser reproduction and before the final repetition loop.
- A2: `npx vitest run tests/core/render-media-layer.test.ts tests/core/render-media-library.test.ts` passed **10 consecutive runs**, each with 2 files and 2 tests passed. The loop stopped on any failure.
- A3: `npm run typecheck` passed with exit 0.
- A4: `npm test -- --maxWorkers=4 --reporter=verbose` passed twice consecutively. Each run reported **87 files passed, 720 tests passed, 1 skipped**. Durations: 730.78 s and 692.14 s. The skip is the existing real faster-whisper transcription test.
- A5: `npx vitest run tests/engine/sound-skill.test.ts tests/engine/voice.test.ts tests/engine/generate-audio.test.ts tests/core/tools.test.ts tests/core/tools-http.test.ts tests/core/media-overload.test.ts` passed: 6 files, 17 tests.
- A6: The sound.md JSON example passed `pieces.timeline_plan`. `node bin/kinotta.mjs check sound-check v1 --project C:/Users/ryand/AppData/Local/Temp/kinotta-sound-check-xf76j5s9` returned exit 0 and `sound-check v1: no contract issues`. The temporary version contains the exact bundled pop.mp3 bytes.
- A7: `powershell -NoProfile -File docs/plans/build-plans-index.ps1` regenerated the dashboard. The plan remains In Progress for its later phases.

The initial default-worker `npm test` hit five-second timeouts in two existing
save tests and the new generation argument test. That failed run was stopped
during rendering. The new Python CLI tests now allow 20 seconds for their several
process launches. Both existing save tests passed unchanged in the complete
four-worker runs. Reproduction failures, commands and output summaries are in
the handoff brief's Test evidence section.

## Skipped and unproven

- R1: Kokoro synthesis is unproven. No local model and voices files were supplied. The voice script rejected the missing model with exit 2. No model weights were downloaded or added to the repository.
- R2: Stable Audio generation is unproven. `python -c "import torch, diffusers"` passed, but an unauthenticated HEAD request for the gated transformer weights returned HTTP 401. Followed the brief's skip path. No login, licence acceptance, Torch installation or live-generation test was attempted. The tool check reports packages, not model access or GPU readiness.
- R3: Branch creation and commits were omitted under the standing Git-write prohibition. The owner-authored phase 7 and installation notes added to the plan during this run were preserved. Phases 2, 3, 6 and 7 were not implemented. The owner's reels and frozen versions were left untouched.

Waiting on the owner: ui-preview for the duck control and track EQ, then phases 2 and 3.
