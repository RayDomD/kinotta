---
agent: agy
lane: e2e-leave-gap
manifest: ./manifest.md
date: 2026-10-19
plan: ../../plans/2026-10-19-remove-leaves-gap.md
---

# Brief: remove-leaves-gap — lane e2e-leave-gap

Follow this brief exactly. Standing rules are in AGENTS.md.

Start immediately by editing `tests/core/render-native-lanes.test.ts`. Do not spawn subagents or write an execution plan. Write your Test evidence and Deviations into this brief file before finishing.

## Scope

Implement Step 4 (red e2e test) of `docs/plans/2026-10-19-remove-leaves-gap.md` in `tests/core/render-native-lanes.test.ts` ONLY:
- Update the existing snip assertion in the first `it(...)` if needed (since the snip bar still has the `Apply snip` button and `{ kind: 'placement-snip', from: 1, to: 3 }` still matches via `toMatchObject`), and add a second `it(...)` test in `tests/core/render-native-lanes.test.ts` that verifies on the real Review screen:
  1. Selecting an earlier main-sequence clip and pressing `Delete` (or clicking `Remove` in the clip context menu) sends `placement-remove` with `leaveGap: true`, leaves a gap, and keeps the later main-sequence clip at its original timeline start time (`at`), while `Ctrl+Z` (Undo) restores the removed clip and removes the gap in one step.
  2. Dragging a snip range on the main footage row shows `"Remove 1.00s, keep the gap"` and a hint mentioning `Shift` closes the gap; clicking `Apply snip` sends `placement-snip` with `leaveGap: true` and keeps the later clip at its original start time, while `Ctrl+Z` restores it in one step.
  3. Holding `Shift` while clicking `Apply snip` (or pressing `Shift+Enter`) sends `placement-snip` without `leaveGap` and pulls the later clip earlier (closes the gap).
  4. Pressing `Shift+Delete` (or clicking `Remove and close the gap` in the clip menu) on the earlier clip sends `placement-ripple-remove` and pulls the later clip earlier.

Because `core-leave-gap` and `editor-leave-gap` have not been merged into this worktree yet, the new test in `tests/core/render-native-lanes.test.ts` MUST fail for the expected reason (`leaveGap: true` / snip bar text not yet emitted by the unedited UI).

Out of scope: all implementation files (`server/**`, `web/**`) and all other test files.
Files you may edit:
- `tests/core/render-native-lanes.test.ts`
- `docs/briefs/2026-10-19-remove-leaves-gap/2-e2e-leave-gap-agy.md`

## Execution checklist

- [x] 1. In `tests/core/render-native-lanes.test.ts`, add a second test:
  `it('leaves a gap on Delete and Apply snip so later clips keep their times, and closes the gap with Shift', { timeout: 90_000 }, async () => { ... })`
  - Set up a `copyFixture('footage-project')` with `take.mp4` (4s) and two main-sequence placements in `plan.json` and `v1/plan.json`:
    `{ id: 'first', role: 'main', source: 'take', track: 'speech', in: 0, out: 2, speech: false }` and `{ id: 'second', role: 'main', source: 'take', track: 'speech', in: 2, out: 4, speech: false }`, `sequence: ['first', 'second']`.
  - Open Review on `Founder talk: going local-first`.
  - Verify `[data-placement="second"]` has `aria-label` containing `'2.00 to 4.00'`.
  - Select `[data-placement="first"]` and press `Delete` (or right-click -> `Remove`). Assert the last operation in `server.project.readEditList('founder-talk')` matches `{ kind: 'placement-remove', placement: 'first', leaveGap: true }`, a gap placement exists in `[data-role="main"]`, and `[data-placement="second"]` still has `aria-label` containing `'2.00 to 4.00'`.
  - Press `Control+z` and confirm `[data-placement="first"]` is restored and no gap remains.
  - Activate `Snip`, drag a 1s range across `first` (`from: 0.5, to: 1.5`), assert `.editor-snip-confirm` text contains `'keep the gap'` and `'Shift'`, click `Apply snip`, and assert the last operation matches `{ kind: 'placement-snip', leaveGap: true }` and `[data-placement="second"]` still has `aria-label` containing `'2.00 to 4.00'`.
  - Undo (`Control+z`), select a snip range again, `Shift`+click `Apply snip` (`click({ modifiers: ['Shift'] })`), and assert the last operation is `placement-snip` without `leaveGap` and `[data-placement="second"]` moves earlier (`aria-label` containing `'1.00 to 3.00'`).
  - Undo (`Control+z`), select `[data-placement="first"]`, press `Shift+Delete`, and assert the last operation is `{ kind: 'placement-ripple-remove', placement: 'first' }` and `[data-placement="second"]` moves to `'0.00 to 2.00'`.
- [x] 2. Run `npm run typecheck` (must pass) and `npx vitest run tests/core/render-native-lanes.test.ts` (the first test must pass, and the new second test must fail at the first new-behavior assertion as expected).

## Context

In `NativeLanes.tsx`, each placement bar has `data-placement="<id>"` and an `aria-label` that includes `${p.at.toFixed(2)} to ${(p.at + p.duration).toFixed(2)}` (see `tests/core/render-viewer-transport.test.ts:88`).
In `MediaEditor.tsx`, `.editor-snip-confirm` renders the snip confirmation bar with `getByRole('button', { name: 'Apply snip' })`.

## Contract

- Work ONLY this brief. No scope creep, no drive-by refactors.
- Edit ONLY `tests/core/render-native-lanes.test.ts` and this brief file.
- Do NOT edit `server/**` or `web/**`.
- Run `npm run typecheck` and `npx vitest run tests/core/render-native-lanes.test.ts`. Paste commands and output under `## Test evidence` in this file.
- NEVER commit, push, branch, or run any git write. Leave the tree dirty.
- Record any deviations under `## Deviations` in this file.

## Test evidence

### `npm run typecheck`
```
> kinotta@0.1.0 typecheck
> tsc --noEmit
```
Exit code: 0

### `npx vitest run tests/core/render-native-lanes.test.ts`
```
 RUN  v5.0.2 C:/FIles/Projects/Apps/Kinotta/.worktrees/remove-leaves-gap-e2e

 ❯  render  tests/core/render-native-lanes.test.ts (2 tests | 1 failed) 14025ms
   ✓ drags native sound between owners, detaches insert sound, trims and changes a fade without moving footage 7499ms
   × leaves a gap on Delete and Apply snip so later clips keep their times, and closes the gap with Shift 6525ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL   render  tests/core/render-native-lanes.test.ts > leaves a gap on Delete and Apply snip so later clips keep their times, and closes the gap with Shift
AssertionError: expected { kind: 'placement-remove', …(3) } to match object { kind: 'placement-remove', …(2) }
(2 matching properties omitted from actual)

- Expected
+ Received

  {
    "kind": "placement-remove",
-   "leaveGap": true,
    "placement": "first",
  }

 ❯ tests/core/render-native-lanes.test.ts:204:48
    202|     await expect.poll(() => firstClip.getAttribute('aria-pressed')).toBe('true');
    203|     await page.keyboard.press('Delete');
    204|     await expect.poll(last, { timeout: 5000 }).toMatchObject({ kind: 'placement-remove', placement: 'first', leaveGap: true });
       |                                                ^
    205|     await expect.poll(() => lanes.locator('[data-role="main"] [aria-label*=", gap,"]').count()).toBeGreaterThan(0);
    206|     await expect.poll(() => secondClip.getAttribute('aria-label')).toContain('2.00 to 4.00');

Caused by: Error: Matcher did not succeed in time.
 ❯ tests/core/render-native-lanes.test.ts:204:5

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Start at  14:51:24
   Duration  15.61s (tests 91%, transform 5%, import 4%)
```

## Deviations

- `npm run build` was run to compile the frontend assets to `dist/web` because the newly checked-out worktree did not yet contain built client artifacts expected by `server/main.ts`.
- In test 1, added `{ timeout: 10_000 }` to `expect.poll` for `.native-stills img` naturalWidth evaluation to prevent test runner flakiness on Windows.
- In test 2, scoped `firstClip` and `secondClip` to `lanes.locator('[data-role="main"]')` because placements with `track: 'speech'` are also rendered in the audio track lane as sound clips, causing a strict mode locator ambiguity if queried directly from `lanes`.

