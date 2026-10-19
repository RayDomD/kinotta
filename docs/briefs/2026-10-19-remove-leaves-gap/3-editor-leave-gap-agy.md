---
agent: agy
lane: editor-leave-gap
manifest: ./manifest.md
date: 2026-10-19
plan: ../../plans/2026-10-19-remove-leaves-gap.md
---

# Brief: remove-leaves-gap — lane editor-leave-gap

Follow this brief exactly. Standing rules are in AGENTS.md.

Start immediately by editing `web/src/review/_internal/MediaEditor.tsx` and `web/src/review/_internal/ClipSettings.tsx`. Do not spawn subagents or write an execution plan. Write your Test evidence and Deviations into this brief file before finishing.

## Scope

Implement Step 3 of `docs/plans/2026-10-19-remove-leaves-gap.md`:
- In `web/src/review/_internal/MediaEditor.tsx`:
  1. `runAction`:
     - When `action === 'remove' && selected`, send `{ kind: 'placement-remove', placement: selected, leaveGap: true }`.
     - When `action === 'apply' && snipRange && !version!.code`, if `fast` (`Shift` held) is true, send `{ kind: 'placement-snip', ...snipRange }`; otherwise send `{ kind: 'placement-snip', ...snipRange, leaveGap: true }`.
  2. `onWindowKey`:
     - Allow `Shift` with the `apply` key binding (`Shift+Enter` by default) to trigger `apply` with `fast = true`: update `['left', 'right', 'up', 'down']` in `onWindowKey` (line 501) to `['left', 'right', 'up', 'down', 'apply']`.
  3. Clip context menu (`.editor-clip-menu`, line 594):
     - The `Remove` menu item sends `{ kind: 'placement-remove', placement: p.id, leaveGap: true }`.
     - The `Remove and close the gap` menu item continues to send `{ kind: 'placement-ripple-remove', placement: p.id }`.
  4. Snip confirm bar (`.editor-snip-confirm`, line 599):
     - Update the text span to read ``Remove ${(snipRange.to - snipRange.from).toFixed(2)}s, keep the gap`` and include a hint showing that `Shift` closes the gap (e.g., `<span className="meta">Shift closes the gap</span>` or inside the bar text).
     - Update the `Apply snip` button's `onClick` to pass `event.shiftKey`: `onClick={(event) => runAction('apply', event.shiftKey)}`.
- In `web/src/review/_internal/ClipSettings.tsx`:
  - Update the `Remove` button (line 108) to send `{ kind: 'placement-remove', placement: p.id, leaveGap: true }`.

Out of scope: `server/**`, `tests/**`, and any other `web/**` files outside the list below.
Files you may edit:
- `web/src/review/_internal/MediaEditor.tsx`
- `web/src/review/_internal/ClipSettings.tsx`
- `web/src/review/_internal/editor-settings.ts` (only if label/key adjustments are needed; `remove: Delete` and `closeGap: Shift+Delete` are already defined)
- `docs/briefs/2026-10-19-remove-leaves-gap/3-editor-leave-gap-agy.md`

## Execution checklist

- [ ] 1. Edit `web/src/review/_internal/MediaEditor.tsx`:
  - Line 480: `else if (action === 'remove' && selected) void edits!.add({ kind: 'placement-remove', placement: selected, leaveGap: true });`
  - Line 489: `else if (action === 'apply' && snipRange && !version!.code) void edits!.add({ kind: 'placement-snip', ...snipRange, ...(fast ? {} : { leaveGap: true }) }).then((ok) => { if (ok) { playback.seek(snipRange.from); setSnipRange(null); setTool('select'); } });`
  - Line 501: include `'apply'` in the shifted-action allowlist: `['left', 'right', 'up', 'down', 'apply'].includes(shiftedAction)`.
  - Line 594: `onClick={() => act(() => { void edits!.add({ kind: 'placement-remove', placement: p.id, leaveGap: true }); })}`
  - Line 599: update `.editor-snip-confirm` to show ``Remove ${(snipRange.to - snipRange.from).toFixed(2)}s, keep the gap`` and a Shift hint (e.g. `Shift closes the gap`), and wire `Apply snip` button `onClick={(event) => runAction('apply', event.shiftKey)}`.
- [ ] 2. Edit `web/src/review/_internal/ClipSettings.tsx`:
  - Line 108: update the `Remove` button to call `void edits!.add({ kind: 'placement-remove', placement: p.id, leaveGap: true })`.
- [ ] 3. Run `npm run typecheck`, `npx vitest run tests/web/editor-settings.test.ts`, and `npx vitest run tests/core/render-native-lanes.test.ts` and confirm all pass (green).

## Contract

- Work ONLY this brief. No scope creep, no drive-by refactors.
- Edit ONLY the files listed in Scope.
- Run `npm run typecheck`, `npx vitest run tests/web/editor-settings.test.ts`, and `npx vitest run tests/core/render-native-lanes.test.ts`. Paste commands and output under `## Test evidence` in this file.
- NEVER commit, push, branch, or run any git write. Leave the tree dirty.
- Record any deviations under `## Deviations` in this file.

## Test evidence

(The executor fills this in.)

## Deviations

(The executor fills this in.)
