---
title: Review and Picker in one tab
date: 2026-10-06
status: Done
summary: Picker folds into Review (option C): Approve and a Render popover by the reel title, the queue and past renders in the top-bar render menu, finished renders playing in Review's player.
spec: docs/specs/2026-10-05-approve-and-render.md
---

## Intent

- Problem: approving and rendering live on a separate Picker tab, so the owner switches tabs between editing a version and signing it off or rendering it.
- Why: the owner asked to consolidate Picker and Review (2026-10-06) and chose option C in the preview.
- Proposed outcome: one Review tab that edits, approves and renders, built to `docs/mockups/2026-10-06-review-picker-merge.html` option C.
- Affected: `web/src/App.tsx`, `web/src/Picker.tsx` (becomes `web/src/Renders.tsx`), `web/src/lastTab.ts`, `web/src/review/_internal/Review.tsx` (an `actions` slot; `label` and `above` go), `web/src/styles.css`, the review README, `tests/e2e/picker.spec.ts`, `tests/e2e/renders.spec.ts`, `tests/e2e/smoke.spec.ts`.
- Constraints: the saved mockup; DESIGN.md (zero radius, one light, stacked paper only for things in hand); the render API, settings, refusal reasons and queue behaviour stay as they are. Server unchanged.
- Out of scope: the versions table (option C drops it; the rail's versions and approval mark stay); render quality presets.
- Open questions: None.

## Goal

The phase nav has Storyboard and Review only. Review's header has Approve or Withdraw for the version on show and Render ▾, a popover with preset, the four settings and Render. The top-bar render status is a button on every tab that opens the queue (with Cancel) and the open reel's past renders (Play, Show in folder). Play and the ready notice's Play show the file in Review's player with a way back. A reel remembered on Picker opens in Review.

## Approach

- `Renders.tsx` keeps Picker's pieces, rearranged: `VersionActions` (Approve or Withdraw, the approve warning), `RenderPopover` (the render form from `PickerSide`), `RenderMenu` (top-bar button and dropdown: queue, failure, past renders), `RenderPlayer` unchanged. `VersionsTable` and `PickerSide` go.
- Review gains `actions?: ReactNode`, shown at the end of its head row; `label` and `above` go (no other caller).
- App: `PHASES` is Storyboard and Review. In Review, a playing render replaces Review's player as Picker did. The ready notice's Play opens Review. `lastTab` reads a stored `Picker` as `Review`.
- Popover and dropdown: anchored to their buttons, close on Escape and an outside click, focus moves into them on open and back on close. ease-out 160 ms opacity and scale from 0.97, origin at the trigger.

## Steps

1. Rewrite `picker.spec.ts` and `renders.spec.ts` against the header actions and the render menu; `smoke.spec.ts` for two phases. See them fail.
2. `Renders.tsx`, Review's slot, App wiring, `lastTab`, styles.
3. READMEs. `/impeccable critique` and `audit` on the header and menu.

## Risks

- The render menu holds past renders only for the open reel; another reel's finished render is reached through the ready notice, as before.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, `picker.spec.ts`, `renders.spec.ts`, then the full Playwright suite (also covering the two earlier pieces on this branch).

## Changelog

### 2026-10-06
- Plan created after the owner chose option C; In Progress.
- Built and committed. Passed: typecheck, `picker.spec.ts` 2/2, `smoke.spec.ts` 2/2. Not yet run (stopped by Claude Code for low memory): `renders.spec.ts`, full vitest and Playwright, `/impeccable critique` and `audit`. Stays In Progress until those pass.

### 2026-10-07
- Finished the pending checks and UI review. The full unit suite passed (441 passed, 1 skipped), and the final full Playwright suite passed (110). Typecheck and the Impeccable detector were clean.
- Fixed review findings: render status is announced to screen readers; switching reels clears the previous render settings and past renders; failed settings or render-list requests show their error instead of an empty or disabled form with no reason. Added a reel-switch browser test.
- Stabilized two keyboard tests by waiting for the page and focusing Review before sending seek keys. The rewritten merge specs were not run red first; `.pop` became `.popover` because `.pop` already names the pin popover. The reel-switch test was run red before its fix.
- PR #53 was already merged when this handoff resumed, so its body and draft state were not changed.
