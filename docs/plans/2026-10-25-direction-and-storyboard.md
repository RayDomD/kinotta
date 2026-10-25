---
title: Generate or tweak, Direction, effects library and pinned effects
date: 2026-10-25
status: Draft
summary: Start a reel with Generate now or Tweak first; Tweak adds a Direction step with presets and a Storyboard where effects are dragged and pinned, not built.
spec: docs/mockups/2026-10-25-start-generate-or-tweak.html, docs/mockups/2026-10-25-direction-step.html, docs/mockups/2026-10-25-effects-library.html, docs/mockups/2026-10-25-storyboard-pinned-effects.html
---

## Intent

- Problem: A reel's look depends on what someone types in a free-text brief and on which questions the agent happens to ask; nothing records it. The brief path for code-built reels is a name and a text box. Simple mode's type cards and dials cover footage only. Kinotta's 25 effect templates (`skill/kinotta/templates/effects`) never appear in the app, so an owner cannot ask for one by seeing it. A first draft can come out flat when the owner wanted something else, and the only fix is a comment round.
- Why: The owner's 2026-10-25 trial showed the agent can reach a much higher bar when told what is wanted (`docs/plans/2026-10-25-motion-graphic-quality.md`). The gap is capturing what is wanted before the build, without forcing one style on every reel and without slowing down people who just want their video edited.
- Proposed outcome, from the mockup session with the owner (2026-10-25):
  - After a video is dropped, two choices: **Generate now** (uses the saved style, or Kinotta picks for a first reel; goes straight to a draft in Review) or **Tweak first**. A reel with no footage starts from a short brief.
  - **Direction** (Tweak first): what you are making (Talking video, Interview, Tutorial, Product demo, Vlog, Launch, Explainer, Showreel, Let Kinotta decide); Frame detected from the video (portrait, landscape, square); Style for video forms (Clean, Creator, Editorial, Match a reference) or Look for code-built forms (Flat 2D, Layered 2D, Filmed 3D, Match a reference); settings filled in by that choice and marked "yours" when changed; Fonts in plain words; effects to try; "Shots and details you want"; "What the agent is told"; Save as my style. The brief folds into it as "What's it about?", required only without footage.
  - **Effects library**: the 25 templates by category with a looping preview, what each needs, which forms it works with, a copyable request and favourites; tabs for looks, camera moves, transitions and the 17 existing sounds.
  - **Storyboard**: drag an effect onto a frame to pin it to a spot (numbered hex pin and footprint), onto a gap to plan a new shot, or onto the strip under a frame to try it as an alternate. Each pinned effect has a note, can be deleted (card, chip, Delete key) and undone. Nothing is built until the next build; pinned effects travel with it like a comment batch. Alternates keep the existing inline dots with a larger preview.
  - The saved choices (`direction`) travel in the request, so the agent reads them, and only the chosen style turns on its guidance and checks (`motion-craft.md` for Filmed 3D).
- Affected: `web/src/` (New reel, Simple mode Make, Storyboard, a new Direction and Library surface), `server/core/` (reel `direction` field, request building, pinned-effect batch items, templates listing), `skill/kinotta/` (reading `direction` and pinned effects), `DESIGN.md`, `CONTEXT.md`, possibly an ADR for pinned effects as batch items.
- Constraints: No style is enforced on every reel; presets are starting points and every value stays editable. Universal checks stay mechanical. A pinned effect is a request, not a Working change, until the agent builds it; Undo, frozen versions and the existing alternates fix (Review loads the chosen Working revision) must keep working. One light rule and the existing shell. Generate now must stay one step after the drop.
- Out of scope: Word editing and exact timing in Storyboard (they stay in Review). A separate Cut step. Building portrait reels (detection only; building depends on `docs/plans/2026-10-18-portrait-reels.md`, Draft). New effect templates. Render-side motion blur.
- Open questions:
  1. Is Direction a new screen in the existing shell, or does it replace New reel and Simple mode's Make screen (one entry point for both)?
  2. Where does "Save as my style" live: per machine like Simple mode's profile, per project, or both?
  3. Do pinned effects on footage reels build directly from the template with `fill` (no agent) when nothing is missing, or always go through the agent in the first version?
  4. Does Generate now for a returning user need the "Always do this?" rules from the Simple mode plan (Phase 6) first, or start with the saved style alone?

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-25
- Plan created as Intent only, from the mockup session with the owner. Four mockups saved under `docs/mockups/2026-10-25-*`. Waiting for approval of the Intent before the rest is filled.
