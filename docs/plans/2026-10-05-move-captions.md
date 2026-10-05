---
title: Move captions (T37)
date: 2026-10-05
status: Done
summary: T37. caption-position and caption-phrase-position operations; drag in the frame moves all captions, Alt-drag one phrase; build.py applies both with CSS translate.
spec: docs/tickets-review-edit.md T37 (#39); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: Captions sit at the bottom centre and cannot be moved, so they cover whatever the footage shows there.
- Why: Captions are part of the reel's look; the Review and Edit phase lets the owner fix what the agent built, without an agent.
- Proposed outcome: Drag a caption in the frame and every caption moves; Alt-drag and only that phrase moves. Save writes both into the plan and the next version's page applies them.
- Affected: `server/core` (edit model, footage read), `skill/kinotta/engine/build.py` and `pieces.py`, `web/src/review` and `web/src/stage` (PagePlayer).
- Constraints: Plain plans build the same page as before. Handles are drawn by the editor over the page, never inside it.
- Out of scope: moving other page elements, snapping or guides, resizing captions.
- Open questions: Units, how the two positions combine, what happens when a phrase's first word is re-timed (decided below).

## Goal

`caption-position` and `caption-phrase-position` are operations in the edit list. They preview in the frame and Save writes them into the plan; `build.py` applies them.

## Approach

- Plan fields: `captions: { position: { x, y }, phrases: [{ at, x, y }] }` (`captions: true` becomes an object on the first move). Units are pixels of the 1920x1080 page, an offset from the default place.
- The two add: a phrase is placed at the reel-wide offset plus its own, so dragging all captions also carries a nudged phrase.
- A phrase is keyed by its first word's start in source seconds (within 5 ms), so snips, cuts and reordering do not lose it. If that word is re-timed, the entry moves with the word (`word-timing` re-keys it). If a re-time changes which word opens a phrase, the entry no longer matches a first word and is not applied.
- `build.py` writes `translate:<x>px <y>px` on the `.caption` element only when the offset is not zero, so a plan without positions builds byte-for-byte as before. CSS `translate` stacks with the existing `transform`.
- Editor: `PagePlayer` draws a handle over the active caption (a sibling of the frame, not in the page), applies the previewed offsets to the page's captions, and reports drags. Alt-drag moves one phrase. Arrow keys on the focused handle nudge (Alt for one phrase).
- `Version.captions` carries the version plan's captions so the preview knows the saved offsets.

## Steps

1. Core and engine tests, then `edit-model.ts`, `edit-list.ts`, `build.py`, `pieces.py`, `footage.ts`.
2. Editor: `PagePlayer`, `Player`, `Review`, `EditsPanel`.
3. Playwright in `snip-save.spec.ts` (port 4385).
4. Checks.

## Risks

- A first word moved by a re-time that stops it opening a phrase leaves its entry unused.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, `rtk proxy npm run test:e2e` (blocked this run).

## Changelog

### 2026-10-05
- Plan created.
- Done. See the session summary.
