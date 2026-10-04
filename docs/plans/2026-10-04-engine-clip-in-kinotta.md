---
title: One engine clip opens in Kinotta (T19)
date: 2026-10-04
status: Done
summary: T19 (#22). build.py makes a clip one timed Kinotta scene with element names; an example clip opens, pins and passes the check.
spec: docs/tickets.md T19 (#22)
---

## Intent

- Problem: A page built by the motion engine has no scene timing and no element names, so Kinotta
  reports contract issues and a click on it pins nothing.
- Why: T20 (many clips on one page) and the footage workflow build on a single clip that opens in Kinotta.
- Proposed outcome: A built clip opens in Kinotta as a one-clip reel with no issues, and a click pins a named element.
- Affected: `skill/kinotta/engine/build.py`, `beats.js`, `reference/engine-api.md`, the editor's hit
  test, a new `engine-project` test sample.
- Constraints: The engine's render and contact sheets keep working. The standalone motion-broll is not touched.
- Out of scope: several clips on one page and a page-wide `seek` (T20).
- Open questions: none.

## Goal

T19's acceptance criteria met.

## Approach

`build.py` puts `data-scene`, `data-start="0"` and `data-duration` (the clip's `T`) on `#stage`, and
`data-el` on the shape, the cursor and every element with an `id` except the zero-size `.L` layer anchors.
The tests build the skill's examples at run time, so the sample always reflects the current engine.

## Steps

1. Failing tests: `tests/engine/build.test.ts` (scene, names, check) and `tests/e2e/engine.spec.ts`.
2. `build.py` scene timing and names; naming rule in `reference/engine-api.md`.
3. Fix `beats.js`, which created its temp folder under `/tmp` and so failed on Windows.
4. Checks.

## Risks

- Some ids sit on zero-size wrappers (`c0`, `scene`, `lines` in the examples). The editor's hit test
  now hands such a click to the nearest named ancestor with a box.

## Checks to run

`npm run typecheck`, `npm test`, `npm run test:e2e`, render and contact sheet of a built clip.

## Changelog

### 2026-10-04
- Plan created and done in one run; the owner said go after T18 and T22.
