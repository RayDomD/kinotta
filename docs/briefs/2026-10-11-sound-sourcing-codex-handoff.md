# Handoff to Codex: sound sourcing, first run

Written 2026-10-11. The plan is `docs/plans/2026-10-11-sound-sourcing-and-effects.md`; read it in full before anything else. This brief covers the first run only and ends at a gate where the owner is needed.

## Goal to set

Paste this as the goal:

> In the Kinotta repo, on a new branch `feat/sound-sourcing` cut from `main`, fix the two intermittent browser tests, then build phases 1, 4 and 5 of `docs/plans/2026-10-11-sound-sourcing-and-effects.md`. Stop before phase 2. Do not start phases 2, 3 or 6: they wait for the owner's UI decisions. The goal is met when the steps in "Order of work" are committed, the checks in "Done when" pass, and the stop report is written.

## Where things stand

- `main` is at `206adfb`. It holds the free picture layout work and the approved plan.
- Decisions D1 to D4 are recorded in the plan and are settled. Do not reopen them.
- The owner intends to open source this repo. Commit nothing that cannot be redistributed, and never commit model weights.
- `torch`, `diffusers` and `kokoro_onnx` were not installed on the owner's machine when this was written. `faster_whisper` and `onnxruntime` were. Python is 3.14.3. The GPU is an RTX 4060 Laptop with 8 GB.
- `reels/` and `.kinotta-server.json` are untracked on purpose. Leave them alone.

## Order of work

### Step 0. Fix the two intermittent tests

Both pass on `61f577f` (4 of 4 runs) and fail intermittently on `main` (5 of 7 runs of the two files alone).

- `tests/core/render-media-layer.test.ts:43`: after Bring to front, Send to back, Undo and Save, the saved version sometimes has `green` last, expected `red`. Likely cause, unconfirmed: `PictureLayers` now draws every active picture at once, so `getByAltText('red').waitFor()` no longer proves a reorder landed, and Undo or Save races ahead. Find out whether the race is only in the test's waits or also reachable in the editor. Fix the editor if it is; otherwise make the test wait on the real stacking order.
- `tests/core/render-media-library.test.ts:88`: renaming `tone.wav` after `page.goto('about:blank')` stays `EBUSY` for the full 5 seconds. Something holds the file open. Cause unknown.

Done when both files pass 10 runs in a row: `npx vitest run tests/core/render-media-layer.test.ts tests/core/render-media-library.test.ts`. Rebuild the UI first with `npm run build`; these tests serve `dist/web`.

### Step 1. Plan phase 1, bundled sound effects

Follow the plan's phase 1 steps. Source: `heygen-com/hyperframes`, folder `skills/media-use/audio/assets/sfx/` (19 MP3s, `manifest.json`, `CREDITS.md`). Keep the credits file beside the files. The owner chose to bundle these knowing Pixabay's standalone-distribution term (plan, Risks); do not substitute another set.

### Step 2. Plan phase 4, Kokoro voiceover

Follow the plan's phase 4 steps. You may `pip install kokoro-onnx soundfile`. If the install or a first generation fails on Python 3.14, do not work around it with another Python or another model: record what failed and move on.

### Step 3. Plan phase 5, Stable Audio generation

Check first: `python -c "import torch, diffusers"` and that the gated model `stabilityai/stable-audio-open-1.0` downloads. If either fails, do not install Torch and do not attempt Hugging Face login or licence acceptance; those are the owner's. Skip the proof and the script's live test, still write the script, the tool-check entry and the reference section, mark phase 5 as unproven in the plan, and say so in the stop report.

## Stop here

Stop when steps 0 to 3 are finished or blocked. Do not continue into phase 2 (ducking), phase 3 (track EQ), phase 6 (editor surfaces) or phase 7 (beat editing, added to the plan after this brief was first written).

Why: the duck control and the EQ control decide the shape of the data (one strength knob or editable points; free bands or named presets; track or clip). The owner picks these from mockups in a `ui-preview` session with Claude before any of it is built. Do not make mockups, propose the control designs, or add `duck` or `eq` fields, operations or UI in this run, even as a stub.

Also stop early and report, without guessing, if:

- a step needs the owner's account, a licence acceptance or a paid service;
- a fix for step 0 would change how the editor behaves for the owner, beyond removing the race;
- anything would require changing D1 to D4 or a frozen version folder.

### Stop report

End with a message to the owner containing:

1. What shipped per step, with commit hashes.
2. The exact checks run and their results, including the 10-run count for step 0.
3. What was skipped or left unproven, and why.
4. One line: "Waiting on the owner: ui-preview for the duck control and track EQ, then phases 2 and 3."

## Working rules

- Work on `feat/sound-sourcing`. Never commit to `main`. Do not push, open a pull request or merge; the owner does that.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`). One logical change per commit. No AI signature or co-author line.
- Never skip hooks.
- Match the surrounding code's style. No refactors or cleanup outside the step.
- Use the words in `CONTEXT.md` (reel, version, placement, track).
- The skill's rules bind you too: versions are frozen, and the edit list and hand-off files are Kinotta's.
- Keep the plan current: set `status: In Progress`, add a dated Changelog entry for each step, then run `powershell -NoProfile -File docs/plans/build-plans-index.ps1`. Never hand-edit `docs/plans/index.html`.
- No secrets in code or commits.

## Done when

- `npm run typecheck` passes.
- `npm test` passes in full, twice in a row.
- A plan written per `skill/kinotta/reference/sound.md` passes `pieces.py` validation and `kinotta check`.
- The stop report is written.


## Deviations

- 2026-10-11: No branch, commits or other Git writes. The supplied global AGENTS.md agent-loop contract prohibits every Git write and explicitly says a brief cannot lift that rule. Changes remain local for the reviewing session. No commit hashes exist for this run.
- Step 0 fixes a reachable editor measurement problem: Windows Restart Manager identified the FFmpeg mix-overload process holding tone.wav. Its progress advanced for minutes beyond a four-second reel. Bounding output duration removes that stall. HTTP-stream and filter-thread hypotheses were rejected and their changes removed.
- Kokoro installed and imported on Python 3.14.3, but synthesis cannot be proven without owner-supplied model and voices files. The script refuses missing local files and downloads nothing.
- Stable Audio's Torch/Diffusers import check passed, but the gated transformer-weights HEAD request returned HTTP 401. Followed Step 3's explicit skip path: no login, licence acceptance, model download or live-generation test. The script and package check are implemented and generation remains unproven.
- The plan gained owner-authored phase 7 and updated installation notes while this run was in progress. Those edits were preserved. Phase 7 was not implemented.

## Test evidence

### Diagnosis and red tests

- `npm run build`: passed before browser reproduction and again before the final ten-run check.
- `npx vitest run tests/core/render-media-layer.test.ts tests/core/render-media-library.test.ts`: initial run passed. Repetition failed in render-media-library at the five-second rename poll (`expected false to be true`).
- `npx vitest run tests/core/render-media-layer.test.ts` with a 200 ms delay on actual edit POST requests: failed before replacing presence waits (`expected green to be red`). The retained delay exercises that race in the final test.
- `npx vitest run tests/core/media-overload.test.ts`: new concurrent-measurement regression timed out at 15 seconds before the explicit output-duration bound. After the bound: `Test Files 1 passed (1)`, `Tests 3 passed (3)`.
- Each new sound-skill, voice and generate-audio test was run before its implementation and failed because the required artifact was absent. Each passed after implementation.
- New Kokoro and Stable Audio tool checks failed before their entries existed, then passed after implementation.

### Required validation

- `npm run typecheck`: exit 0, `tsc --noEmit`.
- `npx vitest run tests/engine/sound-skill.test.ts tests/engine/voice.test.ts tests/engine/generate-audio.test.ts tests/core/tools.test.ts tests/core/tools-http.test.ts tests/core/media-overload.test.ts`: exit 0, `Test Files 6 passed (6)`, `Tests 17 passed (17)`.
- `pieces.timeline_plan` on the JSON example extracted from `skill/kinotta/reference/sound.md`: passed. Temporary project retained exact pop.mp3 bytes and used that plan with a four-second authored page.
- `node bin/kinotta.mjs check sound-check v1 --project C:/Users/ryand/AppData/Local/Temp/kinotta-sound-check-xf76j5s9`: exit 0, `sound-check v1: no contract issues`.
- `powershell -NoProfile -File docs/plans/build-plans-index.ps1`: exit 0, wrote the dashboard with 51 plans.
- `python -m pip install kokoro-onnx soundfile`: installed kokoro-onnx 0.4.7, soundfile 0.14.0 was already installed. Imports passed. Voice script refused a missing local model with exit 2. No weights downloaded.
- `python -c "import torch, diffusers"`: exit 0. Unauthenticated HEAD for `https://huggingface.co/stabilityai/stable-audio-open-1.0/resolve/main/transformer/diffusion_pytorch_model.safetensors`: HTTP 401 Unauthorized. Live generation skipped.

- Final Step 0 loop: `1..10 | ForEach-Object { npx vitest run tests/core/render-media-layer.test.ts tests/core/render-media-library.test.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }`: exit 0, **10 consecutive runs passed**, each with `Test Files 2 passed (2)` and `Tests 2 passed (2)`. UI rebuilt immediately before this loop. The drawing-order test retains a 200 ms edit-request delay.

- Initial `npm test` with default workers hit five-second timeouts in existing `version-media` and `legacy-media-editing` save tests and the new generate-audio argument test. The new Python CLI tests now have a 20-second timeout because they spawn several processes. Full-suite validation uses `npm test -- --maxWorkers=4 --reporter=verbose` to limit simultaneous tool processes, with no existing-test or project-configuration changes.

- First complete full-suite run: `npm test -- --maxWorkers=4 --reporter=verbose`: exit 0. Output: `Test Files 87 passed (87)`, `Tests 720 passed | 1 skipped (721)`, `Duration 730.78s`. Both pre-existing save tests passed without changes. The earlier failing default-worker run was stopped during its remaining render checks.

- Second consecutive complete full-suite run: `npm test -- --maxWorkers=4 --reporter=verbose`: exit 0. Output: `Test Files 87 passed (87)`, `Tests 720 passed | 1 skipped (721)`, `Duration 692.14s`. The skipped test in both runs is the existing real faster-whisper transcription test.
- Final `npm run typecheck`: exit 0. Diagnostic logging removed and temporary lock-probe script deleted. Read-only `git diff --check`: no whitespace errors.
- Stop report: `docs/session-summaries/2026-10-12-sound-sourcing-summary.md`.
