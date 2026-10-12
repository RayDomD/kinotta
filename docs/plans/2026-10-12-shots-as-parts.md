---
title: shots-as-parts
date: 2026-10-12
status: Draft
summary: Each shot of a reel is built and changed on its own, inside one reel with one sound mix and one render.
spec:
---

## Intent

- Problem: A code-only reel is one `index.html` holding every scene, so changing one shot means rebuilding and re-versioning the whole reel. Nothing can be adjusted on its own.
- Why: Review happens shot by shot. A fix to "The hook" should not touch, re-freeze or risk the eleven shots after it.
- Proposed outcome: Each shot has its own page and its own history. You or the agent change one shot and the rest of the reel stays exactly as it was. The reel remains one deliverable: the shots in order, one sound mix across them, one timeline, one render.
- Affected: the timing contract (ADR 0001) and `server/core/_internal/contract.ts`, version reading and building, comment pins and their carry, comment batches, the stage and player in `web/src`, the Storyboard, the render path (`skill/kinotta/scripts/render.js`), `skill/kinotta` (how the agent builds and answers), `CONTEXT.md` (Shot, Scene, Version, Comment batch), a new ADR.
- Constraints: Builds on `2026-10-12-live-edits-freeze-at-render.md`, which lands first. Music and sound effects keep running across shots. Existing single-page reels keep opening and rendering. A shot stays inside its reel; it is not a separate reel.
- Out of scope: Reusing a shot in another reel. Sections as the unit (they stay a grouping). Parallel agent builds of several shots.
- Open questions:
  - O1: When a shot gets longer or shorter, do later shots and the sound placed over them shift with it?
  - O2: Do comment batches go per shot, so the agent rebuilds one shot from one batch?
  - O3: Does this cover footage reels too, where a shot is a clip the engine already builds from the plan, or code-only reels first?
  - O4: How do transitions that span two shots work when each shot is its own page?
  - O5: Are existing single-page reels converted, or only new reels built this way?

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-12
- Plan created with Intent only. Decided with the owner: the part is a shot, kept inside one reel.
