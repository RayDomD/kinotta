---
title: Review and Edit code-review fixes (P2, P3, P6 to P9)
date: 2026-10-05
status: Done
summary: Fixes from the branch code review: Save carries comments at once, a plan-less version is one piece, Save journals its source writes, transcript fields and per-version files survive, element pins flag element-removed.
spec: docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: The branch review found six places where Save or comment carry-forward does not match the spec or can lose data.
- Why: Save is the one write path into a reel's sources; a crash or a dropped field there is not recoverable by the user.
- Proposed outcome: Each finding fixed with a core test that failed first.
- Affected: `server/core/_internal` (save, carry, footage, code-edits, sources, version-build, edit-list, new save-journal), `web` (one label).
- Constraints: Tests at the `Project` seam over copied fixtures. No new API.
- Out of scope: The code-only Save's own crash window (it writes no sources; a replay re-applies absolute offsets, which is idempotent).
- Open questions: none.

## Goal

The six findings closed, one test group each in `tests/core/save-review-fixes.test.ts`.

## Approach

- P2: Save calls `settleNewest` after the version is published (both footage and code-only paths), so the previous version is marked moved before Save returns. Agent builds keep the watcher path.
- P3: `footage.ts` `readPlanText`: a version's own plan, else the nearest earlier version's own plan (what an agent built from), else the reel's current plan for the newest only, else none (one whole-video piece). The reel's current plan is never used for an older version. Clips read only the version's own plan.
- P6: the commit point is the version rename. `save-journal.ts` writes `save-intent.json` (version number, the sources as they were) before the first source write and removes it after the list is cleared. On the next list read, a journal whose `v<n>` exists means committed: clear the list. One whose `v<n>` is missing means not committed: put the sources back and keep the list. Chosen over reordering the writes because publishing first leaves a window with a version and unedited sources, which needs the same journal to detect.
- P7: `readReelTranscript` returns the file as written; Save and `stageVersion` write `{ ...transcript, words }`.
- P8: `copyVersion` skips `shots.json`, `edits.json`, `answers.md`, `comments.json` and `comments-<section>.json` at the version's top level. Per-version review state (comments, note, hand-offs) lives in `reels/.kinotta`, outside the folder.
- P9: new comment state `element-removed`. Carry reads the new version's page and flags an element pin whose `data-el` is gone; a moment-removed mark wins when both apply; the mark is sticky. The comment card reads "Element removed".

## Steps

1. Tests first (8 failing), then the fixes.
2. Typecheck, unit tests, scoped e2e.

## Risks

- A page that cannot be read flags nothing, rather than every element pin.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, scoped e2e (snip-save, review, clips, code-only, handoff, transcription, new-reel, batch, section-batches) through a scratch config.

## Changelog

### 2026-10-05
- Plan created.
- Done. See the session summary.
