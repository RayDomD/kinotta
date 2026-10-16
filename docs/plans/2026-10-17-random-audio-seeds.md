---
title: random-audio-seeds
date: 2026-10-17
status: Done
summary: Randomize omitted seeds in every audio generation entry point and make fresh generation the authoring default.
spec:
---

## Intent

- Problem: Kinotta and Raydom contain identical music assets; their notes record the same prompt and seeds. The raw generation script defaults to seed 0.
- Why: New music requests should produce fresh variations without the owner choosing a seed.
- Proposed outcome: Every generation without an explicit seed chooses a random seed and reports it; explicit seeds remain reproducible.
- Affected: The raw audio generation script and the skill's sound guidance. Editor and CLI already randomize omitted seeds.
- Constraints: Preserve explicit seed behavior and existing reel assets. No external sends.
- Out of scope: Replacing existing reel music, redesigning the editor, and bypassing process restrictions.
- Open questions: The earlier session's Python launch was refused with spawn EPERM; the originating restriction remains unconfirmed.

## Goal

Make random seeds the default across generation entry points and verify the local wrapper can start its child process.

## Approach

Use a fresh random seed when the Python script receives no seed. Report it in its completion output. Teach agents to omit the seed for new requests and derive the prompt from the current reel; use explicit seeds to reproduce requested audio. Inspect the reported launch restriction without assuming its cause.

## Steps

1. Save the approved plan on a feature branch.
2. Update the script and authoring guidance.
3. Verify random and explicit seed behavior, run generation tests and type checking, and probe the wrapper launch.
4. Record checks and any unresolved restriction evidence in the summary; regenerate the plans dashboard.

## Risks

A random seed changes the variation, not the musical direction. Reusing a file bypasses generation entirely. Launch permissions can differ between the current session and the session that failed.

## Checks to run

- Raw script runs with lightweight local test modules: omitted seeds differ; explicit seeds are preserved and reported.
- Existing audio generation service and engine tests; typecheck.
- Wrapper invocation with an invalid duration, exercising Python startup without loading the model or changing reel assets.

## Changelog

### 2026-10-17
- Owner approved the random-seed plan and additionally requested investigation of a process-launch restriction.
- Saved before code edits; implementation started on codex/random-audio-seeds.
- Raw script now randomizes omitted seeds and reports the selected seed. Explicit seeds remain supported; sound guidance defaults to fresh generation and reel-specific prompts.
- Checks passed: 16 existing audio tests, typecheck, and an isolated raw-script check demonstrating four distinct omitted seeds and preserved explicit seeds 0 and 314159. The isolated check substitutes audio generation and writing; no model inference was run.
- Owner supplied the failing wrapper error: python failed: spawn EPERM. A current invocation of generateStableAudio reached Python argument validation, demonstrating that child-process launch works here. The earlier environment's refusal was not reproduced or repaired. No permissions were changed and no fallback was added.
