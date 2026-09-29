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
- Open questions: none. Resolved in a grilling round on 2026-09-30:
  - S1. The phase includes the Kinotta skill's storyboard-writing rules, so the whole loop runs.
  - S2. The skill writes `reels/brand.md` on first use, for you to check once (D14).
  - S3. Claude reads the global taste list and `reels/taste.md`, which you edit by hand. Rule
    suggestions from repeated comments are deferred.
  - S4. The editor watches the reels folder. A new version appears in the list with a "ready"
    notice, and you open it with one click; it never switches on its own.
  - S5. A version that breaks the timing contract still opens. It lists what is broken, and pins on
    unnamed elements record only a position.
  - S6. Only the newest version takes comments. Older versions are read-only.
  - S7. Copying a comment batch locks nothing. Comments can be added, edited and deleted, and the
    batch copied again, until the next version exists.
  - S8. Tests: fast core tests against a sample reels folder, plus one end-to-end browser test of
    the pin path.

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-09-30
- Plan created with Intent only, awaiting approval.
- Open questions resolved in a grilling round (S1 to S8). Two glossary rules added to CONTEXT.md:
  only the newest version takes comments, and a batch can be re-copied until the next version.
