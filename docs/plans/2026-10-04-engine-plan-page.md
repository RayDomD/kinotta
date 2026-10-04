---
title: Many engine clips on one reel page (T20)
date: 2026-10-04
status: Done
summary: T20 (#23). The engine scopes each clip to its scene and build.py --plan composes a b-roll plan into one Kinotta version page.
spec: docs/tickets.md T20 (#23)
---

## Intent

- Problem: The engine assumes one clip per page (page-wide ids, one global `seek`), so a footage reel's
  clips cannot share the one version page Kinotta reviews.
- Why: T21 (engine output in the footage tests) and T23 (footage v1) need a plan built into one page.
- Proposed outcome: A b-roll plan builds into one page whose scenes sit at the clips' in-points, panel
  clips stay transparent over the footage, and the six-clip example opens in Kinotta as a footage reel.
- Affected: `skill/kinotta/engine/` (`motion.js`, `build.py`, `base.css`), the example `plan.json`,
  `reference/engine-api.md`, a new `broll-project` test sample.
- Constraints: Single-clip build, render and contact sheets keep working. Standalone motion-broll untouched.
- Out of scope: replacing the footage sample's hand-written panel (T21), the skill's footage workflow (T23).
- Open questions: none.

## Goal

T20's acceptance criteria met.

## Approach

Scope at runtime, not by rewriting ids. While a clip's script runs on a composed page, `M.root` is its
scene: `M.scene` looks up its elements inside it and registers its `seek`, and the script runs with
`M.scope(root)` as its `document`. `M.page(duration)` is the page's `seek`. `build.py --plan` nests each
clip's CSS under its scene. A clip on its own page behaves exactly as before.

## Steps

1. Failing tests: `tests/engine/compose.test.ts`, `tests/e2e/engine-compose.spec.ts`.
2. `motion.js` root, `M.scope`, `M.page`; `build.py --plan`; `base.css` alpha rule scoped to a class.
3. Example plan gains `duration`; reference documents composing.
4. Checks, including render of a full and a transparent clip.

## Risks

- A clip script that reaches the page some other way than its `document` escapes the scope; the
  reference says not to.

## Checks to run

`npm run typecheck`, `npm test`, `npm run test:e2e`, single-clip render (MP4 and ProRes alpha) and contact sheet.

## Changelog

### 2026-10-04
- Plan created and done in one run; the owner said go after T19.
