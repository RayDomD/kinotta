---
title: Direct edits in Kinotta
date: 2026-10-04
status: Draft
summary: Let the owner make mechanical fixes (caption words, clip in/out, element position) directly in Kinotta, applied by a script into the next version. Intent only; to be grilled after T25.
spec:
---

## Intent

- Problem: Every change goes through a comment and a Claude round, even a mechanical one the owner could do
  faster: a misheard caption word, a clip that should start half a second later, a badge that should sit 40 px
  lower. Kinotta is a reviewer by design (product principle 5, K12); no planned phase lets the owner move
  elements, edit captions or move timing. The Review phase only plans playback, scrubbing and "trimming".
- Why: The owner asked for it on 2026-10-04 after the sample loop. Mechanical fixes are where a round with
  Claude costs most for the least judgement.
- Proposed outcome: The owner makes mechanical changes in Kinotta, they land in a new frozen version without a
  Claude round, and comments stay for anything that needs judgement.
- Affected: the editor (new edit affordances), core (an edit list saved like a batch), the skill's scripts
  (applying edits to `plan.json`, `transcript.json`, clip positions), the timing contract and versioning rules.
- Constraints: Versions stay frozen; an edit makes the next version, never changes the current one. The sources
  in `motion/` stay the single truth: an edit must write back to them, or the next Claude build loses it.
  Mechanical only: no free-form design tools.
- Out of scope: a general-purpose video editor; colour grading; MP4 render.
- Open questions:
  - Which edits: caption text, caption breaks, clip in/out, element position, element size, text in a clip?
  - Who applies them: a script run by Kinotta, or a script Claude runs on the next batch?
  - Element positions live in each clip's code. Do clips expose positions as data, and how?
  - Does an edit version need a hand-over, answers or changed-section marks like a batch version?
  - Where does this sit: its own phase, or part of Review?

Recommended start: `/grill-with-docs` on this Intent once T25 is done (a founding decision changes, so settle it
before building).

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-04
- Intent recorded at the owner's request; T25 goes first.
