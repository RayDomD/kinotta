# movable-shots-save-fixes

Plan: `docs/plans/2026-10-12-movable-shots-save-fixes.md`

## Shipped

- Saving a shot move keeps each storyboard still at the same moment of its shot (`stillTime` in `code-edits.ts`, used by `save.ts`). Before, every still moved to its scene's first frame.
- `writeSceneTiming` replaces only the changed `data-start` and `data-duration` values in the page source, and adds or replaces the duration script only when the reel length changed. Before, the whole page was reserialised through the HTML parser.

## Deviations

None. F3 (reel length after a shot moves later and back) was left as decided in D3 of the movable-shots plan.

## Checks run

- `npm run typecheck`: passed.
- `npx vitest run` on movable-shots, code-only-edits, edited, render-movable-shots and render-save: 5 files, 40 tests passed. The new test failed before the fix.
- The rewrite on a scratch copy of showcase v15 changed three lines only.
