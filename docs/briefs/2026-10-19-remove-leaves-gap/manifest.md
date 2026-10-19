---
topic: remove-leaves-gap
date: 2026-10-19
plan: ../../plans/2026-10-19-remove-leaves-gap.md
base-branch: feat/remove-leaves-gap
---

# Lane manifest: remove-leaves-gap

| # | Lane | Agent | Model | Worktree | Branch | Status |
|---|---|---|---|---|---|---|
| 1 | core-leave-gap | agy | gemini-3.8-flash-high | .worktrees/remove-leaves-gap-core | agent-loop/remove-leaves-gap/core-leave-gap | briefed |
| 2 | e2e-leave-gap | agy | gemini-3.8-flash-high | .worktrees/remove-leaves-gap-e2e | agent-loop/remove-leaves-gap/e2e-leave-gap | briefed |
| 3 | editor-leave-gap | agy | gemini-3.8-flash-high | .worktrees/remove-leaves-gap-editor | agent-loop/remove-leaves-gap/editor-leave-gap | briefed |

## Files per lane

- **core-leave-gap:** `server/core/_internal/edit-model.ts`, `tests/core/media-model.test.ts`, `tests/core/media-tracks.test.ts`, `tests/core/operation-payloads.test.ts`, `docs/briefs/2026-10-19-remove-leaves-gap/1-core-leave-gap-agy.md`
- **e2e-leave-gap:** `tests/core/render-native-lanes.test.ts`, `docs/briefs/2026-10-19-remove-leaves-gap/2-e2e-leave-gap-agy.md`
- **editor-leave-gap:** `web/src/review/_internal/MediaEditor.tsx`, `web/src/review/_internal/ClipSettings.tsx`, `web/src/review/_internal/editor-settings.ts`, `docs/briefs/2026-10-19-remove-leaves-gap/3-editor-leave-gap-agy.md`

## Overlaps

None. Every lane touches a disjoint file set.

## Type overlaps

| Changed type or signature | Definition path and lane | Affected paths and lanes | Required companion edits | Resolution |
|---|---|---|---|---|
| `PlacementRemoveOperation` gains optional `leaveGap?: boolean` | `server/core/_internal/edit-model.ts` (`core-leave-gap`) | `web/src/review/_internal/MediaEditor.tsx`, `web/src/review/_internal/ClipSettings.tsx` (`editor-leave-gap`), `tests/core/media-model.test.ts`, `tests/core/operation-payloads.test.ts` (`core-leave-gap`) | Existing callers omit `leaveGap` and stay valid. `editor-leave-gap` passes `leaveGap: true`. | Wave 1 merges `core-leave-gap` into `feat/remove-leaves-gap` before Wave 2 dispatches `editor-leave-gap`. |
| `PlacementSnipOperation` gains optional `leaveGap?: boolean` | `server/core/_internal/edit-model.ts` (`core-leave-gap`) | `web/src/review/_internal/MediaEditor.tsx` (`editor-leave-gap`), `tests/core/media-tracks.test.ts` (`core-leave-gap`), `tests/core/render-native-lanes.test.ts` (`e2e-leave-gap`) | Existing callers omit `leaveGap` and stay valid. `editor-leave-gap` passes `leaveGap: true` on unmodified apply and omits it with `Shift`. | Wave 1 runs `core-leave-gap` and `e2e-leave-gap` in parallel; `editor-leave-gap` runs in Wave 2 after `core-leave-gap` merges. |

## Merge order

1. `core-leave-gap` (Wave 1) — merges into `feat/remove-leaves-gap` before Wave 2 starts.
2. `e2e-leave-gap` (Wave 1) — red e2e test against the plan.
3. `editor-leave-gap` (Wave 2) — makes `e2e-leave-gap`'s checks green.
