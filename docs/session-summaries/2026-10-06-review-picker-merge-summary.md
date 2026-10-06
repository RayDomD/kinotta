# Review and Picker in one tab: summary

Started 2026-10-06; completed 2026-10-07. Plan: `docs/plans/2026-10-06-review-picker-merge.md`.

## Shipped

- Review has Approve or Withdraw and a Render settings popover beside the reel title. The top-bar Renders menu shows the project queue and the open reel's past renders. Finished files play in Review. The phase navigation has Storyboard and Review.
- A screen reader status describes the current render state without announcing every percentage change. A reel switch clears the prior reel's settings and render history while the new data loads. Failed requests show their reason and leave Render disabled.
- Two browser tests now wait for the page and focus Review before keyboard seeks, avoiding races in the full suite.

## Review and deviations

- Impeccable critique used separate design and detector assessments, followed by a live browser inspection of Review and both menus. The detector reported no findings. The reel-switching and silent-error findings were fixed. The project-wide queue scope label and long approval warning layout remain minor observations outside this merge's chosen mockup.
- The rewritten merge specs were not run red first during the original build. `.pop` was renamed to `.popover` because `.pop` was already used by the pin popover. The new reel-switch regression test failed before its fix and passed afterward.
- GitHub PR #53 was already merged before this handoff resumed. No PR edit, ready action, or push was made here.

## Checks

- `npm run typecheck`: clean.
- `npx vitest run --maxWorkers=1`: 46 files, 441 passed, 1 skipped.
- `npx playwright test --workers=1 --reporter=line`: 110 passed. The first full run had two keyboard test failures under load; after the readiness and focus changes, the affected files passed 13/13, and the final full run passed.
- `node C:\Users\ryand\.codex\skills\impeccable\scripts\detect.mjs --json web/src/Renders.tsx`: `[]`.
