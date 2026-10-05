---
title: Skill learns the new plan fields (T46)
date: 2026-10-05
status: Done
summary: T46. The skill keeps pieces, offsets, caption positions and slid-clearing rules, writes builtBy, copies transcript and plan into each version; app wording names no agent.
spec: docs/tickets-review-edit.md T46 (#48); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: The skill does not know the plan fields Kinotta now writes (pieces, offsets, caption positions, `slid`), says versions have no copies of the transcript and plan, and the app names one agent in its wording.
- Why: An agent that rebuilds a reel from an old reading of the plan would undo the owner's edits (E14, E16, E20).
- Proposed outcome: The skill's rules cover each field, `builtBy`, the per-version copies and `kinotta-edits.css`; the app says "your agent".
- Affected: `skill/kinotta/SKILL.md`, `reference/contract.md`, `scripts/shots.py`; `web/src` and `server` strings and comments; their tests.
- Constraints: The installed skill is a junction to `skill/kinotta`, so edits are live. Engine output does not change.
- Out of scope: Packaging other agents; new editor behaviour.
- Open questions: None.

## Goal

An agent following the skill rebuilds a reel without losing an edit, and no app text names an agent.

## Approach

Rewrite the skill text where it conflicts; add `--built-by` to `shots.py` so `builtBy` is written by the tool; replace agent names in app strings with "your agent"; a test fails if web or server source names an agent.

## Steps

1. Skill rules and contract. 2. `shots.py --built-by` with a test. 3. Neutral strings and updated tests. 4. Guard test. 5. Checks.

## Risks

A stale e2e string; covered by running batch and section-batches specs.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, scoped e2e for the two specs whose strings changed.

## Changelog

### 2026-10-05
- Plan created and done.
