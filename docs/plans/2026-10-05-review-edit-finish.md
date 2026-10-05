---
title: Finish pass on Review and Edit (T47)
date: 2026-10-05
status: Done
summary: T47. Lane B finish on the Review tab and New reel screen: critique and audit recorded, keyboard path to a stretch and arrow nudging added, DESIGN.md updated.
spec: docs/tickets-review-edit.md T47 (#49); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: The Review tab and New reel screen are built but have had no finish pass; the keyboard could not choose a stretch to snip, and T39 left arrow nudging unbuilt.
- Why: PRODUCT.md promises keyboard access to every control and AA contrast.
- Proposed outcome: Critique and audit findings resolved or recorded, an AA and keyboard-only pass of snip and Save, DESIGN.md matching the built surfaces.
- Affected: `web/src/review`, `web/src/stage` (ElementLayer), `DESIGN.md`, `.impeccable/critique`.
- Constraints: The mockup `docs/mockups/2026-10-05-review-edit.html` is the decision; the look does not change.
- Out of scope: the drop zone (T42) and brief form (T45), on unmerged branches.
- Open questions: none.

## Goal

T47's three criteria met for what is on this branch.

## Approach

Critique and audit by hand (no sub-agents) against CRAFT.md, DESIGN.md and the mockup plus `detect.mjs`; fix what they and a keyboard pass show; record the rest; update DESIGN.md.

## Steps

1. Critique, audit, contrast, motion and keyboard review.
2. Fixes: `[` and `]` stretch marks, arrow nudging, `.rv-problem` scoping.
3. e2e: nudge in clips.spec.ts, a keyboard-only spec in snip-save.spec.ts.
4. DESIGN.md, notes in `.impeccable/critique/`.

## Risks

- Arrow keys now mean two things (step, or nudge when an element is selected).

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, the touched e2e specs through a scratch config.

## Changelog

### 2026-10-05
- Plan created. Done. See the session summary.
