---
title: version-compare
date: 2026-10-13
status: Draft
summary: Two versions of a reel play side by side on one playhead, so you can see what a new version changed.
spec:
---

## Intent

- Problem: When a new version arrives, the question is what changed and whether it is better. Today you answer it by switching versions in the rail and comparing from memory. The skill has a `compare.html` template, but it is a separate page of rendered videos, not part of the editor.
- Why: Versions are the centre of Kinotta's loop, and every round ends with this judgement. It is also the one idea from the 2026-10-13 comparison that their editor only has on its roadmap, and Kinotta is better placed for it: every version is a frozen live page that can be put at any second.
- Proposed outcome: With Compare on, the older version and the newer one show next to each other, labelled, and play, pause and scrub together from the one transport. Turning it off puts the screen back as it was.
- Affected: `web/src/review/_internal` (the transport, `Player.tsx`, `MediaEditor.tsx`, `Review.tsx`, `EditorWorkspace.tsx`, `editor-settings.ts`), `web/src/stage` (a second page player on another version), `web/src/ShotSheet.tsx` and `Storyboard.tsx` if the Storyboard is included, `web/src/review/review.css`, `CONTEXT.md` (a Compare term), tests under `tests/core` and `tests/e2e`. Mockup: `docs/mockups/2026-10-13-version-compare.html`, option B.
- Constraints:
  - Compare is a view. It edits nothing, writes nothing into a version, and never changes a render.
  - Only the newest version takes comments, as now. The older side is read-only.
  - Builds on `2026-10-13-viewer-transport-clips.md`: it uses that plan's shared transport and its frame pane, so that plan lands first.
  - `DESIGN.md` tokens and the One Light Rule: the ice blue marks the newer side only.
  - The Compare switch is a registry action, rebindable like the rest.
- Out of scope:
  - The other modes from the mockup: wipe (A), flip on a held key (C) and the list of changed elements (D).
  - Comparing two reels, or more than two versions at once.
  - Comparing alternates of one shot. That belongs to `2026-10-13-alternates.md`.
- Open questions:
  - O1: When the two versions differ in length or shot order, do both sides show the same reel second, or the same shot at the same point within it?
  - O2: Which side's sound do you hear? I would play the newer one only.
  - O3: Does Compare live in Review only, or also on the enlarged shot in the Storyboard? The mockup says both.
  - O4: Which version is the default to compare against: the one before, or the last one you rendered or approved?
  - O5: Does the first build cover media reels, where the picture is footage layers under the page, or code-built reels only?
  - O6: Once live edits land, is the newer side the working reel with your unsaved edits, or the last frozen version?

Decided with the owner in the 2026-10-13 preview session: side by side, option B.

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-13
- Plan created with Intent only. Side by side chosen from `docs/mockups/2026-10-13-version-compare.html`. Awaiting approval of the Intent and answers to O1 to O6 before Goal and Approach.
