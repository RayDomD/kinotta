---
title: alternates
date: 2026-10-13
status: Draft
summary: A comment can ask for options; the agent answers with alternates of one shot, chosen on the storyboard. A pin can cover a span of time.
spec:
---

## Intent

- Problem: When a shot is wrong but you do not know what you want, the only move is a comment and a whole new version that holds one guess. A second guess costs another round. A comment also lands on one moment, so "tighten this stretch" has to be described in words.
- Why: Rounds are the cost in Kinotta's loop. Seeing two or three answers to one comment side by side settles in one round what now takes several. Other tools already keep several takes of a shot; Kinotta has the pin to say why each one exists, which they lack.
- Proposed outcome: A comment can ask for options. The next version brings back that shot as two to four named alternates, each with a line saying what differs. You see them on the storyboard, pin on any of them, and put one in the reel. A pin can also cover a stretch of time, and the agent rebuilds only that stretch.
- Affected: the timing contract (ADR 0001) and `server/core/_internal/contract.ts`; comment pins, carry and batches (`types.ts`, `comments.ts`, `carry.ts`, `batch.ts`); the edit list (`edit-model.ts`); the Storyboard, shot sheet, lanes and comments panel in `web/src`; the stage (`web/src/stage`) so a still or player can show a given alternate; the render path; `skill/kinotta` (SKILL.md and `reference/contract.md`); `CONTEXT.md` (new terms Alternate and Span pin; changes to Pin, Comment batch, Shot); tests under `tests/core` and `tests/e2e`. Mockup: `docs/mockups/2026-10-13-alternates-in-storyboard.html`.
- Constraints:
  - Builds on `2026-10-12-live-edits-freeze-at-render.md`: choosing an alternate is an edit on the working reel, undoable, and frozen at a render or hand-off.
  - One card per shot on the storyboard. Alternates live inside the shot and do not change the shot count.
  - The word is "alternate". `CONTEXT.md` lists "take" under words to avoid.
  - `DESIGN.md` tokens and the One Light Rule. The alternates card is the only stacked paper at rest on the grid.
  - Existing versions and reels with no alternates open, check and render exactly as they do now.
  - AIMovieStudiov2 is AGPL-3.0. Its takes gallery is the idea only; no code from it is copied.
- Out of scope:
  - Manual tuning of an element's text, colour, size and timing (the Tune panel), including tuning inside an alternate. Separate plan.
  - Their Multi-angle. A code-built scene has no camera.
  - Clip speed and transitions.
  - Alternates for footage clips. Code-built shots first.
- Open questions:
  - O1: settled 2026-10-13. One page per alternate, on top of `2026-10-12-shots-as-parts.md`. No contract addition on the single page. This plan therefore waits for live edits and shots-as-parts to land.
  - O2: What happens to the alternates you did not use? They stay in the version they arrived in. Do they also travel into the next version, or stop there?
  - O3: Can one batch ask for options on more than one shot, and is four the ceiling?
  - O4: Can a span pin cross a shot boundary? And how does `kinotta check` prove that nothing outside the span changed, given that it already compares claimed and actual changed sections?
  - O5: settled 2026-10-13. A reminder only. Nothing is blocked; alternate A is in the reel until you choose another.
  - O6: How does a still or the player show alternate B of a frozen page? The stage needs a way to ask the page for it.

Decided with the owner in the 2026-10-13 preview session: the three-step flow in the mockup (ask with a pin, answer on the storyboard, choose and keep pinning); one card per shot; choosing is an edit, not a new version; Multi-angle is left out.

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-13
- Plan created with Intent only. Flow and three assumptions agreed from `docs/mockups/2026-10-13-alternates-in-storyboard.html`. Awaiting approval of the Intent and answers to O1 to O6 before Goal and Approach.
- O1 and O5 settled by the owner from the questions screen: one page per shot, and the unchosen shot is a reminder only. Order of work is now live edits, shots as parts, then this plan. O2, O3, O4 and O6 remain open.
