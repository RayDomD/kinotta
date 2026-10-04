---
title: A real engine clip in the footage tests (T21)
date: 2026-10-04
status: Done
summary: T21 (#24). The footage sample's page is now composed by the engine from four clips, so the footage e2e tests run against engine output.
spec: docs/tickets.md T21 (#24)
---

## Intent

- Problem: The footage tests run against a hand-written page, so nothing checks that engine output
  works with footage stills, word pins and section batches.
- Why: T23 builds footage versions with the engine; the tests should already exercise that output.
- Proposed outcome: The footage sample's page is engine-built and every footage test passes on it.
- Affected: `tests/fixtures/projects/footage-project/` (new `motion/` sources, rebuilt v1 page), `tests/engine/compose.test.ts`.
- Constraints: Same scene times and element names, so existing tests keep their meaning.
- Out of scope: the skill's footage workflow (T23).
- Open questions: none.

## Goal

T21's acceptance criteria met.

## Approach

All four scenes become engine clips (two cutaways, two panels) in `motion/clips/`, composed by
`build.py --plan motion/plan.json`. The ids carry the old element names. Each clip uses `intro:null` and
layers with no entry time, because every shot starts on its clip's in-point. The built page is committed,
and a test fails when it differs from what the engine builds today.

## Steps

1. Clips and plan; compose; `kinotta check`.
2. Drift test; footage, word-pin and section-batch suites.
3. Look at the stills in the editor; full checks.

## Risks

- A committed build goes stale when the engine changes; the drift test catches it.

## Checks to run

`npm run typecheck`, `npm test`, `npm run test:e2e`.

## Changelog

### 2026-10-04
- Plan created and done in one run, under the owner's go-ahead.
