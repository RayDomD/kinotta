---
title: Remove and snip leave a gap
date: 2026-10-19
status: Approved
summary: Removing or snipping a clip on the main picture sequence leaves a gap so later clips keep their time; Shift closes the gap, as in Premiere and Resolve.
spec:
---

## Intent

- Problem: On a native-placement reel, removing a main-sequence clip or applying a snip pulls every later clip earlier. The main sequence is an ordered list with no times (`media.sequence`), so `applyPlacementRemove` and `applyPlacementSnip` in `server/core/_internal/edit-model.ts` ripple by construction. There is no way to take something out and keep the rest in place.
- Why: The owner wants later clips to stay where they are. Premiere, Resolve and Avid leave a gap on Delete and ripple only on a separate action (Ripple Delete, Shift+Delete). Kinotta's main track behaves like Final Cut's magnetic timeline instead.
- Proposed outcome: Delete and Apply snip leave a gap of the removed length, and later clips keep their times. Shift+Delete ("Remove and close the gap") and Shift with Apply snip close the gap as they do today.
- Affected: `server/core/_internal/edit-model.ts` (remove, snip, ripple-remove), the clip menu and actions in `web/src/review/_internal/MediaEditor.tsx`, the Remove button in `ClipSettings.tsx`, the key registry in `editor-settings.ts`, the snip confirm bar, and core and e2e tests for remove, snip and close the gap.
- Constraints:
  - Saved edit lists must replay to the same result (ADR 0003). Existing `placement-remove` and `placement-snip` entries keep their current rippling meaning, so the new behavior needs a flag or new operation kinds.
  - One undo restores a remove or snip, including its gap.
  - Pins and comments do not move when nothing after the cut changes time.
  - Code-built reels are unchanged (snip and gap are already disabled there).
- Out of scope: the "Waiting for picture" stall at cuts (separate fix: reuse or pre-mount picture elements in `PictureLayers.tsx`), the transcript `snip` operation on footage reels, and a magnet toggle for the whole timeline.
- Open questions: none. Snip leaves a gap by default (owner, 2026-10-19).

## Goal

On the main picture sequence, Delete and Apply snip keep later clips at their times by leaving a gap. Shift+Delete and Shift+Apply snip close it.

## Approach

1. Gaps already exist as main-sequence placements (`role: 'gap'`), so leaving a gap means replacing the removed clip in `sequence` with a gap placement of the same duration, at the same index. Two adjacent gaps merge into one so the timeline doesn't fill with slivers.
2. Add `leaveGap: true` to `PlacementRemoveOperation` and `PlacementSnipOperation`. When the flag is missing, old entries replay with the current ripple. The editor sends `leaveGap: true` from now on.
3. `placement-ripple-remove` keeps its current behavior on the main sequence (the plain remove ripples), so Shift+Delete is unchanged. Shift with Apply snip sends `placement-snip` without `leaveGap`.
4. Footage attachments follow their clip as today. A clip attached to a removed clip behaves as it does on a remove now.
5. The clip menu shows both items with their keys: "Remove" (Delete) and "Remove and close the gap" (Shift+Delete). The snip bar reads "Remove N s, keep the gap", and its hint shows that Shift closes the gap.

## Steps

1. Core tests (red): remove leaves a gap and later clips keep `at`, snip leaves a gap, adjacent gaps merge, a legacy entry without the flag still ripples, and one undo restores everything.
2. Implement `leaveGap` in `applyPlacementRemove` and `applyPlacementSnip`, plus the gap merge.
3. Editor: send `leaveGap` from Delete, the clip menu and the ClipSettings Remove button; add Shift with Apply snip (Shift+Enter and Shift+click); update menu labels and snip bar text.
4. E2e: remove a clip and a snipped stretch on the real Review screen, check later clips' times, then Shift+Delete and check they close up.

## Orchestration

Base: branch `feat/remove-leaves-gap` from `main`, checked out at `.worktrees/remove-leaves-gap`. Each lane gets its own worktree and branch off it under `.worktrees/`. `tests/cleanup-*.log` in the main checkout stay untracked (evidence, not deleted).

Executors are separate agy agents on Gemini 3.8, one per lane. Each brief is short and imperative, names its files, and forbids edits outside them.

| Wave | Lane | Files | Done when |
|---|---|---|---|
| 1 | A `core-leave-gap` | `edit-model.ts`, `media-model.test.ts`, `media-tracks.test.ts`, `operation-payloads.test.ts` | Step 1 tests red then green; legacy entries still ripple |
| 1 | B `e2e-leave-gap` | `render-native-lanes.test.ts` only | Step 4 checks written against the plan and failing for the expected reason |
| 2 (after A merges) | C `editor-leave-gap` | `MediaEditor.tsx`, `ClipSettings.tsx`, editor key registry | Step 3 done; lane B's checks pass against it |

Lanes A and B run in parallel because they share no files. C starts once A is merged into the feature branch, since its `leaveGap: true` payloads need A's types.

Gate before anything returns to Claude: Gemini 4 Argon reviews each lane's diff as a security and validation check only, without writing features. It checks that the lane stayed inside its files, adds no secrets, network calls or unsafe input handling, and leaves server-side validation of `leaveGap` (boolean only) intact. It also reruns the lane's stated checks and confirms they pass. A lane that fails the gate goes back to its agent. Only lanes that pass are reported to Claude, with Argon's findings and the check output. Claude then merges, runs the full Checks, and reports to the owner.

## Risks

- A gap at the end of the sequence lengthens the reel with black. Decision: a trailing gap is dropped, since nothing after it would hold time.
- The edit list's display names may describe a remove as rippling. Check `EditsPanel.tsx` wording.

## Checks to run

- Core tests for edit-model remove, snip and ripple-remove, including legacy replay.
- E2e on Review: Delete, Apply snip, Shift+Delete and Shift with Apply snip, with clip times read from the timeline.
- Typecheck and the full core suite.

## Changelog

### 2026-10-19
- Plan created. Owner chose Premiere-style behavior, with Snip also leaving a gap.
- Approved. Added the ClipSettings Remove button (found by Argon's audit) and an Orchestration section: three Gemini 3.8 lanes in two waves, with Argon as a security and validation gate before results return to Claude.
- Merged lanes A, B and C. Typecheck, the affected unit suites (204 tests) and both `render-native-lanes` browser tests pass; the full suite was stopped twice by low system memory and is still to run. Noted the change in `2026-10-05-snip-and-save.md`. The stall at cuts moved to `2026-10-19-cut-stutter.md`.
