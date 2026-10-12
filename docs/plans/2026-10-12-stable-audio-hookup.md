---
title: stable-audio-hookup
date: 2026-10-12
status: Done
summary: One generate-audio service behind both an editor Generate panel and a kinotta CLI command, with a configured local model path.
spec: docs/plans/2026-10-11-sound-sourcing-and-effects.md
---

## Intent

- Problem: Stable Audio works only when an agent runs `generate_audio.py` by hand with `--model <path>`. The owner cannot generate sound in the editor, and the tool check reports packages but not whether the weights exist.
- Why: Phase 5 proved local generation (12 s stereo bed, exact-byte Save, Draft render). The remaining gap is reach: the editor and agents should share one path to it.
- Proposed outcome (extended 2026-10-12): From the editor or from the CLI, give a prompt, a length and optionally a seed, and get a WAV in the project library, placed or placeable like any other audio source. Agents and the UI produce identical results for identical inputs.
- Affected: `server/core/_internal` (new generation service, tools check, runner), `server/http/_internal/handler.ts`, `web/src/api`, the Media library UI, `bin`/CLI, `skill/kinotta/reference/sound.md`, `skill/kinotta/scripts/generate_audio.py`.
- Constraints: Local only, no downloads, logins or licence acceptance (D1). Stable Audio stays optional. Output goes through the shared mix (ADR 0005) and saved versions preserve the media (ADR 0003). Generation takes about 25 s on the RTX 4060 plus model load, so it must be a background job with progress, a timeout and cancel, and must not block the editor. Match the beat-detection job pattern (shared in-flight job, atomic cache writes).
- Out of scope: the pin shortcut (phase 2, below), MusicGen or other providers, model download, cloud generation, loop-seam editing, automatic placement on the timeline in the first version.
- Open questions: see Approach decisions.

## Goal

Generate audio from the editor and from the CLI through one server-side service, with the model path configured once.

## Approach

One service, two front doors.

```text
generateAudio(prompt, seconds, seed)        server/core/_internal/audio-generation.ts
  model path: KINOTTA_STABLE_AUDIO_MODEL, else per-user setting
  runner.generateStableAudio()              spawns generate_audio.py (timeout, stderr tail)
  -> WAV into the project library with provenance {prompt, seconds, seed, model revision}

Editor  Sound tab, section at the TOP (approved mockup)    POST /api/media/generate, poll job
Agent   kinotta generate-audio --prompt ... --seconds ... [--seed]  same service
Skill   sound.md: use the command, not the raw script
```

Decisions to settle (recommendation first):

- D1: Model path from `KINOTTA_STABLE_AUDIO_MODEL`, overridable per call. A UI settings field can come later. Alternative: a user settings file now.
- D2: Result lands in the project media library as an audio source, not auto-placed. The user adds it with the existing Add flow. Alternative: auto-place on a Music track at the playhead.
- D3: Identical prompt, length and seed regenerate the same sound, and the library reuses it by content. No separate cache. An identical request while one runs shares it; a different one is refused until it finishes.
- D4: The model folder is checked when a generation starts and the error says to set `KINOTTA_STABLE_AUDIO_MODEL`. The tool check was not extended; the tab uses the existing package check.
- D5: Decided. Mockup `docs/mockups/2026-10-12-stable-audio-generate.html`: a "Generate sound" section at the top of the right-rail Sound tab, usable with nothing selected (result to library or a picked track).
- D6: Comment-driven sound. A pinned comment such as "add pulse sound" already reaches the agent through the `Kinotta comments:` batch. The skill teaches it to prefer a bundled effect, else generate once, place at the comment's time on the right track in the next version, and record prompt, seed and file in `answers.md`.
- D7: Phase 2, deferred: a pin shortcut "Generate sound here" that prefills the section with the pin's time and writes a structured line into the comment.

## Steps

1. Done: mockup chosen and saved.
2. Test-first: generation service (path validation, bounds from `generate_audio.py`, job sharing, timeout, failure and retry) with a fake runner.
3. Runner entry, tool check weights probe, HTTP route and polling API.
4. CLI `generate-audio` over the same service. Update `sound.md`.
5. Editor Generate section at the top of the Sound tab per the mockup, with DOM contracts and a verify companion.
5b. Skill: sound-comment handling in `sound.md` and the comment-batch section of `SKILL.md`.
6. Browser regression, then one live generation on the local model, outside the owner's reel (temporary fixture project).

## Risks

- GPU memory contention if two generations run at once: one job at a time, others queue or are refused.
- A hung model load: needs the timeout that beat detection lacks (review finding F2). Build it here and consider backfilling beats.
- Generated peaks can exceed full scale (seen 1.0156): placement gain handles it, but overload detection should be confirmed on a generated source.
- CRLF/UTF-8 and Windows paths in the model path.

## Checks to run

- Vitest for the service and CLI, targeted browser test for the tab, `npm run typecheck`, `npx playwright test --workers=4`, and one live generation recorded in a session summary.

## Changelog

### 2026-10-12
- Plan drafted from the owner's request: "editor generate button", UI and agent compatible. Awaiting approval.
- Owner chose the right rail, then a section at the top of the Sound tab, and agreed to comment-driven sound. Mockup saved. Pin shortcut deferred to phase 2. Awaiting approval to build.
- Built on `feat/sound-sourcing` at the owner's request: `audio-generation.ts` service (validation, one job at a time, abort, library import by content), `POST /api/media/generate` (client disconnect stops the model), `kinotta generate-audio [--out]`, the Generate section at the top of the Sound tab per the mockup, and sound-request handling in `sound.md`/`SKILL.md`. Deviations from the mockup: no Discard (the library has no delete, and the sound is already in it), so the result row offers Play, Add and Done. Phase 2 (pin shortcut) not built.
- Checks: 15 service/route tests, one browser test with the invariants in `SoundGenerate.verify.ts`, typecheck, and one live CLI generation (3 s, seed 7, stereo 44.1 kHz) in a temporary project. Full suites: see the session summary.
