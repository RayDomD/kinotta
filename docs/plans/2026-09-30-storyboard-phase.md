---
title: Storyboard phase
date: 2026-09-30
status: Approved
summary: First Kinotta phase. Storyboards for short code-only reels and long b-roll videos, pinned comments on elements and words, section batches handed to Claude.
spec: docs/specs/2026-09-30-storyboard-phase.md (https://github.com/RayDomD/kinotta/issues/1)
---

## Intent

- Problem: When Claude builds a storyboard for a reel, the only way to give feedback is to describe
  it in prose in the terminal ("the orange word in the third shot"). Nothing ties a comment to a
  shot, a moment or an element, and nothing keeps the history of what was asked for each version.
  On a long talking video filled with b-roll, the plan runs to hundreds of clips tied to spoken
  lines, and reviewing it in chat is impossible.
- Why: The storyboard is the cheapest point to correct a reel. Every shot is built in its final
  look but not yet animated, so precise feedback here saves whole animated versions later. It is
  also first in the build order (D7), and Review and Picker reuse what it establishes: the timing
  contract, pins and comment batches. Short code-only reels and long b-roll videos matter equally
  (F1), so the first phase serves both.
- Proposed outcome: You open a project's reels in a local editor and see a storyboard version's
  shots as live stills, one section at a time on long reels. You pin comments to an element in a
  shot or to a word in the transcript, and hand one section's batch to Claude while you carry on
  reviewing. Claude builds the next version, changing only that section. Handed-off comments stay
  frozen, and unsent ones on untouched sections move forward.
- Affected: This repo (the editor app: Node server plus browser UI), the global Kinotta Claude skill
  (storyboard rules, and transcription and sections for footage), the motion-broll skill's engine
  (element names and scene timing, F7), and `<project>/reels/` folders in client projects.
- Constraints: The timing contract, shared with motion-broll through `seek(t)` (ADR 0001, F7).
  Invoked inside existing projects, and the editor never holds client assets (ADR 0002). Versions
  are frozen (D1). Element pins (D2). Grid plus enlarge (D8), live stills (D9), server logic
  independent of HTTP with one UI API client (D10), React + TypeScript + Vite (D11). Sections,
  per-section batches, carry-forward, transcript and footage stills (F2 to F8). The visual world
  is fixed by D15 to D22 and `docs/mockups/2026-09-30-editor-visual-world.html`. WCAG AA. Single
  user, local only.
- Out of scope: The Review phase (animated playback over footage, scrubbing, the footage track of
  takes, pins on playing footage), color grading (Review, with video-use as the candidate), the
  Picker, the MP4 render and render queue, audio comments, trimming, the element library format,
  approval, and Electron packaging.
- Open questions: none. Resolved in grilling rounds on 2026-09-30:
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
  - F1 to F9 (footage reels): see `docs/2026-09-30-grilling-decisions.md`.

## Goal

Run the whole storyboard loop for real in a client project, twice. The first run is a short
code-only reel. Claude writes v1 under the timing contract, using a checked brand file and the
taste list. You open it in Kinotta, pin comments to named elements, and copy the batch. Claude
writes v2 as a new frozen folder, and Kinotta offers it while v1 freezes. The second run is a
talking video with b-roll. Claude transcribes it, plans clips with motion-broll, and splits it into
sections. You review one section, hand off its batch while commenting on the next, and v2 arrives
with only that section changed and your unsent comments carried forward.

## Approach

Spec: `docs/specs/2026-09-30-storyboard-phase.md` (issue #1). Almost all behaviour lives in a reels
core with no HTTP, tested directly against sample reels folders. That includes sections, word pins,
per-section batches and carry-forward. A thin HTTP layer and one UI API client sit on top (D10).
One stage module owns every contact with a version page, including drawing panel clips over the
footage frame. The UI is built to the approved mockup. The section list and transcript line don't
have a mockup yet, so they are designed inside the established world first. The Kinotta skill,
motion-broll's engine and the sample reels share one format, so Claude, both skills and the tests
agree.

## Steps

Split into tracer-bullet tickets by `/to-tickets`. Expected order:

1. Scaffold: Vite + React + TypeScript app, Node server, launcher, and test runners.
2. Reels core: reels, versions, shot lists and static contract checks, against sample reels.
3. Comments and batches in the core: newest-only rule, structured batch, pasteable text.
4. HTTP layer, API client and change events.
5. Stage: a same-origin frame, `seek(t)`, and the element under a point.
6. Storyboard UI: grid, lanes, enlarge and pin, comments panel, version rail, broken-version list.
7. Kinotta skill: contract rules, brand file, taste list, consuming a batch.
8. Footage in the core: transcript, sections, word pins, per-section batches, the waiting mark and
   carry-forward.
9. Footage in the stage and UI: panel stills over the footage frame, section list, transcript line
   and word pins, lanes with section bands. Mock up the section list and transcript line first.
10. motion-broll engine: element names and scene timing, so its clips open in Kinotta as-is.
11. Kinotta skill for footage: transcription, section splitting, planning through motion-broll.
12. End-to-end browser test on both samples, and one real run of each reel kind in a client project.
13. `DESIGN.md` from the built Storyboard, then the finish review.

## Risks

- Many live frames on one grid may be slow. Sections cap the grid at one section's shots; lazy
  loading comes first; measure before changing.
- Same-origin frames trust the version pages. That's acceptable locally for one user, and needs a
  revisit before any sharing.
- Claude may drift from the contract. The broken-version list (S5) makes the drift visible, and the
  skill's examples come from the test samples.
- Carry-forward depends on knowing exactly which sections a version changed. If Claude misreports
  that, comments move to changed content. The core should compare section contents rather than
  trust the claim alone.
- The phase roughly doubled with footage scope. If it runs long, steps 8 to 11 can ship as a second
  release of the same phase without reworking steps 1 to 7.

## Checks to run

- Core test suite passes.
- End-to-end browser test passes on the code-only and footage samples.
- A real run of each reel kind in a client project, as described in the Goal.
- `/impeccable audit` on the Storyboard UI, AA contrast in the one dark theme, and keyboard-only pass.

## Changelog

### 2026-09-30
- Plan created with Intent only, awaiting approval.
- Open questions resolved in a grilling round (S1 to S8). Two glossary rules added to CONTEXT.md:
  only the newest version takes comments, and a batch can be re-copied until the next version.
- Intent approved. Goal, Approach, Steps, Risks and Checks written. Spec saved and published as
  issue #1 on the new GitHub remote. Status set to Approved.
- Footage reels added after a third grilling round (F1 to F9): sections, per-section batches with
  carry-forward, transcript and word pins, panel stills over footage, motion-broll as planner with a
  shared `seek(t)` contract. Intent, Goal, Approach, Steps 8 to 11, and Risks updated. Color
  grading recorded as deferred to Review.
