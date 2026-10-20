---
title: Talking-head effects and presets
date: 2026-10-20
status: Done
summary: Add taste rules, seven effect templates and caption and grade presets from a second talking-head reference reel.
spec:
---

## Intent

- Problem: the taste list and the nine effect templates cover titles and panels but not the caption style, overlays and annotations a talking-head reel lives on.
- Why: the owner asked to update Kinotta's taste from a reference reel (facebook.com/share/v/1EGrkbYtNJ, 97 s, portrait).
- Proposed outcome: taste rules for captions and overlays, templates for the new effects, and presets a build can apply in one line.
- Affected: `~/.kinotta/taste.md`, `skill/kinotta/templates/effects/`.
- Constraints: the timing contract (all motion in `seek(t)`, repeatable on any seek). Clean-room recreations; no copied assets or code. Colour and type come from the brand file.
- Out of scope: speech-to-text word timing (captions take `data-at` times), person matting, editor chrome.
- Open questions: none. Owner chose "add them all" (2026-10-20).

## Goal

A build can caption a talking head in the reference style, place overlays and annotations, and grade footage live, starting from named templates and presets.

## Approach

Observed effects: two-weight word captions with blur-in and accent word; chip tally; two-column activity feed; speaker framed as a card with drawn shapes; live grade on a word; strike-through X; hand-drawn circle; icon widgets with a travelling arc. Title with tags and terminal-then-button stay covered by `title-card` and `prompt`.

Presets live in `presets.css`: one caption preset (sizes, weights, blur) and three grade presets (warm, mono, cool) as filter tokens.

## Steps

1. Add taste rules; widen the motion property rule to allow `filter` for blur-in and grades.
2. Build templates: `captions`, `chip-tally`, `activity-feed`, `framed-speaker`, `live-grade`, `annotate` (strike and circle), `arc-flow`.
3. Add `presets.css` and README rows.

## Risks

- `filter: blur` is costlier to render than transform; keep blur on text only.

## Checks to run

- Demo parts reel of the new templates: `kinotta build` and `kinotta check` clean.
- DOM state identical after forward and backward seeks at several times per shot; mid-shot frames inspected.

## Changelog

### 2026-10-20
- Plan created and approved ("add them all").

### 2026-10-20 (later)
- Taste list: new "Captions and overlays" group (six rules), two motion rules, and `filter` allowed for blur-in and grades. Backup at `~/.kinotta/taste.md.bak-2026-10-20`.
- Seven templates built, plus `presets.css` and README rows.
- Verified: demo parts reel of the seven, `kinotta build` and `kinotta check` report no contract issues; style state identical at ten times per shot after forward and backward seeks; no page errors; frames at 1 s and 2 s inspected. Fixed a clipped squiggle path found in inspection.
