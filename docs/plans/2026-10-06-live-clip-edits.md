---
title: Clip edits in the picture as you make them
date: 2026-10-06
status: Done
summary: A clip slid or trimmed in Review plays at its new time in the picture while it is dragged and after, before Save, with no rebuild; dragging a clip edge or a piece puts the playhead on it.
spec: docs/specs/2026-10-05-approve-and-render.md
---

## Intent

- Problem: in Review, a clip slide or trim moves only its block in the lanes. The picture keeps showing the clip at its old time until Save rebuilds the page, and nothing in the picture follows a drag.
- Why: the owner wants edits to show in real time (asked 2026-10-06, options A and B).
- Proposed outcome: the picture follows a clip drag live and keeps the edit after the drop, before Save; the playhead jumps to the edge being dragged; dragging a piece shows that piece.
- Affected: `web/src/stage/_internal/PagePlayer.tsx`, `web/src/review/_internal/Review.tsx`, `Lanes.tsx`, `Player.tsx`, the stage README, `tests/e2e/clips.spec.ts`.
- Constraints: Save still builds the version with the real engine; the page is changed only in memory.
- Out of scope: word retiming in the picture; code-only reels, whose timing isn't editable.
- Open questions: None.

## Goal

A slid or trimmed clip plays at its new time in the picture during the drag and after it, before Save, and undo puts it back.

## Approach

No rebuild. The engine's composed page reads each scene's `data-start` and `data-duration` on every seek (`motion.js`, `M.page`), so `PagePlayer` rewrites them before each seek for the clips that are moved (a clip-slide or clip-trim in the edit list, or the clip being dragged), and restores the built values for the rest. Start times are the edited timeline's plus the page offset at that moment, so unsaved footage cuts are respected. The Clips lane reports a drag as it goes (`onPreviewClip`); Review applies it to that clip's span, pauses playback, and seeks to the dragged edge (the clip's new start, or a frame inside its new end). A piece drag scrubs to that piece's first frame.

## Checks

- typecheck, unit vitest, `clips.spec.ts` with a new test, full Playwright.

## Changelog

- 2026-10-06: Built and Done in one pass (the owner chose the approach in conversation). Summary: `docs/session-summaries/2026-10-06-live-clip-edits-summary.md`.
