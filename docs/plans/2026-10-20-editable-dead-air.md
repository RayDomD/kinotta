---
title: Editable dead-air cuts in simple mode
date: 2026-10-20
status: Approved
summary: Gentler dead-air default, cuts shown on the simple-mode timeline over the whole recording, each one restorable or resizable.
spec: docs/plans/2026-10-20-simple-mode-flow.md
---

## Intent

- Problem: On the owner's 102 s video, Make removed 14.4 s in 17 cuts; some cut pauses that should stay. Simple mode shows only the result, so a bad cut can't be seen or undone there.
- Why: Dead air is the first thing simple mode does to every reel; if it over-cuts with no way back, the owner has to open the detailed editor.
- Proposed outcome: Fewer unwanted cuts by default, and every cut visible on the simple-mode timeline where the owner can put the pause back or change how much is removed.
- Affected: `server/core/_internal/dead-air.ts`, `start.ts`, `web/src/SimpleMode.tsx`, `web/src/SimpleTimeline.tsx`, `web/src/simple.css`, tests in `tests/core/dead-air.test.ts` and `tests/e2e/simple-mode.spec.ts`.
- Constraints: Reuse the existing edit list and `snip` operation; no new edit format. Review keeps loading the chosen Working revision. Detailed editor behavior is unchanged.
- Out of scope: The three bugs found in the same session (pin deleted after reload/New reel/Make, pin stored at the save-time playhead, Make not opening the new reel) and the "older version" banner. They are tracked separately and fixed first.
- Open questions: none (owner chose the whole-recording timeline, 2026-10-20).

## Goal

Make cuts dead air gently. The simple-mode timeline spans the whole recording, shades each removed stretch, shows the playhead, and lets the owner click a shaded stretch to restore it or drag its edges to resize it.

## Approach

- **Gentler default.** Make sends `gentle` (pauses over 1.2 s, no breath trims). On the owner's video that leaves 2 cuts (the 1.6 s and 2.5 s pauses) of the 17 that `normal` made.
- **Cuts as edits, not baked into v1.** `startReel` builds v1 from the whole recording and then adds one `snip` operation per dead-air cut to Working, tagged so the timeline can tell them apart from the owner's own snips. Restoring a cut is removing that operation (existing remove-one-edit), and resizing is replacing it with a new `snip`. Undo works as today.
- **Timeline in source time.** `SimpleTimeline` maps over the recording's full length. Removed stretches (from the Working plan's pieces) are shaded blocks with their length. The playhead shows the source time and jumps over shaded blocks while playing. Pins keep their reel time; their marks are placed at the mapped source time.
- **Edit a cut.** Click a shaded block: a small popover with "Keep this pause" (restore) and the cut length. Drag either edge to resize; on release the snip is replaced. Changes rebuild Working the same way the editor's snips do.

## Steps

1. Change Make's default to `gentle`; update the dead-air tests.
2. Move dead-air cuts from v1 pieces to tagged `snip` edits on Working; tests: v1 is uncut, Working has one snip per cut, removing one restores that stretch.
3. Timeline maps source time; shade removed stretches; playhead in source time skipping shaded blocks.
4. Click a block to restore; drag edges to resize; e2e for restore and resize on a reel with known cuts.
5. Check on the owner's video (copy in a scratch project): cut count with `gentle`, restore one cut, resize one, play across a cut.

## Risks

- Seventeen snip edits on a fresh reel make the edit list long in the detailed editor; the tag lets the editor group or label them, but that UI is not in scope.
- Mapping pins between reel time and source time can drift if a cut is resized under a pin; pins stay at their reel time and move with it.
- Playback skipping shaded blocks depends on the player's existing piece handling; if the player plays edited time only, the timeline converts instead.

## Checks to run

- `npx tsc --noEmit`; `npx vitest run tests/core/dead-air.test.ts tests/core/start-reel.test.ts tests/core/snip-save.test.ts`.
- `npx playwright test tests/e2e/simple-mode.spec.ts` after `npm run build`.
- By hand on the owner's video, with screenshots: shaded cuts visible, playhead skips them, restore and resize work, Review shows the same Working.

## Changelog

### 2026-10-20
- Plan created after the owner tested Make on a finished 102 s video; timeline shape chosen: whole recording with shaded cuts.
- Approved; dispatched to agy. The three simple-mode bugs follow after it, on the same branch.

### 2026-10-21
- Owner preferred the earlier cut strength: Make's default is back to `normal` (17 cuts, 14.4 s on the owner's video). The editable cuts are unchanged.
