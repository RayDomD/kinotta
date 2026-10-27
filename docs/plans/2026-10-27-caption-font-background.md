---
title: Caption font and background
date: 2026-10-27
status: Draft
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
  - O1: What does `background` accept: a colour and opacity only, or also `none` and a radius? Recommended: colour (with alpha) or `none`.

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-27
- Plan created with Intent only. Owner chose agent-only (set from comments) on 2026-10-27.
