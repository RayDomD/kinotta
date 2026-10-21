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

- [x] 1. Edit `web/src/review/_internal/MediaEditor.tsx`:
  - Line 480: `else if (action === 'remove' && selected) void edits!.add({ kind: 'placement-remove', placement: selected, leaveGap: true });`
  - Line 489: `else if (action === 'apply' && snipRange && !version!.code) void edits!.add({ kind: 'placement-snip', ...snipRange, ...(fast ? {} : { leaveGap: true }) }).then((ok) => { if (ok) { playback.seek(snipRange.from); setSnipRange(null); setTool('select'); } });`
  - Line 501: include `'apply'` in the shifted-action allowlist: `['left', 'right', 'up', 'down', 'apply'].includes(shiftedAction)`.
  - Line 594: `onClick={() => act(() => { void edits!.add({ kind: 'placement-remove', placement: p.id, leaveGap: true }); })}`
  - Line 599: update `.editor-snip-confirm` to show ``Remove ${(snipRange.to - snipRange.from).toFixed(2)}s, keep the gap`` and a Shift hint (e.g. `Shift closes the gap`), and wire `Apply snip` button `onClick={(event) => runAction('apply', event.shiftKey)}`.
- [x] 2. Edit `web/src/review/_internal/ClipSettings.tsx`:
  - Line 108: update the `Remove` button to call `void edits!.add({ kind: 'placement-remove', placement: p.id, leaveGap: true })`.
- [x] 3. Run `npm run typecheck`, `npm run build` (required so `server/main.ts` serves the updated `dist/web` bundle in the e2e test), and `npx vitest run tests/core/render-native-lanes.test.ts` and confirm all pass (green).

## Contract

- Work ONLY this brief. No scope creep, no drive-by refactors.
- Edit ONLY the files listed in Scope.
- Run `npm run typecheck`, `npm run build`, and `npx vitest run tests/core/render-native-lanes.test.ts`. Paste commands and output under `## Test evidence` in this file.
- NEVER commit, push, branch, or run any git write. Leave the tree dirty.
- Record any deviations under `## Deviations` in this file.

## Test evidence

```bash
$ npm run typecheck

> kinotta@0.1.0 typecheck
> tsc --noEmit
```

```bash
$ npm run build

> kinotta@0.1.0 build
> vite build --config vite.config.ts

vite v8.3.1 building client environment for production...
transforming...
✓ 106 modules transformed.
rendering chunks...
computing gzip size...
dist/web/index.html                                           0.37 kB │ gzip:   0.27 kB
dist/web/assets/doto-latin-700-normal-B677g5ff.woff           5.45 kB
dist/web/assets/doto-latin-800-normal-tSOjizXO.woff           5.46 kB
dist/web/assets/outfit-latin-ext-500-normal-zeox_O30.woff2    6.24 kB
dist/web/assets/outfit-latin-ext-400-normal-5tcqmc2S.woff2    6.38 kB
dist/web/assets/outfit-latin-ext-600-normal-B85nYjL1.woff2    6.52 kB
dist/web/assets/outfit-latin-ext-500-normal-DrCvqoFD.woff     8.49 kB
dist/web/assets/outfit-latin-ext-400-normal-DHm7mdGe.woff     8.64 kB
dist/web/assets/outfit-latin-ext-600-normal-CWJcPgd7.woff     8.75 kB
dist/web/assets/outfit-latin-500-normal-DKnIMDSk.woff2       13.52 kB
dist/web/assets/outfit-latin-400-normal-BGsTXAXT.woff2       14.03 kB
dist/web/assets/outfit-latin-600-normal-B7SfZ07L.woff2       14.14 kB
dist/web/assets/outfit-latin-500-normal-ClnHRwRh.woff        17.68 kB
dist/web/assets/outfit-latin-400-normal-DMwTpYkH.woff        18.23 kB
dist/web/assets/outfit-latin-600-normal-BEfTtDA7.woff        18.41 kB
dist/web/assets/index-CFkuZAOM.css                          107.73 kB │ gzip:  36.54 kB
dist/web/assets/index-DURnoKnA.js                           552.47 kB │ gzip: 165.83 kB

✓ built in 520ms
```

```bash
$ npx vitest run tests/core/render-native-lanes.test.ts

 RUN  v5.0.2 C:/FIles/Projects/Apps/Kinotta/.worktrees/remove-leaves-gap-editor

 ✓  render  tests/core/render-native-lanes.test.ts (2 tests) 12907ms
   ✓ drags native sound between owners, detaches insert sound, trims and changes a fade without moving footage 7632ms
   ✓ leaves a gap on Delete and Apply snip so later clips keep their times, and closes the gap with Shift 5272ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  15:28:41
   Duration  14.50s (tests 90%, transform 5%, import 4%)
```

## Deviations

None.
