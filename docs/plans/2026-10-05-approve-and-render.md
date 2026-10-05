---
title: Approve and Render phase
date: 2026-10-05
status: Draft
summary: Approve final versions and render them (Draft, Final, Overlay) from Picker or kinotta render
spec: docs/specs/2026-10-05-approve-and-render.md (#52)
---

## Intent

- Problem: Kinotta can edit and version a reel, but it can't produce a video file or mark a version as final. The
  Picker tab has no meaning.
- Why: rendering is the last gap in the Storyboard, Review, Picker loop. Without it, every deliverable is stitched
  together by hand outside Kinotta.
- Proposed outcome: the owner approves the versions that are final. Any version can be rendered as a quick Draft, and
  an approved one as a Final MP4 or a transparent Overlay. Renders run in the background, and an agent's render gives
  the same file as the owner's.
- Affected:
  - Core: `Project`, a new render module, `runner.ts`, the startup tool check.
  - The HTTP API and the `kinotta` CLI.
  - Web: a new Picker page, a rail mark for approved versions, a render indicator in the top bar.
  - The skill: `SKILL.md`, `engine/render.js`. `composite.py` is replaced.
  - `CONTEXT.md`.
- Constraints:
  - Versions stay frozen, and approving one doesn't change it.
  - Only the owner approves.
  - Kinotta calls no AI service.
  - Processes start only through `runner.ts` (E3).
  - A render matches what Review plays.
  - A cancelled or failed render leaves no partial file.
- Out of scope: agent approval, codecs beyond the three presets, GPU encoding, WebM, GIF, HLS, resuming an interrupted
  render, uploading or sharing.
- Open questions:
  - Five choices made while writing the spec need the owner's confirmation:
    - `kinotta render` runs a render itself, under a lock file, when the editor isn't running.
    - The CLI has no approve command.
    - Playwright's Chromium joins the startup tool check.
    - Render settings are saved in `reels/<reel>/render-settings.json`.
    - A render uses the version's own plan.
  - The Picker page layout. No mockup exists yet.

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-05
- Plan created, Intent only.
