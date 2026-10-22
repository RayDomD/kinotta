---
title: simple-mode test failures
date: 2026-10-22
status: In Progress
summary: Fix the 10 unit and E2E failures codex found on feat/simple-mode e2693b1
spec: .herdr/briefs/2026-10-22-failure-origin-codex.md (main checkout)
---

## Intent

- Problem: feat/simple-mode at e2693b1 fails 5 unit tests and 5 E2E tests (plus 5 serial skips).
- Why: these failures flow into integrate/2026-10-21 and block merging.
- Proposed outcome: every listed file passes on feat/simple-mode, with each fix on the side that is actually wrong.
- Affected: tests/core/{launcher,render-agent-make,render-native-lanes,render-simple-lanes}.test.ts; tests/e2e/{editing,renders,sections,snip-save,transcription}.spec.ts; whatever source introduced each break.
- Constraints: work in .worktrees/simple-mode only. Ask the owner before changing intentional UI behaviour (version rail labels, rail order). No subagents.
- Out of scope: other branches, including the trim-leaves-gap native-lanes failure agy found.
- Open questions: whether F2 and F3 are intentional UI changes.

## Goal

All 12 listed files pass on feat/simple-mode.

## Approach

Per group, find the introducing commit, check DESIGN.md and the simple-mode plans, decide code vs. stale test, fix, rerun the group alone, commit.

- F1 editing Undo: two Undo buttons match.
- F2 snip-save, transcription: version rail lacks "you".
- F3 sections: Sections label below Versions.
- F4 renders: render API rejects a numbered version.
- F5 native-lanes, simple-lanes, agent-make: reel button / Simple timeline not found.
- F6 launcher: free-port fallback returns the taken port.

## Steps

1. F1 to F6 in order, one commit per group.
2. Full rerun of all 12 files.

## Risks

- Some failures may be environment flakiness; confirm each reproduces here first.

## Checks to run

- Each group's file alone, then all 5 unit files and 7 E2E files together.

## Changelog

### 2026-10-22
- Plan created and approved.
