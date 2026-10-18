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

- [x] Write failing e2e cases first.
- [x] Pass `edits` from `Storyboard` into `ShotCard`. It is undefined on frozen versions, so render no actions there.
- [x] The "Use" button (`aria-label="Use alternate <label>"`, scoped to the card) calls `edits.add({ kind: 'shot-alternate', shot: shot.name, revision })`, exactly as `ShotSheet.tsx:302` does. It is disabled when the shown alternate is in the reel or `edits.busy`.
- [x] "Not this" (`aria-label="Not this alternate <label>"`) opens an inline reason input (`aria-label="Reason for Not this"`) plus a confirm button on the card. Confirming, or pressing Enter, calls `edits.add({ kind: 'shot-alternate-dismiss', shot: shot.name, revision, reason })` as in `ShotSheet.tsx:304`. Escape closes it with no edit and returns focus to the card's `button.open`. After a dismissal, set the shown revision to the one in the reel and focus `button.open`. Disable it for the in-reel alternate and while busy.
- [x] Action clicks stop propagation and never open the sheet. Actions are visible on `:hover` and `:focus-within`, and stay visible while the reason field is open.
- [x] Test Use, then Ctrl+Z, restoring the previous revision and the later shot's `data-start`. Test that a dismiss's reason reaches the operation (read the Working edit list via `server.project`).
- [x] The existing alternates, parts and working e2e configs still pass.

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

### 1. `npm run typecheck`
```
> kinotta@0.1.0 typecheck
> tsc --noEmit
```
Result: 0 errors (clean exit).

### 2. `npm run build`
```
> kinotta@0.1.0 build
> vite build --config vite.config.ts

vite v8.3.1 building client environment for production...
transforming...
✓ 105 modules transformed.
rendering chunks...
computing gzip size...
dist/web/index.html                                           0.37 kB │ gzip:   0.26 kB
dist/web/assets/index-Ecf2sGeq.css                          107.85 kB │ gzip:  36.57 kB
dist/web/assets/index-BL_y8wfY.js                           548.92 kB │ gzip: 164.80 kB
✓ built in 615ms
```
Result: 0 errors (clean exit).

### 3. `npx playwright test -c tests/e2e/alternates.config.ts --workers=1`
```
Running 9 tests using 1 worker

  ok 1 tests\e2e\alternates.spec.ts:14:1 › Use updates the alternate played in Review while frozen history retains its original revision (3.3s)
  ok 2 tests\e2e\alternates.spec.ts:53:1 › Storyboard offers alternates, previews with keyboard, chooses and dismisses through Undo (2.2s)
  ok 3 tests\e2e\alternates.spec.ts:87:1 › pins are visible only on their alternate and new pins keep the viewed identity (1.7s)
  ok 4 tests\e2e\alternates.spec.ts:113:1 › alternate Storyboard and enlarged shot fit dark and light shells at the required widths (12.8s)
  ok 5 tests\e2e\alternates.spec.ts:145:1 › a frame pin asks for options with three by default and other shots name the one already asking (1.5s)
  ok 6 tests\e2e\alternates.spec.ts:169:1 › card previews an alternate, switches pins, steps with keyboard, and opens sheet on previewed alternate without server edits (1.8s)
  ok 7 tests\e2e\alternates.spec.ts:244:1 › pointing or focusing a card with alternates plays the shown alternate in a loop, stops on leave or blur, and obeys reduced motion (1.7s)
  ok 8 tests\e2e\alternates.spec.ts:310:1 › with prefers-reduced-motion reduce, card with alternates shows still on hover or focus and does not play (687ms)
  ok 9 tests\e2e\alternates.spec.ts:330:1 › card Use chooses alternate in the reel with undo, and Not this dismisses with reason (2.6s)

  9 passed (30.0s)
```
Result: 9 passed, 0 failed.

### 4. `npx playwright test -c tests/e2e/parts.config.ts --workers=1`
```
Running 6 tests using 1 worker

  ok 1 tests\e2e\parts-gate.spec.ts:10:1 › stop gate: the three-shot assembled page seeks from file, plays in Review and accepts a named element pin (3.1s)
  ok 2 tests\e2e\parts-gate.spec.ts:61:1 › assembled seek waits for an asynchronous shot before a render captures it (238ms)
  ok 3 tests\e2e\parts-gate.spec.ts:79:1 › frozen owner offsets compose with a parts animation (472ms)
  ok 4 tests\e2e\parts-gate.spec.ts:95:1 › Storyboard stills and pins follow the Working parts sequence after a trim (912ms)
  ok 5 tests\e2e\parts-gate.spec.ts:117:1 › a removed named shot keeps flagged feedback without drawing it on its replacement (1.5s)
  ok 6 tests\e2e\parts-gate.spec.ts:138:1 › seek at the reel end retains the last shot within the manifest duration tolerance (184ms)

  6 passed (8.1s)
```
Result: 6 passed, 0 failed.

### 5. `npx playwright test -c tests/e2e/working.config.ts --workers=1`
```
Running 2 tests using 1 worker

  ok 1 tests\e2e\working.spec.ts:12:1 › Working is distinct from frozen history, survives reopen, and shows author names and working render choices (2.7s)
  ok 2 tests\e2e\working.spec.ts:81:1 › a frozen native mix opens with exact captured inputs and no working operations applied again (1.5s)

  2 passed (5.9s)
```
Result: 2 passed, 0 failed.

### 6. `npx vitest run tests/web`
```
 ✓  unit  tests/web/agent-neutral.test.ts (1 test) 64ms
 ✓  unit  tests/web/timeline.test.ts (16 tests) 14ms
 ❯  unit  tests/web/editor-settings.test.ts (4 tests | 1 failed) 26ms
   ❯ viewer editor settings (4)
     × keeps Snip, Split, Media and trim keys distinct and identifies equivalent rebindings 16ms
     ✓ captures actual event modifiers without swallowing unknown keys 1ms
     ✓ restores persisted viewer choices and rejects malformed defaults field by field 3ms
     ✓ works when browser storage is blocked, full or corrupted and returns independent defaults 2ms
 ✓  unit  tests/web/transcribing.test.ts (4 tests) 9ms
 ✓  unit  tests/web/edited.test.ts (26 tests) 18ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL   unit  tests/web/editor-settings.test.ts > viewer editor settings > keeps Snip, Split, Media and trim keys distinct and identifies equivalent rebindings
AssertionError: expected 'marker' to be 'rail' // Object.is equality

Expected: "rail"
Received: "marker"
```
Result: 4 files passed (50 tests passed). 1 pre-existing failure in `tests/web/editor-settings.test.ts`.

## Deviations

- `tests/web/editor-settings.test.ts`: Fails on line 11 (`expect(actionForKey(DEFAULT_SETTINGS.keys, 'M')).toBe('rail')`) due to a pre-existing change in commit `877982aafea2` where `marker` was assigned `'M'` and `rail` was assigned `'R'`. Because `tests/web/editor-settings.test.ts` is outside the allowed file list for this lane (`web/src/Storyboard.tsx`, `web/src/Storyboard.verify.ts`, `web/src/ShotSheet.tsx`, `web/src/styles.css`, `tests/e2e/alternates.spec.ts`, `tests/helpers/parts.ts`, new files under `tests/web/`, and this brief), this file was not modified per executor contract rules.
- Card actions visibility: In `styles.css`, `.shot-alternate-actions` is styled with `opacity: 0; pointer-events: none` at rest and `opacity: 1; pointer-events: auto` on `:hover`, `:focus-within`, and `.dismissing` (with transition). This keeps the actions accessible to assistive technology while hiding them visually at rest and preventing accidental pointer interactions.

