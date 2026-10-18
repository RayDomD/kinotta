---
topic: inline-alternates-card
date: 2026-10-18
plan: ../../plans/2026-10-18-inline-alternates-card.md
base-branch: feat/inline-alternates-card
---

# Lane manifest: inline-alternates-card

| # | Lane | Agent | Model | Worktree | Branch | Status |
|---|---|---|---|---|---|---|
| 1 | card | agy | gemini-4-argon (effort set at dispatch) | (set at dispatch) | agent-loop/inline-alternates-card/card | briefed |

One lane. T1 to T3 are a linear chain in the same component, so splitting them would only create merge conflicts in `Storyboard.tsx`. The owner chose AGY with Gemini 4 Argon.

## Files per lane

- **card:** `web/src/Storyboard.tsx`, `web/src/Storyboard.verify.ts`, `web/src/ShotSheet.tsx` (only the new optional `initialRevision` prop), `web/src/styles.css`, `tests/e2e/alternates.spec.ts`, `tests/helpers/parts.ts` (fixture additions only), `tests/web/**` (new tests only), and this lane's brief (Test evidence and Deviations).

## Overlaps

None within this set. Outside it, `docs/plans/2026-10-18-codex-run-cleanup.md` is running on `fix/codex-run-cleanup` and touches `tests/core/**`, `server/core/_internal/render-queue.ts`, `server/http/_internal/handler.ts` and `DESIGN.md`. None of those are in this lane. `DESIGN.md` is deliberately excluded here, and the reviewer updates it at re-entry.

## Type overlaps

| Changed type or signature | Definition path and lane | Affected paths and lanes | Required companion edits | Resolution |
|---|---|---|---|---|
| `ShotSheetProps` gains optional `initialRevision?: string` | `web/src/ShotSheet.tsx`, card | `web/src/Storyboard.tsx` (only renderer), `tests/e2e/alternates.spec.ts` (drives through the UI, no props) | Storyboard passes it | Same lane. Optional, so existing callers stay valid. |
| `ShotCardProps` (module-private) gains shown, playing and edits fields | `web/src/Storyboard.tsx`, card | None outside the file | None | Same lane |

Checked by searching `ShotSheet` across `web/src` and `tests`: it is rendered only in `Storyboard.tsx`. `ShotSheet.verify.ts` reads DOM attributes, not props. `ShotCard` is not exported. No server type changes.

## Merge order

1. card, into `feat/inline-alternates-card`, then into `main` with the owner's go-ahead.

## Notes

- Standing rules: `AGENTS.md` exists at the repo root (AGY reads it). Its "Pending owner decision: inline alternatives" section describes this work.
- The base is `main` at `5f3a23d`. It is independent of the cleanup run, which works in the main checkout.
- `node_modules` must be junctioned into the worktree and removed before `git worktree remove`.
- Probe `gemini-4-argon-*` with the adapter's file-read probe before dispatch.
