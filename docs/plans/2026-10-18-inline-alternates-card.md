---
title: Inline alternates card
date: 2026-10-18
status: Done
summary: Preview, switch and choose a shot's alternates inside its stacked Storyboard card, with animated playback, without opening the shot sheet.
spec: AGENTS.md (Pending owner decision: inline alternatives)
---

## Intent

- Problem: A shot with alternates shows only a dot strip and "3 alternates · B in the reel" on its Storyboard card (`web/src/Storyboard.tsx:71`). To watch an alternate play or put one in the reel, you open the large shot sheet, so comparing options takes you out of the grid.
- Why: Alternates exist to settle a shot in one round. Comparing them where the shot sits, next to its neighbours, is faster than going back and forth through the chooser. The owner confirmed this direction after the alternates run.
- Proposed outcome: On the stacked card itself you can preview each alternate playing, step between them, and put one in the reel. The card keeps its alternate count and shows which option is in the reel.
- Affected: `web/src/Storyboard.tsx`, `web/src/ShotSheet.tsx` (its role may shrink), `web/src/styles.css`, the stage or player used for card previews, `web/src/api` (alternate page URLs already exist), `tests/e2e/alternates.spec.ts`, `*.verify.ts`, `DESIGN.md` (the card's states). Earlier context: `docs/mockups/2026-10-13-alternates-in-storyboard.html`, `docs/plans/2026-10-13-alternates.md`.
- Constraints:
  - Choosing an alternate stays a Working edit: it can be undone, it moves later shots by the parts rule, and it freezes at a render or hand-off.
  - Keep the existing animated revisions and the fix that makes Review load the chosen Working revision.
  - One card per shot. The alternates card stays the only stacked paper at rest on the grid (One Light Rule, `DESIGN.md` tokens).
  - Previews load lazily. A grid with many shots must not play every page at once.
  - Reels without alternates look and behave exactly as they do now.
  - "Not this" with an optional reason (N6) stays available somewhere.
- Out of scope: Span pins, version compare, the Tune panel, alternates for footage or single-page reels, and any change to how the agent builds alternates.
- Open questions:
  - O1: settled 2026-10-18. Hovering, or keyboard focus, plays the alternate shown on the card. Leaving the card stops it. Only one card plays at a time.
  - O2: settled 2026-10-18. The card's dots become clickable, and with the card focused the arrow keys step alternates. The keys match the shot sheet (`ShotSheet.tsx:138`): Up and Down step alternates, so the two surfaces never give the same key opposite meanings.
  - O3: settled 2026-10-18. Switching on the card only previews. A "Use" on the card puts the shown alternate in the reel as a Working edit.
  - O4: settled 2026-10-18. On the card, beside Use, for the shown alternate. "Not this" opens a small reason field on the card. The alternate in the reel cannot be dismissed (existing rule).
  - O5: settled 2026-10-18. The shot sheet keeps its alternates strip, Use and Not this unchanged. The card and the sheet both work and share the same Working edits.
  - O6: settled 2026-10-18. Pinning stays in the shot sheet. The card shows existing pins for the alternate it is showing. Clicking the card still opens the shot sheet.

## Goal

On a Working parts reel, a Storyboard card for a shot with two or more undismissed alternates behaves as in `docs/mockups/2026-10-18-inline-alternates-card.html`:

- G1: Pointing at the card, or giving it keyboard focus, plays the alternate it is showing as a loop of that alternate's own length, from the shot's start. Leaving or blurring the card returns it to a still. At most one card in the grid plays at a time. Every other card loads only its still, as it does now.
- G2: Clicking a dot, or pressing Up or Down while the card has focus, changes which alternate the card shows. The reel, Working and the Edits list do not change. The card's line reads "3 alternates · B in the reel · previewing C" while it shows an alternate that is not in the reel. The dot in the reel and the dot shown are visibly different. Frame pins on the card follow the shown alternate.
- G3: "Use" on the card adds the existing `shot-alternate` operation for the shown alternate. It is disabled for the alternate already in the reel, while edits are busy, and on frozen versions. Later shots move by the parts rule, and Ctrl+Z undoes it, both through the existing edit path.
- G4: "Not this" on the card opens a reason field on the card. Confirming adds the existing `shot-alternate-dismiss` operation with the reason, which may be empty. Escape cancels it. It cannot be used on the alternate in the reel. The card then shows the alternate in the reel.
- G5: Clicking the card, or pressing Enter on it, still opens the shot sheet, which opens on the alternate the card was showing. The shot sheet's strip, Use, Not this, pinning and keys are unchanged.
- G6: Cards for shots without alternates, single-page reels and frozen versions look and behave as they do now, apart from G1 playback on hover or focus, which applies only to cards with alternates.

## Approach

All of this is client-side in `web/src`. The server operations (`shot-alternate`, `shot-alternate-dismiss`), the alternate page route (`alternatePageUrl`) and the pin model already exist and do not change.

- **Card state.** `ShotCard` in `Storyboard.tsx` gains a `shownRevision`, which starts at the alternate in the reel and resets when the shot's alternates change. The still's page URL, the frame-pin filter and the line text read from it. The dots become buttons inside the card's alternates row. They stop event propagation so a click on a dot does not open the sheet.
- **Focus and keys.** Today the card is a non-interactive div with one stretched `button.open`. Keep that button as the focus target and handle Up and Down on it: step through undismissed alternates and `preventDefault` so the grid does not scroll. Enter and click still open the sheet.
- **Playback.** `Storyboard` holds one `playing` card key. `mouseenter` and `focusin` on a card set it, and `mouseleave` and `focusout` clear it. Only the playing card renders a `PagePlayer` (from `stage`) on the shown alternate's page, sized like the still, with a `requestAnimationFrame` clock that loops `time` from `shot.start` to `shot.start + alternate.duration`. Every other card keeps `PageStill`. The player is created on hover, not before, which keeps the grid's loading as it is. Respect `prefers-reduced-motion` by showing the still at the shot's start and not looping.
- **Actions.** `Storyboard` already receives `edits` (undefined on frozen versions), so pass it to `ShotCard`. Use and Not this call `edits.add` with the same payloads the shot sheet uses (`ShotSheet.tsx:302` and `:304`). The reason field is a small inline form on the card. While it is open it keeps the card's actions visible and the card playing state unchanged.
- **Opening the sheet.** `ShotSheet` takes an optional `initialRevision` that sets its `viewedRevision` on mount. `Storyboard` passes the opening card's `shownRevision`.
- **Styles** go in `web/src/styles.css`, using the existing tokens and the `.shot.has-alternates` paper. The actions show on hover and on `:focus-within`, and stay present for assistive technology.
- **Verification.** Extend `Storyboard.verify.ts` with `data-verify-shown` and invariants (the shown marker matches the shown revision, and the shown revision is undismissed). Extend `tests/e2e/alternates.spec.ts` against `alternatesFixture` for each goal.

## Steps

Tickets: `docs/tickets-inline-alternates.md`.

1. T1: Preview an alternate on the card (G2, G5): shown state, clickable dots, Up and Down, line text, pins, and the sheet opening on the shown alternate.
2. T2: Play on hover or focus (G1, G6): one player at a time, a loop of the alternate's length, reduced motion.
3. T3: Use and Not this on the card (G3, G4): edits through the existing operations, the reason field, undo.
4. Reviewer: `/impeccable critique` of the card states, a `DESIGN.md` update describing the card's states, a session summary, and the dashboard.

## Risks

- Playback cost: a `PagePlayer` per hover could stutter on a large grid. Mitigation: exactly one is mounted, and it is torn down on leave. Check this on a 12-shot fixture.
- Key conflicts: Up and Down on a focused card must not reach a grid or page handler that scrolls or changes sections. Test it.
- Click targets: dots and action buttons sit inside a card whose stretched button opens the sheet. They need their own stacking and propagation handling, or clicks will open the sheet.
- Focus loss: dismissing the shown alternate removes its dot, so focus has to land on the card button, not on `body`.

## Checks to run

- `npm run typecheck`, `npm run build`.
- `npx playwright test -c tests/e2e/alternates.config.ts`: new cases per goal, and the existing cases still pass.
- `npx playwright test -c tests/e2e/parts.config.ts` and `-c tests/e2e/working.config.ts` still pass.
- `npx vitest run tests/web` passes.
- Manually, in the running app on an alternates fixture: hover, keys, Use, Not this, undo, the sheet opening on the shown alternate, and reduced motion.

## Changelog

### 2026-10-18
- Plan created with Intent only, from the owner's inline-card decision recorded in `AGENTS.md`. Awaiting answers to O1 to O6 and approval of the Intent.
- O3 settled by the owner: preview on switch, "Use" to choose.
- O1 settled by the owner: hover or focus plays.
- O2 settled by the owner: clickable dots plus arrow keys, using the shot sheet's Up and Down for alternates.
- O4 settled by the owner: Not this on the card beside Use.
- O5 settled by the owner: the shot sheet keeps its strip.
- O6 settled by the owner: pinning stays in the shot sheet. All open questions are settled. Next: a card mockup, then Goal and Approach for approval.
- Behaviour mockup accepted by the owner: `docs/mockups/2026-10-18-inline-alternates-card.html`. Next: Goal and Approach.
- Goal (G1 to G6), Approach, Steps, Risks and Checks written. Tickets in `docs/tickets-inline-alternates.md`. One-lane AGY brief for Gemini 4 Argon in `docs/briefs/2026-10-18-inline-alternates-card/`. Awaiting the owner's approval of the split and the dispatch.
- T1, T2 and T3 implemented and verified on `agent-loop/inline-alternates-card/card` (`2fd80c0`, `b8c1318`, `c2a3d60`) and merged `--no-ff` into `feat/inline-alternates-card` (`91c35d4`). `DESIGN.md` updated with the inline alternates card states, `/impeccable critique` recorded in `docs/session-summaries/2026-10-18-inline-alternates-card-summary.md`, and dashboard regenerated. Awaiting the owner's go-ahead to merge to `main`.
- An independent review found five issues (R1 to R5), fixed under `docs/plans/2026-10-18-inline-alternates-card-review-fixes.md`. Still awaiting the owner's go-ahead to merge to `main`.
