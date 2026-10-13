---
topic: live-edits-parts-alternates
date: 2026-10-14
plan: ../../plans/2026-10-12-live-edits-freeze-at-render.md, ../../plans/2026-10-12-shots-as-parts.md, ../../plans/2026-10-13-alternates.md
base-branch: feat/live-edits
---

# Lane manifest: live-edits-parts-alternates

| # | Lane | Agent | Model | Worktree | Branch | Status |
|---|---|---|---|---|---|---|
| 1 | chain | codex | gpt-6.1-sol, medium (owner's choice, 2026-10-13) | (set at dispatch) | agent-loop/live-edits-parts-alternates/chain | briefed |

One lane by the owner's decision: one continuous run across three plans, in order. Each plan builds on the one before, so they cannot run in parallel.

## Files per lane

- **chain:** `server/core/**`, `server/http/**`, `server/cli.ts`, `server/editor-client.ts`, `bin/kinotta.mjs`, `web/src/**`, `tests/**`, `skill/kinotta/SKILL.md`, `skill/kinotta/reference/**`, `CONTEXT.md`, `docs/adr/**`.

The fence is wide because the three plans together touch the core, the HTTP layer, the CLI, the editor and the skill. It still excludes `docs/plans/**`, `docs/mockups/**`, `docs/session-summaries/**`, `docs/briefs/**` other than the lane's own brief, `skill/kinotta/engine/**`, `skill/kinotta/scripts/**`, `README.md`, `PRODUCT.md`, `DESIGN.md`, `package.json` and the lockfile.

## Overlaps

None between lanes; there is one lane.

One overlap with work outside this set: `docs/plans/2026-10-13-viewer-transport-clips.md` will edit `web/src/review/_internal/MediaEditor.tsx`, `Player.tsx`, `Review.tsx`, `editor-settings.ts` and `review.css`, which this lane also edits in Part 1 step 5 and Part 3 step 8. That plan is not started. Starting it on the base branch before this lane is merged means merge conflicts in those files.

## Type overlaps

All changes and all their consumers are in the one lane, so nothing crosses a lane boundary.

| Changed type or signature | Definition path and lane | Affected paths and lanes | Required companion edits | Resolution |
|---|---|---|---|---|
| `Operation` union: every operation gains who made it; new `shot-alternate`, `shot-alternate-dismiss` | `server/core/_internal/edit-model.ts`, chain | `edit-list.ts`, `save.ts`, `code-edits.ts`, `server/core/model.ts`, `web/src/review/_internal/useEdits.ts`, `EditsPanel.tsx`, `edited.ts`, tests building operations | Operation fixtures in `tests/core` and `tests/web`; the Edits list rendering | Same lane |
| `Shot`: gains `name`, `revision`, `alternates` | `server/core/_internal/types.ts`, chain | `version.ts`, `contract.ts`, `carry.ts`, `batch.ts`, `web/src/Storyboard.tsx`, `ShotSheet.tsx`, `sections.ts`, `web/src/api` | Shot fixtures; all three fields optional on contract 1 versions because those versions do not have them | Same lane |
| `FramePin` and `NewFramePin`: gain `shotName`, `alternate` | `types.ts`, chain | `comments.ts`, `carry.ts`, `batch.ts`, `web/src/useComments.ts`, `Pins.tsx`, `stage/_internal/PinFrame.tsx` | Pin fixtures; optional because existing saved pins lack them | Same lane |
| `NewComment` and `Comment`: gain `options` | `types.ts`, chain | `comments.ts`, `batch.ts`, `CommentsPanel.tsx`, `ShotSheet.tsx` | Comment fixtures | Same lane |
| `Version`: gains the manifest's shared revision; Save becomes a freeze | `types.ts`, `save.ts`, chain | `server/core/index.ts`, `server/http/_internal/handler.ts`, `web/src/api/_internal/client.ts`, `Renders.tsx`, `App.tsx` | HTTP routes and the one API client | Same lane |

Checked by reading `types.ts` (Shot, Version, FramePin, WordPin, Comment, NewComment), `edit-model.ts` (the operation interfaces), `save.ts` (`saveCodeOnly`), `batch.ts`, `web/src/Storyboard.tsx` and `ShotSheet.tsx`. Not checked exhaustively: every test file that builds a `Shot`, a pin or an operation by object literal. The lane owns all of `tests/**`, so any such fixture is in scope.

## Merge order

1. Only one lane.

## Notes

- No `AGENTS.md` at the repo root. `~/.codex/AGENTS.md` exists and has the "Agent loop standing rules" section, so the git contract reaches Codex. Repo-specific rules are carried in the brief's Context section instead.
- `reels/`, `footage/` and `.kinotta-server.json` are untracked on purpose and will not exist in the worktree. Tests use `tests/fixtures`.
- `/impeccable critique`, `/impeccable audit`, session summaries and the plans dashboard are the reviewer's work at re-entry, not the lane's.
- Codex CLI at export: installed 0.160.1, latest 0.162.1.
