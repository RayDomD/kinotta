---
title: Trimming a clip leaves a gap
date: 2026-10-20
status: Approved
summary: Trimming a main-sequence clip shorter leaves a gap instead of pulling later clips in; lengthening fills only empty space; Shift ripples; the caption row follows the trimmed clip.
spec: docs/plans/2026-10-19-remove-leaves-gap.md
---

## Intent

- Problem: In the detailed editor, dragging a main-sequence clip's edge to shorten it pulls every later clip earlier, because the main sequence is an ordered list with no times (`media.sequence`) and `applyPlacementChange` only changes the clip's `in`/`out`/`duration` (`server/core/_internal/edit-model.ts`). The caption/word row under the clips does not follow the trimmed clip (owner screenshot, 2026-10-20).
- Why: #57 made Delete and snip leave a gap; trimming is the remaining edit that still ripples, so the timeline behaves two different ways.
- Proposed outcome: Trimming behaves like Premiere and Resolve: shortening leaves a gap and later clips keep their times, and the caption row stays matched to the clip's speech.
- Affected: `server/core/_internal/edit-model.ts` (placement change on main-sequence clips, gap merge from #57), the trim drag in `web/src/review/_internal/MediaEditor.tsx`, the caption/word lanes in `web/src/review/_internal/EditorialLanes.tsx` and `Lanes.tsx`, core and e2e tests for trimming.
- Constraints:
  - Saved edit lists replay to the same result (ADR 0003): existing `placement-change` entries keep their rippling meaning, so the new behavior needs a `leaveGap` flag as in #57.
  - One undo restores a trim, including its gap.
  - Code-built reels unchanged.
- Out of scope: insert/overwrite editing, a whole-timeline magnet toggle, the storyboard shot cards (owner chose the caption row only), and simple mode (its dead-air editing is planned in `2026-10-20-editable-dead-air.md` on `feat/simple-mode`).
- Open questions: none. Board = caption/word row (owner, 2026-10-20).

## Goal

On the main picture sequence, trimming a clip shorter leaves a gap of the trimmed length; lengthening a clip grows into an empty gap after (or before) it and stops at the next clip; Shift while trimming ripples as today. Caption and word boxes move and resize with the clip they belong to.

## Approach

1. Add `leaveGap: true` to `placement-change` when it trims a main-sequence clip's `in`/`out`. Shortening inserts (or grows) a gap placement next to the clip at the trimmed edge; adjacent gaps merge (reuse #57's merge). A trailing gap is dropped, as in #57.
2. Lengthening with `leaveGap` takes time from the adjacent gap and is clamped to the gap's length (and to the source's available footage); without a gap it can't extend. Entries without the flag replay with the current ripple.
3. Editor: the trim drag sends `leaveGap: true`; Shift while dragging omits it (ripple). The drag clamps live so the owner sees where it stops.
4. Caption row: words are keyed by source time. Recompute each word's reel position from the edited pieces so words inside the trimmed-away stretch disappear and the rest keep their position over the clip; check where the row currently reads stale positions.

## Steps

1. Core tests (red): shorten leaves a gap and later clips keep `at`; lengthen fills a gap and clamps at the next clip; adjacent gaps merge; trailing gap dropped; legacy entry without the flag still ripples; one undo restores.
2. Implement in `edit-model.ts`.
3. Editor drag: `leaveGap`, Shift ripples, live clamp.
4. Caption row follows the clip; reproduce the owner's screenshot first to confirm where it drifts.
5. E2e on the Review screen: trim a clip shorter and check later clips' times and the caption row; Shift-trim and check they close up.

## Risks

- Trim handles on attached footage (inserts with `attachment`) may also need the flag; check whether they ripple today before changing them.
- Lengthening when the next clip butts up against this one does nothing, which can feel stuck; the live clamp must make that visible.

## Checks to run

- `npx tsc --noEmit`; core tests for media model and tracks; `npx vitest run` for touched files.
- E2e on the Review screen after `npm run build`.
- By hand on the owner's `FInalVid.mov` reel (copy): screenshots before and after a trim, with the caption row.

## Changelog

### 2026-10-20
- Plan created from the owner's screenshot: stretching a clip still closes up, and the caption row should follow the clip.
- Approved; dispatched to Codex.
