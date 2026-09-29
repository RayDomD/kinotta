---
title: Storyboard phase
date: 2026-09-30
status: Draft
summary: First Kinotta phase. Open a project's reels, see a storyboard version's shots, pin comments to elements, hand the batch to Claude.
spec:
---

## Intent

- Problem: When Claude builds a storyboard for a reel, the only way to give feedback is to describe
  it in prose in the terminal ("the orange word in the third shot"). Nothing ties a comment to a
  shot, a moment or an element, and nothing keeps the history of what was asked for each version.
- Why: The storyboard is the cheapest point to correct a reel. Every shot is built in its final
  look but not yet animated, so precise feedback here saves whole animated versions later. It is
  also first in the build order (D7), and Review and Picker reuse what it establishes: the timing
  contract, pins and comment batches.
- Proposed outcome: You open a project's reels in a local editor, see every shot of a storyboard
  version as a live still, click an element in a shot to pin a comment to it, and hand the whole
  comment batch to Claude in one step. Claude builds the next version, and the previous version and
  its comments stay frozen.
- Affected: This repo (the editor app: Node server plus browser UI), the global Kinotta Claude skill
  (the rules Claude follows when writing a storyboard version), and `<project>/reels/` folders in
  client projects.
- Constraints: The timing contract (ADR 0001). Invoked inside existing projects, and the editor
  never holds client assets (ADR 0002). Versions are frozen (D1). Element pins (D2). Grid plus
  enlarge (D8), live stills (D9), server logic independent of HTTP with one UI API client (D10),
  React + TypeScript + Vite (D11). The visual world is fixed by D15 to D22 and
  `docs/mockups/2026-09-30-editor-visual-world.html`. WCAG AA. Single user, local only.
- Out of scope: The Review phase (animated playback, scrubbing, a timeline of footage clips), the
  Picker, the MP4 render, audio comments, trimming, the element library format, approval, and
  Electron packaging.
- Open questions:
  1. Does this phase include the Claude skill's storyboard-writing rules (shot list format, timing
     contract markup), or only the editor with a hand-made fixture reel? Recommended: include the
     skill rules, since the loop is untestable end to end without them.
  2. Brand file (D14) and taste list (D12): in this phase or deferred? Recommended: taste list
     read-only display and brand file creation in the skill. Rule suggestions from repeated
     comments are deferred.
  3. How does the editor learn a new version exists? Recommended: it watches the reels folder and
     shows the new version without a reload.

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-09-30
- Plan created with Intent only, awaiting approval.
