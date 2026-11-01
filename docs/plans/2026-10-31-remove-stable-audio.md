---
title: Remove Stable Audio
date: 2026-10-31
status: In Progress
summary: Delete the local Stable Audio generation path; sound comes from synth.py (Opus writes it as code), the effects catalogue, Kokoro and owner files.
spec:
---

## Intent

- Problem: Kinotta carries a local sound-generation path (Stable Audio Open) that needs a gated model, CUDA and Torch, is slow, and has never been proven on a stock machine.
- Why: `synth.py` already writes scores and effects as code from the reel's own cut times (plan 2026-10-23-synth-score-and-effects). The Stable Audio path is now dead weight and a setup burden for an open-source release.
- Proposed outcome: No Stable Audio code, UI, CLI command, tool check or docs remain. Sound comes from `synth.py`, the synthesized catalogue, Kokoro voiceover and owner-supplied files.
- Affected: `server/core/_internal/{audio-generation,runner,tools,types}.ts`, `server/core/{index,model}.ts`, `server/{cli,editor-client}.ts`, `server/http/_internal/handler.ts`, `web/src/api/`, `web/src/review/_internal/{SoundGenerate,SoundSettings,MediaEditor}`, `skill/kinotta/scripts/generate_audio.py`, `skill/kinotta/reference/sound.md`, and their tests.
- Constraints: Sound already generated into a project is an ordinary WAV and keeps working. `faster-whisper`, Kokoro, ducking, EQ and the effects catalogue are unchanged. Old plans and summaries stay as history.
- Out of scope: New sound synthesis (synth.py already covers it), transcription changes, doc history edits.
- Open questions: none. Owner chose "Opus writes the sound as code" on 2026-10-31.

## Goal

No `stable-audio` reference remains outside `docs/`, the Sound panel has no Generate section, and the build, types and tests pass.

## Approach

Delete the generation chain end to end (script, runner function, core service, HTTP route, CLI command, web API call, panel), then remove the props that carried it through `SoundSettings` and `MediaEditor`. Rewrite the Stable Audio sections of `sound.md` so organic beds and ambience point to `synth.py` or an owner-supplied file.

## Steps

1. [x] Server: delete `audio-generation.ts`, `generateStableAudio` and its constants in `runner.ts`, `generateAudio` in `types.ts` and `index.ts`, the route in `handler.ts`, `requestGeneratedAudio` in `editor-client.ts`, and `generate-audio` in `cli.ts`.
2. [x] Tools: remove the `stable-audio` probe, install hint, name and uses in `tools.ts`, and the `ToolId` entries.
3. [x] Web: delete `SoundGenerate.tsx` and its verify file, remove the Generate props from `SoundSettings` and `MediaEditor`, and `generateAudio` and `GeneratedAudio` from the API.
4. [x] Remove `MAX_GENERATED_SECONDS` if nothing else uses it.
5. [x] Skill: delete `generate_audio.py`; rewrite the Stable Audio section and fallback lines in `sound.md`.
6. [x] Tests: delete the three generation tests; trim Stable Audio cases from `tools.test.ts` and `tools-http.test.ts`, and remove the obsolete endpoint case in `null-body-http.test.ts`, and remove deleted prompt-chip interactions from the mixed transport test.
7. [x] Run the checks, record the Result, regenerate the plans dashboard.

## Risks

- A hidden caller of `MAX_GENERATED_SECONDS` or `GeneratedAudio`: typecheck catches it.
- Playwright tests that open the Sound panel may expect the Generate section: the e2e pass catches it.

## Checks to run

- `npm run typecheck`
- `npm test`
- `npm run check:docs`
- `grep -ri "stable.\?audio"` outside `docs/` and `dist/` returns nothing.
- A Playwright check that the Sound panel opens with no Generate section.

## Changelog

### 2026-11-01
- Recorded the final Round 2 triage: all five selected render failures reproduce on parent `6ec159d` and on `3afa554`, including both additional branch runs; they are unrelated to the Stable Audio removal.
- Kept synthesis timeout and transport assertion findings separate; Status remains In Progress pending the remaining suite follow-up and owner's completion decision.

### 2026-10-31
- Plan created and approved.
- Resumed the partial implementation; also removed the web ToolStatus entry and the obsolete null-body endpoint case found during the reference audit.
- Extended the existing Working WAV playback browser test to open Sound and assert that Generate is absent.

## Result

The removal is implemented. Status remains In Progress because the goal requires a green full test suite.

- Removed the generation script, server service/runner/route/CLI, tool probe and types, web API and Generate panel. Existing WAVs remain ordinary media; the Working WAV playback browser check passes.
- Updated sound guidance to use synth.py, catalogue effects, Kokoro or owner-supplied files. Historical docs were retained.
- Passed: typecheck, production build, check:docs, diff whitespace check, and tracked-file reference scans outside docs/dist (including deleted API identifiers, script name, endpoint and Sound prompt controls).
- Passed: the focused Playwright Working sound test (1 test), including opening Sound with no Generate controls and playing a WAV before saving a version.
- Passed: tool, tools HTTP and null-body HTTP tests (13 tests). All 10 sound-skill tests pass with `--testTimeout=30000`.
- Full `npm test`: 173 files passed, 8 failed; 1,467 tests passed, 12 failed, 7 skipped (1,486 total), in 1,528.86 seconds. Two failures were synthesis tests exceeding the default 5-second timeout; the longer-timeout rerun passed.
- The full run exposed one obsolete Generate-prompt section inside the mixed transport test; removed those steps. Its rerun now reaches a viewer-height assertion. Both this assertion and the divider assertion reproduce with identical values in an untouched HEAD snapshot, proving those two failures predate the removal.
- Final Round 2 triage (`.herdr/briefs/2026-11-01-stable-audio-failure-triage-codex.md`): five render failures reproduce with matching messages and assertion locations on the correct parent `6ec159d` and removal commit `3afa554`. They are unrelated to the removal: custom regions (`render-media-regions.test.ts:115`), both retry tests (`render-media-sync.test.ts:190` and `:240`), MediaEditor invariants A6 (`render-media-verify.test.ts:77`), and timeline window (`render-timeline-window.test.ts:89`). Both additional branch runs failed identically; no variation was observed across the three branch runs. The other three of the eight originally unverified tests (media-elements, media-preview, and the stalled-picture test in media-regions) pass on both sides. This does not establish root cause or rule out flakiness in other runs. No unrelated fixes were added.
- Follow-up before Done: address the separately recorded pre-existing render and transport failures and synthesis timeout configuration, then verify the full-suite goal or obtain the owner's decision on how those failures affect completion. Status remains In Progress for that decision. The full suite was not rerun after removing the obsolete mixed-test steps; the affected test was rerun directly. This documentation update uses the final Round 2 evidence and runs no tests.
