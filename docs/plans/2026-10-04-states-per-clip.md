---
title: States per clip (T26, K15)
date: 2026-10-04
status: Approved
summary: T26. A clip that changes state gets one storyboard shot per state (05a, 05b, …); the grid shows "2 of 3" and the enlarged shot a strip of the clip's states.
spec: docs/tickets.md T26; decision K15; mockup docs/mockups/2026-10-04-stills-per-clip.html
---

## Intent

- Problem: A footage clip that changes several times (a table builds, then a chart) shows as one still,
  so the owner can't see or pin its later states.
- Why: Long clips hide most of what they draw from review; the sample reel's clips 02 and 05 do.
- Proposed outcome: Each settled state of a clip is its own shot, the grid shows which part of its clip
  a card is, and the enlarged shot lets the owner jump between a clip's states.
- Affected: `skill/kinotta/scripts/shots.py`, `skill/kinotta/SKILL.md` sections 5 and 6,
  `web/src/Storyboard.tsx`, `web/src/ShotSheet.tsx`, `web/src/styles.css`, the web `Shot` type, tests.
- Constraints: Follow the mockup (grid B, sheet Y). Core stays unchanged (it passes extra shot fields
  through). A plan with no `stills` produces the same shots.json as today.
- Out of scope: captions; Review-phase playback; renumbering of existing reels.
- Open questions: none (K15 settled the design).

## Goal

T26's acceptance criteria met, and the sample reel rebuilt with states for its long clips.

## Approach

- Plan clip gains `"stills": [{"from": 0, "title": "…"}, …]`, `from` = clip-local time the state
  begins. `shots.py` writes one shot per state numbered `<id>a`, `<id>b`, … with `"clip": "<id>"`, its
  still 1 s into the state (at most half the state's span; the first state keeps the clip's `still`),
  and `line` from the state's start to the next state's start.
- Web: `Shot.clip?: string`. Grid card shows a "2 of 3" bar under the label for shots sharing a clip.
  The sheet shows the clip's states as a strip of small stills between the frame and "Pin an element";
  clicking one steps to it. Arrow keys still step through every shot.
- Skill: section 5 rule for when to split (a state per settled change, at most one per ~4 s, at most 4
  per clip; short clips keep one), section 6 maps `05b` back to clip 05.

## Steps

1. Failing tests: `shots.py` splitting (scripts.test.ts), e2e for the bar, the strip and switching.
2. `shots.py`; web type, card bar, sheet strip, styles.
3. Skill sections 5 and 6.
4. Checks, then `/impeccable critique` and `/impeccable audit` on the sheet change.
5. Rebuild the sample reel in `C:\Users\ryand\Downloads\kinotta-test` with stills on clips 02 and 05.

## Risks

- Shot numbers like `05b` must pass `kinotta check` and comment pins (shot numbers are strings).
- The strip draws extra live stills in the sheet; keep it to the clip's states only (at most 4).

## Checks to run

`npm run typecheck`, `npm test`, `npm run test:e2e`, `kinotta check` on the sample reel.

## Changelog

### 2026-10-04
- Plan created under the owner's goal run (design settled in K15).
