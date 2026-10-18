---
agent: agy
lane: card
manifest: ./manifest.md
date: 2026-10-18
plan: ../../plans/2026-10-18-inline-alternates-card.md
---

# Brief: inline-alternates-card — lane card

Follow this brief exactly. Standing rules are in AGENTS.md.

Start by editing files: write the first failing T1 test in `tests/e2e/alternates.spec.ts` now. Do not write an execution plan or spawn research subagents. Work T1, then T2, then T3, and write your Test evidence and Deviations into this file, not only to stdout.

## Scope

Build T1, T2 and T3 from `docs/tickets-inline-alternates.md`: preview, play, choose and dismiss a shot's alternates on its Storyboard card. The behaviour reference is `docs/mockups/2026-10-18-inline-alternates-card.html`. Open it and try it before you start. The goals G1 to G6 are in `docs/plans/2026-10-18-inline-alternates-card.md`.

Out of scope: any server, core, HTTP or CLI change; changes to the shot sheet beyond the one optional prop below; `DESIGN.md`; docs; span pins; version compare; the engine (`skill/kinotta/engine/**`). No other lane runs in this set. A separate cleanup run in another checkout owns `tests/core/**`, `server/**` and `DESIGN.md`, so do not touch them.

Files you may edit: `web/src/Storyboard.tsx`, `web/src/Storyboard.verify.ts`, `web/src/ShotSheet.tsx` (only to add `initialRevision`), `web/src/styles.css`, `tests/e2e/alternates.spec.ts`, `tests/helpers/parts.ts` (fixture additions only), new files under `tests/web/`, and the Test evidence and Deviations sections of this brief.

## Execution checklist

### T1: Preview an alternate on the card

Plan goals G2 and G5.

- [x] Write failing e2e cases in `tests/e2e/alternates.spec.ts` (using `alternatesFixture`, as the existing cases do) for each acceptance box, then implement.
- [x] `ShotCard` keeps a `shownRevision`, which starts at the alternate with `inReel` and resets when the shot's undismissed alternates change. The still's `pageUrl` uses `alternatePageUrl(slug, version.number, shot.name, shownRevision, version.workingParts?.key)` when it differs from the reel's. The frame-pin filter uses the shown revision, by the same rule as `ShotSheet.tsx:227`.
- [x] The dots (`.shot-alternates i`) become `<button type="button">` with `aria-label="Show alternate <label>"` and `aria-pressed`. They keep `data-alternate-revision` and the `on` class for the in-reel dot, and add a `shown` class for the shown one. A click stops propagation and must not open the sheet. Give them a stacking order above `button.open`.
- [x] Up and Down on the focused `button.open` step through undismissed alternates, with `preventDefault`, and only when the card has two or more alternates. Enter and click still open the sheet.
- [x] The line reads `N alternates · X in the reel`, plus ` · previewing Y` when the shown alternate is not the one in the reel. Keep the `aria-label` in step with it.
- [x] `ShotSheet` takes an optional `initialRevision?: string`, used as the initial `viewedRevision`. `Storyboard` passes the opening card's shown revision.
- [x] `Storyboard.verify.ts`: add `data-verify-shown` to `shotVerifyAttrs`, plus invariants that the `.shown` marker's revision equals `data-verify-shown` and that the shown revision is among the undismissed markers. Update `cardFixtures` if needed. Run `cardInvariants` in the e2e case the way the existing spec does.
- [x] Assert that the Working version (`server.project.readWorkingVersion`) and the Edits list do not change after previewing.

### T2: Play on hover or focus

Plan goals G1 and G6.

- [x] Write failing e2e cases first.
- [x] `Storyboard` holds one `playingKey`. A card's `mouseenter` and `focusin` set it, and `mouseleave` and `focusout` (when focus leaves the card) clear it. Only cards with alternates take part.
- [x] The playing card renders `PagePlayer` (from `./stage/index.ts`) in place of `PageStill`, on the shown alternate's page, sized like the still. A `requestAnimationFrame` clock loops `time` over `[shot.start, shot.start + shownAlternate.duration)`. Cancel the frame on unmount and on change. Every other card keeps `PageStill`.
- [x] Switching the shown alternate while playing restarts at `shot.start`.
- [x] Under `prefers-reduced-motion: reduce`, render the still and do not loop. Check it with `matchMedia`, and test it with Playwright's `reducedMotion` option.
- [x] Assert that at most one `PagePlayer` iframe exists in the grid at any time, and none before the first hover.

### T3: Use and Not this on the card

Plan goals G3 and G4.

- [ ] Write failing e2e cases first.
- [ ] Pass `edits` from `Storyboard` into `ShotCard`. It is undefined on frozen versions, so render no actions there.
- [ ] The "Use" button (`aria-label="Use alternate <label>"`, scoped to the card) calls `edits.add({ kind: 'shot-alternate', shot: shot.name, revision })`, exactly as `ShotSheet.tsx:302` does. It is disabled when the shown alternate is in the reel or `edits.busy`.
- [ ] "Not this" (`aria-label="Not this alternate <label>"`) opens an inline reason input (`aria-label="Reason for Not this"`) plus a confirm button on the card. Confirming, or pressing Enter, calls `edits.add({ kind: 'shot-alternate-dismiss', shot: shot.name, revision, reason })` as in `ShotSheet.tsx:304`. Escape closes it with no edit and returns focus to the card's `button.open`. After a dismissal, set the shown revision to the one in the reel and focus `button.open`. Disable it for the in-reel alternate and while busy.
- [ ] Action clicks stop propagation and never open the sheet. Actions are visible on `:hover` and `:focus-within`, and stay visible while the reason field is open.
- [ ] Test Use, then Ctrl+Z, restoring the previous revision and the later shot's `data-start`. Test that a dismiss's reason reaches the operation (read the Working edit list via `server.project`).
- [ ] The existing alternates, parts and working e2e configs still pass.

## Context

- Vocabulary: say "alternate", never "take" (`CONTEXT.md`). An alternate is one revision of a shot. "In the reel" means it is the shot's current `revision`. Choosing is a Working edit, undoable, and frozen only at a Final or Overlay render or a comment hand-off.
- Data: `Shot` (`web/src/api`) has `name`, `revision`, `start`, `duration`, `choiceMade` and `alternates?: Array<{ revision, label, title, note, duration, dismissed?: { reason }, inReel }>`. Filter out `dismissed` everywhere, as the current code does. An alternate's `duration` can differ from the shot's.
- Existing patterns to copy: `ShotSheet.tsx:110-123` (view and step alternates), `:293-305` (strip and actions), `:138-140` (Up and Down keys). Keep the card's layout model: a non-interactive card with one stretched `button.open`, and real controls stacked above it.
- `PageStill` creates its iframe only once it scrolls into view. Do not mount any `PagePlayer` before a hover or focus.
- Styling: `web/src/styles.css` tokens only. `.shot.has-alternates` is the stacked paper, the only one on the grid at rest (One Light Rule). Use the existing ice accent (`--light` family in the app's tokens) for the shown dot ring and the Use button, as in the mockup.
- Verifiable React: components expose `data-verify-*` attributes, and invariants live in `*.verify.ts` and run in e2e. Follow the existing `cardInvariants` shape.
- Preserve: the animated alternate revisions and the fix that makes Review load the chosen Working revision. The first existing case in `alternates.spec.ts` covers this and must keep passing.
- Type change (from the manifest): `ShotSheetProps.initialRevision?: string`, which is optional. `Storyboard.tsx` is the only renderer of `ShotSheet`.

## Contract

- Work ONLY this brief. No scope creep, no drive-by refactors.
- Edit ONLY the files listed above. Files outside this list remain out of scope, whether another lane owns them or not.
- If a type change requires an out-of-scope edit or depends on another lane's unfinished work, stop the affected item and report it under Deviations: type or signature, affected paths, required edits, and the blocked acceptance criteria. Continue only independent in-scope items. Do not edit another lane's files, make required fields optional, add fallback values, use casts, or suppress errors merely to stay inside the lane. Preserve the intended contract. The reviewer must resolve the split before the blocked item resumes.
- TDD: failing test first, then the minimal implementation, matching existing style.
- Run typecheck and the relevant tests. Get them green for completed work. Paste commands and output under Test evidence, including any failures from a blocked type dependency. Do not mark blocked acceptance criteria complete or claim the lane passes.
- NEVER commit, push, branch, or run any git write. Leave the tree dirty.
- Record anything done differently, and why, under Deviations.

Commands:

```
npm run typecheck
npm run build
npx playwright test -c tests/e2e/alternates.config.ts --workers=1
npx playwright test -c tests/e2e/parts.config.ts --workers=1
npx playwright test -c tests/e2e/working.config.ts --workers=1
npx vitest run tests/web
```

## Test evidence

(The executor fills this in.)

## Deviations

(The executor fills this in.)
