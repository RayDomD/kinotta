---
agent: agy
lane: core-leave-gap
manifest: ./manifest.md
date: 2026-10-19
plan: ../../plans/2026-10-19-remove-leaves-gap.md
---

# Brief: remove-leaves-gap — lane core-leave-gap

Follow this brief exactly. Standing rules are in AGENTS.md.

Start immediately by editing the test files (`tests/core/media-model.test.ts`, `tests/core/media-tracks.test.ts`, `tests/core/operation-payloads.test.ts`) to add the failing tests, run them to see them fail, and then implement `leaveGap` in `server/core/_internal/edit-model.ts`. Do not spawn subagents or write an execution plan. Write your Test evidence and Deviations into this brief file before finishing.

## Scope

Implement Steps 1 and 2 of `docs/plans/2026-10-19-remove-leaves-gap.md`:
- Add optional `leaveGap?: boolean` to `PlacementRemoveOperation` and `PlacementSnipOperation` in `server/core/_internal/edit-model.ts`.
- Validate `leaveGap` in `applyPlacementRemove` and `applyPlacementSnip` so any non-boolean `leaveGap` (`op.leaveGap !== undefined && typeof op.leaveGap !== 'boolean'`) throws `new KinottaError('invalid', ...)`.
- When `leaveGap: true` on `placement-remove` removes a `role: 'main'` placement in `media.sequence`, replace it at its index in `media.sequence` with a `GapPlacement` (`role: 'gap'`) of the removed clip's timeline duration, merge any adjacent gaps in `media.sequence` into one gap placement with the combined duration, and drop any trailing gap at the end of `media.sequence`.
- When `leaveGap: true` on `placement-snip` snips across the main sequence, leave a merged gap of the snipped duration (dropping any trailing gap at the end of `media.sequence`) so later clips keep their `at` times.
- Preserve existing rippling behavior when `leaveGap` is omitted or `false` (ADR 0003).

Out of scope: any UI files (`web/**`) and browser e2e tests (`tests/core/render-native-lanes.test.ts`, which belongs to parallel lane `e2e-leave-gap`).
Files you may edit:
- `server/core/_internal/edit-model.ts`
- `tests/core/media-model.test.ts`
- `tests/core/media-tracks.test.ts`
- `tests/core/operation-payloads.test.ts`
- `docs/briefs/2026-10-19-remove-leaves-gap/1-core-leave-gap-agy.md`

## Execution checklist

- [ ] 1. In `tests/core/operation-payloads.test.ts`, add malformed payload cases for non-boolean `leaveGap` on `placement-remove` (e.g. `{ kind: 'placement-remove', placement: 'take', leaveGap: 'yes' }`) and `placement-snip` (e.g. `{ kind: 'placement-snip', from: 0.5, to: 1.5, leaveGap: 1 }`).
- [ ] 2. In `tests/core/media-model.test.ts`, add a test covering `placement-remove` with `leaveGap: true`:
  - Removing an earlier main-sequence clip with `leaveGap: true` replaces it with a `role: 'gap'` placement of the same duration so a later main clip keeps its `at` time and an attached audio clip on the later main clip keeps its `at` time, while an attachment on the removed clip is marked `attachmentBroken: true`.
  - Removing the adjacent clip with `leaveGap: true` merges the two adjacent gaps into one gap placement with the summed duration (and drops it if it is now at the end of `sequence`).
  - Removing the last clip in `sequence` with `leaveGap: true` drops the trailing gap so the reel does not end with black.
  - Legacy `placement-remove` without `leaveGap` still ripples later clips earlier.
- [ ] 3. In `tests/core/media-tracks.test.ts`, add a test covering `placement-snip` with `leaveGap: true`:
  - Snipping a stretch inside/across main-sequence clips with `leaveGap: true` leaves a single merged gap of the snipped length so surviving later clips keep their `at` times.
  - Snipping to the end of the sequence with `leaveGap: true` drops the trailing gap.
  - Legacy `placement-snip` without `leaveGap` still ripples as before.
- [ ] 4. Run `npx vitest run tests/core/media-model.test.ts tests/core/media-tracks.test.ts tests/core/operation-payloads.test.ts` and confirm the new tests fail (red).
- [ ] 5. In `server/core/_internal/edit-model.ts`:
  - Add `leaveGap?: boolean;` to `PlacementRemoveOperation` (around line 327) and `PlacementSnipOperation` (around line 359).
  - In `applyPlacementRemove`:
    - Validate `if (op.leaveGap !== undefined && typeof op.leaveGap !== 'boolean') throw new KinottaError('invalid', 'leaveGap must be a boolean.');`
    - When `op.leaveGap === true`, `media.sequence.includes(op.placement)`, and the removed placement's `role !== 'gap'`:
      - Read the removed placement's timeline duration from `mediaTimeline(media, sources.plan.duration ?? 0).placements.find((p) => p.id === op.placement)!.duration`.
      - Replace `op.placement` in `placements` and `sequence` (at the same index) with a gap placement `{ id: `${op.placement}~gap~${op.id}`, role: 'gap', duration }`.
      - Normalize `sequence` and `placements`: merge any adjacent `role: 'gap'` placements in `sequence` into the earlier gap placement (summing their durations and removing the absorbed gap from `placements` and `sequence`), then drop any trailing `role: 'gap'` placements at the end of `sequence` (and remove them from `placements`).
      - If `media.sequence.length > 0 && sequence.length === 0`, set `plan.duration` to `0` on `base` just like the existing empty-sequence handling.
  - In `applyPlacementSnip`:
    - Validate `if (op.leaveGap !== undefined && typeof op.leaveGap !== 'boolean') throw new KinottaError('invalid', 'leaveGap must be a boolean.');`
    - Pass `...(op.leaveGap ? { leaveGap: true } : {})` and a unique id (`id: `${op.id}:remove:${removed}``) to the `applyPlacementRemove` call inside the `affected.reverse()` loop so each removed piece leaves a gap when `op.leaveGap === true`, adjacent gaps merge, and any trailing gap at the end of `sequence` is dropped.
- [ ] 6. Run `npm run typecheck` and `npx vitest run tests/core/media-model.test.ts tests/core/media-tracks.test.ts tests/core/operation-payloads.test.ts tests/core/working-reversals.test.ts tests/core/media-pins.test.ts` and confirm all pass (green).

## Context

In `server/core/_internal/edit-model.ts`:
```ts
export interface PlacementRemoveOperation extends AuthoredOperation {
  id: string;
  kind: 'placement-remove';
  placement: string;
  leaveGap?: boolean;
}
export interface PlacementSnipOperation extends AuthoredOperation {
  id: string;
  kind: 'placement-snip';
  from: number;
  to: number;
  leaveGap?: boolean;
}
```
Note that `applyPlacementRippleRemove` calls `applyPlacementRemove(sources, { ...op, kind: 'placement-remove' })` without `leaveGap`, so `placement-ripple-remove` continues to ripple on the main sequence.

## Contract

- Work ONLY this brief. No scope creep, no drive-by refactors.
- Edit ONLY the files listed in Scope.
- TDD: failing test first, then minimal implementation.
- Run typecheck and the listed vitest suites. Paste commands and output under `## Test evidence` in this file.
- NEVER commit, push, branch, or run any git write. Leave the tree dirty.
- Record any deviations under `## Deviations` in this file.

## Test evidence

(The executor fills this in.)

## Deviations

(The executor fills this in.)
