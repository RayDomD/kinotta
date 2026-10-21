---
title: Taste list and effect templates
date: 2026-10-20
status: Done
summary: Rewrite the global taste list from CRAFT.md and scroll-craft, then add seek-driven effect templates modelled on a talking-head reel.
spec:
---

## Intent

- Problem: `~/.kinotta/taste.md` holds nine loose rules. Reels get no guidance on shape, pacing or motion, and there are no reusable effect scenes.
- Why: Every build reads the taste list first; it is the cheapest place to raise every reel's floor.
- Proposed outcome: a grouped, one-line-per-rule taste list, and a small library of effect templates a build can start from.
- Affected: `~/.kinotta/taste.md`, `skill/kinotta/templates/effects/`, `skill/kinotta/SKILL.md` (one pointer).
- Constraints: the timing contract. Reels are unanimated in CSS; all motion is computed inside `seek(t)` and must reproduce the same frame on any seek. Templates take colour and type from the brand file. Templates are clean-room recreations of generic effects, no copied assets or code.
- Out of scope: automatic person matting; editor chrome (`DESIGN.md`).
- Open questions: none. Owner chose all eight effects (2026-10-20).

## Goal

Every reel build reads a taste list covering shape, motion, type, colour and refusals, and can start a shot from a named effect template.

## Approach

Translate scroll-craft from scroll distance to reel time; CRAFT.md's 500ms ceiling applies to small in-shot moves, not to scene pacing. Effects observed in the reference reel (facebook.com/reel/1572822720835499): section tag, text behind you (needs matte), floating videos, number transition, big words, checklist, before and after, prompt box, title card.

## Steps

1. Rewrite `~/.kinotta/taste.md` (keeps the original nine rules).
2. Build effect templates under `skill/kinotta/templates/effects/` (scope pending).
3. Point `SKILL.md` section 3 at the templates.

## Risks

- A long taste list gets skimmed. Keep one line per rule.
- Text behind you is unusable without a matte source.

## Checks to run

- Read the taste list against `skill/kinotta/reference/contract.md` for conflicts.
- Per template: `kinotta check`, seek forward and backward to the same frame, storyboard still renders.

## Changelog

### 2026-10-20
- Plan created and approved; step 1 started.

### 2026-10-20 (later)
- Taste list rewritten (36 rules, then a component-repetition rule at the owner's request).
- Nine templates built in `skill/kinotta/templates/effects/` (the eight effects plus the section tag), with README and a SKILL.md step 3 pointer.
- Verified: demo parts reel of all nine builds and `kinotta check` reports no contract issues; DOM state is identical at five times per shot after forward and backward seeks; mid-shot frames inspected. Pixel hashes differed run to run from compositing noise, so DOM state was the repeatability check.
- Not done: automatic person matting for text-behind (needs a supplied matte).
