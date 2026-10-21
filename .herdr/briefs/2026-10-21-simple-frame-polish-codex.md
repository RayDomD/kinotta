# Brief: simple mode frame, run timer, and impeccable polish (codex)

Worktree: `.worktrees/simple-mode`, branch `feat/simple-mode`. Commit here; do not push.

## Goal
1. Implement the approved plan `docs/plans/2026-10-21-simple-frame-and-run-timer.md` (frame matches the reel shape, 16:9 today; visible `m:ss` agent run timer ticking each second, total shown at end). Set the plan's status to In Progress, then Done.
2. Then run an impeccable Lane B pass on the simple-mode surface only: `/impeccable critique` -> `/impeccable audit` -> only the verbs those flag -> `/impeccable polish`. Before starting, read `~/.claude/reference/ui.md` and `~/.claude/reference/craft.md`, plus `DESIGN.md`, `PRODUCT.md`, and the simple-mode mockups in `docs/mockups/2026-10-2*-simple-*.html`. A mockup is the decision: refine, don't redesign. If critique says the look itself is wrong (Lane C), stop and report instead of redesigning.

## Files in scope
`web/src/SimpleMode.tsx`, `web/src/simple.css`, `web/src/simple-options.ts`, `tests/e2e/simple-mode.spec.ts`, the plan file, a new session summary `docs/session-summaries/2026-10-21-simple-frame-and-run-timer-summary.md`, and `docs/plans/index.html` (regenerate with `powershell -NoProfile -File docs/plans/build-plans-index.ps1`, never by hand).

## Do not touch
`server/**`, `web/src/review/**`, `web/src/styles.css`, the editor, `skill/**`, the two modified PNGs under `docs/session-summaries/2026-10-15-viewer-transport-clips/`. Cropping/portrait reels are out of scope.

## Notes
- A dev server is live: front end http://localhost:5174, API on 127.0.0.1:4317. Use it for screenshots; don't kill it.
- Simple mode's scroll fix is `3aed4b4` (`.sm-app` owns scrolling). Keep it.
- Commit at logical stops with Conventional Commits (`feat:`/`fix:`/`style:`), no AI signature, no `--no-verify`.

## Acceptance checks
- `npm run typecheck`, `npm run build` pass.
- `npm run test:e2e -- tests/e2e/simple-mode.spec.ts tests/e2e/review.spec.ts` pass, with new checks for frame aspect and timer advancing.
- Before/after screenshots at 1280x800 of the studio with a landscape reel and of the agent banner mid-run (Copy request is fine), saved under `tests/artifacts/simple-polish/`.
- The page still scrolls at a 500px-tall window.

When finished, append to the end of this brief: commits, checks with results, impeccable findings (fixed vs left), deviations.

## Update 2026-10-21 (owner)
- Goal 2 (impeccable) is removed; agy does it. Do Goal 1 only.
- Scope widened: you may change the `portrait={!!simple}` prop at `web/src/review/_internal/Review.tsx:450` (and only that) so simple mode stops forcing a portrait picture. Nothing else in `web/src/review/**`.
- Your uncommitted frame/timer edits from the run that hit "model at capacity" are still in the worktree; continue from them.

## Execution result 2026-10-21

- Completed Goal 1. Plan moved through In Progress to Done. Working content and server APIs were not changed; the existing dev server remains running.
- Commits: `1a8d3da` (`feat: match simple preview frame and show agent run timer`); documentation closeout is the commit containing this execution record (`docs: complete simple frame and timer plan`). No push.
- Checks: `npm run typecheck` PASS; `npm run build` PASS (existing bundle-size warning); `npm run test:e2e -- tests/e2e/simple-mode.spec.ts tests/e2e/review.spec.ts` PASS, 11/11 in 55.9s; `git diff --check` PASS.
- Verified 16:9 outer frames, a 1920×1080 authored iframe, timer advancement after one second without another poll, frozen server totals for all terminal states after reload, existing playback/pinning/clipboard/editor navigation, and scrolling at 500px height.
- Evidence: five committed PNGs under `tests/artifacts/simple-polish/`: before/after studio and agent banner at 1280×800, plus after-short at 1280×500. Agent banners use a simulated local response. The original default reel's footage did not render reliably in the actual pre-edit captures; final captures use the existing graphics options reel. These are not a same-reel content comparison.
- Impeccable findings: none produced or fixed; Goal 2 was removed by the owner and left to AGY. No subagents dispatched.
- Scope deviations authorized by owner: only the `portrait` prop in `Review.tsx`, then only the corresponding prop in `MediaEditor.tsx:568` after the exact iframe check showed that the active player independently forced portrait. No other Review code changed.
- Additional implementation detail: block flow in the existing `.sm-app` scrolling container prevents the wider studio from overlapping the request-to-copy disclosure; scroll ownership is preserved.
- Approval-review limitation: an attempt to temporarily restore committed source for better baseline screenshots was rejected because interruption could lose pending edits. It was not executed; actual before captures were retained. No source rollback remains necessary.
