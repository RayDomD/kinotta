---
title: Alternates for footage reels
date: 2026-10-30
status: Draft
summary: Let a reel built over footage offer, preview and choose alternates for its graphics shots, as code-built reels do.
spec:
---

## Intent

- Problem: On a footage reel you cannot ask for alternates. The Storyboard hides "Ask for options" (`canAskOptions` is true only for parts or code versions, `web/src/Storyboard.tsx`), a comment such as "3 alternates" is saved as plain text, and `kinotta build` refuses to convert the reel: "Parts builds are for code-built reels. Footage reels keep their existing build path." (`server/core/_internal/parts-build.ts`). A reel counts as code-only only when it has no `plan.json` in its folder and no `footage` entry in `reel.json` (`isCodeOnly`, `server/core/_internal/code-edits.ts`), so linking footage or keeping a plan file is enough to lose alternates. Found on the Arcade reel `lumen-v2` (a code-built motion reel with a voice clip), where the owner asked for 3 alternates of shot 1.
- Why: The graphics shots over footage are where options help most. The owner's decision in `AGENTS.md` is that alternatives are previewed, switched and applied inside one Storyboard shot card; that cannot reach a footage reel while the build path refuses it. The first Arcade run and its rework showed that an agent repeats its approach unless the owner can see different takes side by side.
- Proposed outcome: On any reel, including one built over footage, the owner can ask for 2 to 4 alternates of a graphics shot, see them in the Storyboard, choose one, and get an undoable change in Working, with the footage, voice and music untouched.
- Affected: `server/core/_internal/parts-build.ts`, `code-edits.ts`, `sources.ts`, the footage build path (`engine/build.py`, `plan.json`), `web/src/Storyboard.tsx` and `ShotSheet.tsx`, `skill/kinotta/stages/alternates.md`, `reference/contract.md`, and the e2e specs for alternates.
- Constraints: Published versions and revision folders stay immutable. Footage, its transcript and the owner's sound edits must survive a build. The owner's latest decision (inline alternatives in the card) takes precedence over older mockups. No reel's existing versions may change meaning or lose their voice.
- Out of scope: Alternates for the footage itself (cuts, trims), converting every footage reel automatically, and the inline-card redesign, which is a separate change.
- Open questions: (1) Should a footage reel gain parts for its graphics shots only, with the footage as a shared base, or should alternates attach to the plan's clips? (2) How does the voice stay tied to the footage when shots become parts? (3) What happens to existing footage reels and their old versions? (4) Does the Storyboard treat a footage graphics shot differently from a parts shot?

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-30
- Plan created with Intent only, for owner approval before an approach is written.
