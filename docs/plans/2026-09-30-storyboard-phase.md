---
title: Storyboard phase
date: 2026-09-30
status: Approved
summary: First Kinotta phase. Open a project's reels, see a storyboard version's shots, pin comments to elements, hand the batch to Claude.
spec: docs/specs/2026-09-30-storyboard-phase.md (https://github.com/RayDomD/kinotta/issues/1)
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

Run the whole storyboard loop for real in a client project. Claude writes v1 under the timing
contract, using a checked brand file and the taste list. You open it in Kinotta, pin comments to
named elements, and copy the batch. Claude writes v2 as a new frozen folder, and Kinotta offers it
while v1 freezes.

## Approach

Spec: `docs/specs/2026-09-30-storyboard-phase.md` (issue #1). Almost all behaviour lives in a reels
core with no HTTP, tested directly against sample reels folders. A thin HTTP layer and one UI API
client sit on top (D10). One stage module owns every contact with a version page. The UI is built
to the approved mockup. The Kinotta skill and the sample reels share one format, so Claude and the
tests agree.

## Steps

Split into tracer-bullet tickets by `/to-tickets`. Expected order:

1. Scaffold: Vite + React + TypeScript app, Node server, launcher, and test runners.
2. Reels core: reels, versions, shot lists and static contract checks, against sample reels.
3. Comments and batches in the core: newest-only rule, structured batch, pasteable text.
4. HTTP layer, API client and change events.
5. Stage: a same-origin frame, the jump to a second, and the element under a point.
6. Storyboard UI: grid, lanes, enlarge and pin, comments panel, version rail, broken-version list.
7. Kinotta skill: contract rules, brand file, taste list, consuming a batch.
8. End-to-end browser test and one real run in a client project.
9. `DESIGN.md` from the built Storyboard, then the finish review.

## Risks

- Many live frames on one grid may be slow. Lazy loading comes first; measure before changing.
- Same-origin frames trust the version pages. That's acceptable locally for one user, and needs a
  revisit before any sharing.
- Claude may drift from the contract. The broken-version list (S5) makes the drift visible, and the
  skill's examples come from the test samples.

## Checks to run

- Core test suite passes.
- End-to-end browser test passes.
- A real run in a client project: v1 opens, pins land on the named element, the batch reaches
  Claude, and v2 appears with the "ready" notice.
- `/impeccable audit` on the Storyboard UI, AA contrast in the one dark theme, and keyboard-only pass.

## Changelog

### 2026-09-30
- Plan created with Intent only, awaiting approval.
- Open questions resolved in a grilling round (S1 to S8). Two glossary rules added to CONTEXT.md:
  only the newest version takes comments, and a batch can be re-copied until the next version.
- Intent approved. Goal, Approach, Steps, Risks and Checks written. Spec saved and published as
  issue #1 on the new GitHub remote. Status set to Approved.
