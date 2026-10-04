---
title: Review and Edit phase (direct edits)
date: 2026-10-04
status: Approved
summary: Kinotta becomes an AI-agnostic editor. Drop a video, cut, fix and re-time words, move captions and elements, and Save a new version with no agent; an agent stays optional for building motion graphics. Intent grilled (E1 to E20); next is /to-spec.
spec:
---

## Intent

- Problem: Every change goes through a comment and an agent round, even one the owner could do in seconds:
  a misheard caption word, a stumble to cut, a clip that should start half a second later, a badge 40 px
  lower. Kinotta can't start a reel either: an agent has to create every one. Kinotta is a reviewer by design
  (product principle 5, K12), and the planned Review phase only adds playback and scrubbing.
- Why: The owner asked for it on 2026-10-04 after the sample loop. The aim is no AI in the loop for changes:
  Kinotta is usable for plain editing on its own, with an agent as an option for building.
- Proposed outcome: The owner drops a video into Kinotta, cuts it, fixes and re-times the words, moves
  captions and elements, and saves a new frozen version, with no agent. When they want motion graphics, an
  agent builds them from the same sources, and the comment loop works as today.
- Affected: the editor (a Review and Edit surface: player, timeline, edit list, new-reel flow), core (edit
  list, pieces and source-time mapping, Save, carry-forward remapping, per-version transcript and plan), the
  skill's scripts (run by Kinotta to build; plan fields for pieces, offsets and caption position), the timing
  contract, CONTEXT.md, PRODUCT.md, ADR 0002.
- Constraints: Versions stay frozen; a Save makes the next version. The sources in `motion/` stay the single
  truth: Save writes to them and rebuilds, so an agent's next build keeps every edit. The project's video is
  never altered. Kinotta calls no AI service; transcription is local. Formats and wording name no agent.
- Out of scope: colour grading and the footage track of takes (split off from Review), MP4 render, editing
  scene timing on code-only reels, packaging and testing agents other than Claude, re-breaking caption phrases.
- Open questions: none. Resolved in a grilling round on 2026-10-05, decisions E1 to E20 in
  `docs/2026-09-30-grilling-decisions.md`. Look: `docs/mockups/2026-10-05-review-edit.html`.

Next: `/to-spec` for the phase (it spans several sessions), then Goal and Approach here.

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-04
- Intent recorded at the owner's request; T25 goes first.

### 2026-10-05
- Grilled: Kinotta becomes an AI-agnostic editor and this work becomes the Review phase (Review and Edit).
  Decisions E1 to E20; look chosen in a `ui-preview` round. Intent rewritten and approved; status Approved.
