---
title: movable-shots
date: 2026-10-12
status: Draft
summary: A code-built reel's shots appear as clips on the timeline and can be moved and trimmed like media.
spec:
---

## Intent

- Problem: A reel built from code is one continuous picture in the editor. Its shots are not on the timeline at all, so none can be moved, shortened or reordered. Any timing change needs the agent to build a new version.
- Why: The sound on such a reel is already free to move. The picture it is cut to is not, so a beat that lands late can only be fixed from the sound side.
- Proposed outcome: Each shot is a clip on a picture row, named from the storyboard. You drag it, trim it and reorder it as you do a sound clip. The preview plays the new timing straight away and Save keeps it.
- Affected: `server/core/_internal` (`version.ts`, `code-edits.ts`, `edit-list.ts`, `contract.ts`), the timing contract in `docs/adr/0001-timing-contract.md`, `web/src/review/_internal` (`MediaEditor.tsx`, `EditorialLanes.tsx`, `edited.ts`), `web/src/stage/_internal/PagePlayer.tsx`, `skill/kinotta` (what a page must do for its scenes to be movable), `CONTEXT.md`, tests.
- Constraints: Moves are free: a moved shot leaves a gap or overlaps its neighbour, and overlapping shots stack on separate rows, as sound clips do (owner, 2026-10-12). Sound stays where it is. Existing reels keep opening and rendering. Bar edges come from the page's scene timings; names come from `shots.json`.
- Out of scope: A page and a history per shot, and per-shot comment batches. Those stay in `2026-10-12-shots-as-parts.md`, after live edits. Footage reels, whose clips already move.
- Open questions:
  - O1: What plays in a gap between two shots: the page's bare ground, or the previous shot held?
  - O2: A shot's exit transition (blur, zoom, slide) leads into the next shot. When shots are pulled apart or reordered, does the exit still play, or cut?
  - O3: A page whose script hard-codes its timings will not follow a moved scene. Does the contract start requiring pages to read `data-start` and `data-duration`, with `kinotta check` flagging those that do not?
  - O4: When the last shot is moved later, does the reel get longer?

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-12
- Plan created with Intent only. Decided with the owner: this slice goes ahead of live edits, and moves are free with overlaps on separate rows.
- Findings so far: the server already reads each scene's start and duration (`code-edits.ts` `codeSources`) but sends the editor names only (`version.ts`); the edit list refuses timing edits on a code-built reel (`assertCodeOnlyOperations`); the showcase page reads `data-start` at run time, so rewritten timings would be followed there.
