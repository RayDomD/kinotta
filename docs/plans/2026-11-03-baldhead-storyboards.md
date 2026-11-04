---
title: Complete the three baldhead storyboards
date: 2026-11-03
status: Done
summary: Recover the failed Direct builds in arcade-app, ink-studio and blank without retrying Claude.
spec:
---

## Intent

- Problem: The three Direct reels contain uncut footage but no storyboard graphics after their agent jobs failed.
- Why: The owner needs to review the same footage in each project's treatment.
- Proposed outcome: Each existing reel has a validated new version with eight animated cutaways and preserved editable footage and captions.
- Affected: The three baldhead reels under Downloads/kinotta-experiment.
- Constraints: Preserve v1, footage pieces, transcript timings and owner journals. Do not retry or delegate. Use the existing job output and Kinotta's publication validator.
- Out of scope: Editor changes, retranscription and final video exports.
- Open questions: The saved job states contain only a generic failure; a quota cause is unconfirmed.

## Goal

Publish and visually verify a populated Storyboard in all three running project servers.

## Approach

Read existing requests and transcript; stage eight synchronized cutaways per project, using project typography and palette where available; compose the pages and score locally; copy completed output to the original jobs and accept through the local server; verify each new version and Storyboard.

## Steps

1. Inspect jobs, project sources and transcript.
2. Author the eight illustrated beats, animations and score in isolated staging folders.
3. Verify composition, seek behavior and local assets.
4. Publish through Kinotta validation and check all three Storyboards.

## Risks

- Project folders are outside the writable workspace; copying requires sandbox escalation.
- Job failure logs may not retain provider diagnostics.

## Checks to run

- Kinotta contract and playback validation at publication.
- `kinotta check` for each new version.
- Visually inspect each Storyboard, plus forward/backward seek determinism.
- Compare v1 hashes before and after.

## Changelog

### 2026-11-03
- Saved recovery plan before authoring.
- Published v2 in all three existing reels through the original job validators. Each contains eight animated cutaways, native speech/music/effects tracks, preserved captions and the complete footage sequence.
- Verified all 24 shot cards in the running Storyboards, contract checks, motion, exact backward-seek frames and mutable scene timing. Verified v1 hashes unchanged.
- The Goal answers the Intent: all three previously empty storyboards now show their project-specific treatment.
