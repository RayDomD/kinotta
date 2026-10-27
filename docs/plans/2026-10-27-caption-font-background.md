---
title: Caption font and background
date: 2026-10-27
status: Approved
summary: The agent can set a reel's caption font and background from a comment, instead of the fixed Geist 50px on a dark box.
spec:
---

## Intent

- Problem: Caption font and background are fixed. `CAPTION_CSS` in `skill/kinotta/engine/build.py` (about lines 80-88) sets `600 50px Geist` and a phrase box of `rgba(11,11,11,.72)` with a 10px radius. The plan's `captions` only accepts `look` (highlight, phrase, words, off) and `color` (the lit word). A comment asking for another caption font cannot be answered.
- Why: Caption styling is one of the first things an owner asks to change.
- Proposed outcome: The plan's `captions` gains `font` and `background`. When absent, captions look exactly as today. The agent sets them in answer to a comment; the editor preview and render both show them.
- Affected: `skill/kinotta/engine/build.py`, `skill/kinotta/reference/contract.md` (captions fields), `web/src/review/_internal/MediaEditor.tsx:351`, `web/src/SimpleTimeline.tsx:324`, caption engine and editor tests.
- Constraints: Opt-in per reel (no enforced style). Old plans and frozen versions render unchanged. Fonts must be ones the project has or the brand names, with redistribution rights checked for anything bundled.
- Out of scope: Editor controls for caption font and background (owner chose agent-only on 2026-10-27), caption position, and per-word styling beyond `color`.
- Open questions:
  - O1: What does `background` accept: a colour and opacity only, or also `none` and a radius? Resolved 2026-10-27, owner approved: colour (with alpha) or `none`.

## Goal

1. A plan with `captions.font` and `captions.background` renders captions in that font and background, in the editor preview and in renders.
2. A plan without them renders exactly as today.
3. `kinotta check` rejects an unknown font or a malformed background with a clear message.

## Approach

`captions` gains `font` (a family name the project or brand provides, with optional `weight` and `size`) and `background` (a CSS colour with alpha, or `"none"`). `caption_style` in `build.py` reads them, and the caption layer gets CSS variables (`--cap-font`, `--cap-bg`) with today's values as fallbacks, so `CAPTION_CSS` only swaps its literals for `var(...)`, including the `words` look's per-word box. The editor's caption preview (`MediaEditor.tsx:351`) and the Simple timeline read the same fields. `contract.md` documents them, and the skill's comment guidance says to answer "change the caption font" by setting them.

## Steps

1. [ ] Engine tests (red): the default plan's caption CSS is unchanged; font and background applied; `none` removes the box in every look; bad values rejected.
2. [ ] `build.py` variables and validation.
3. [ ] Editor preview reads the fields; editor render test.
4. [ ] `contract.md` and skill comment guidance.

## Risks

- A font missing from the project would silently fall back: validate it at check time.
- The `words` look has its own per-word box; it must use the same background variable.

## Checks to run

- Caption engine tests and the editor render test.
- One render of a sample reel with a custom font, viewed.
- `npm run typecheck`.

## Changelog

### 2026-10-27
- Plan created with Intent only. Owner chose agent-only (set from comments) on 2026-10-27.
- Owner approved the Intent and its recommended answers; Goal, Approach, Steps, Risks and Checks written. Status Approved.
