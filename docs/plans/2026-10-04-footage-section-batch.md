---
title: Next footage version from a section's comments (T24)
date: 2026-10-04
status: Done
summary: T24 (#27). The skill rebuilds only a batch's section of a footage reel, handles all three pin kinds, and Kinotta sees only that section change.
spec: docs/tickets.md T24 (#27)
---

## Intent

- Problem: The skill can build a footage v1 but has no rules for answering a section batch on one.
- Why: The review loop on footage reels (and T25, the real run) needs v2 from a section's comments.
- Proposed outcome: Given a section batch, Claude rebuilds that section's clips only, answers every
  comment and note, and Kinotta shows only that section as changed.
- Affected: `skill/kinotta/SKILL.md`, `engine/build.py`, the footage sample's page.
- Constraints: Other sections unchanged; unsent comments carry over (core, F4).
- Out of scope: the real run (T25).
- Open questions: none.

## Goal

T24's acceptance criteria met.

## Approach

SKILL.md section 6, with section 4 handing footage reels to it. Writing the test exposed that the
composed page kept clip styles and scripts outside the scenes, while Kinotta judges change by scene
markup, so a motion-only fix would read as unchanged. `build.py --plan` now loads the engine first and
places each clip's style and script inside its scene.

## Steps

1. Failing test `tests/engine/batch.test.ts`; fix the composer; rebuild the footage sample.
2. Section 6 and the section 4 route; reference note.
3. Checks.

## Risks

- A change to the shared engine itself (motion.js, base.css) touches every section but sits outside the
  scenes, so it would not show as a change.

## Checks to run

`npm run typecheck`, `npm test`, `npm run test:e2e`.

## Changelog

### 2026-10-04
- Plan created and done in one run, under the owner's go-ahead.
