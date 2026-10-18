---
title: Inline alternates card review fixes
date: 2026-10-18
status: Done
summary: Fix the five findings from the independent review of the inline alternates card before merging to main.
spec: docs/plans/2026-10-18-inline-alternates-card.md
---

## Intent

- Problem: The review of `feat/inline-alternates-card` found five issues: Storyboard Ctrl+Z ignores busy edits and has no redo (R1), a playing card drops footage and the unavailable state (R2), the whole card re-renders every animation frame (R3), generic `.acts` and `.reason` classes in the CSS (R4), and a stray trailing blank line (R5).
- Why: These should be fixed before the owner merges the branch to `main`.
- Proposed outcome: Undo and redo on the Storyboard behave as they do in Review, a card plays only when it can play correctly, and the card stays cheap while it plays.
- Affected: `web/src/Storyboard.tsx`, `web/src/Storyboard.verify.ts`, `web/src/styles.css`, `tests/e2e/alternates.spec.ts`.
- Constraints: Keep the behaviour of the inline alternates card plan (G1 to G6) and the existing tests.
- Out of scope: The `tests/web/editor-settings.test.ts` failure, which already fails on `main` at `5f3a23d`.
- Open questions: None.

## Goal

- R1: The Storyboard's Ctrl+Z does nothing while edits are busy, and Ctrl+Shift+Z and Ctrl+Y redo, matching `Review.tsx`.
- R2: A card whose shot is unavailable, or is a panel shot over footage, keeps its still on hover or focus.
- R3: Only the card's player re-renders on each animation frame.
- R4: The card's actions and reason field use only their `shot-alternate-*` classes.
- R5: `Storyboard.verify.ts` ends without a stray blank line.

## Approach

- R1: Extend the window key handler in `Storyboard` with the busy guard, the `defaultPrevented` check and the redo keys from `Review.tsx`.
- R2: Add the guard to `isPlaying` in `ShotCard`.
- R3: Move the `requestAnimationFrame` clock into a `CardPlayer` component that renders the `PagePlayer`.
- R4 and R5: Delete the generic class names and the blank line.

## Steps

1. R1, with a redo step added to the card Use/undo e2e test.
2. R2 and R3.
3. R4 and R5.
4. Checks, the changelogs in this plan and the card plan, the session summary, and the dashboard.

## Risks

- Moving the clock could change when playback restarts. The existing play test covers restarting on a switch.

## Checks to run

- `npm run typecheck`, `npm run build`.
- `npx playwright test -c tests/e2e/alternates.config.ts`, `parts.config.ts`, `working.config.ts`.
- `npx vitest run tests/web`.

## Changelog

### 2026-10-18
- Plan created from the review findings R1 to R5, and approved by the owner.
- R1 to R5 fixed in `52afb65`, `e2090d4` and `b6c2a37`. Checks passed apart from the existing `editor-settings` unit failure on `main`. Summary: `docs/session-summaries/2026-10-18-inline-alternates-card-review-fixes-summary.md`.
