---
title: Carry edits across footage copies
date: 2026-10-27
status: Done
summary: Owner edits keep applying when the agent's new version names the same footage by a different path, and a stale edit is one click away from the error that reports it.
spec:
---

## Intent

- Problem:
  - Owner edits made on Working from v1 stop applying to agent-built versions. Seen live on `sample-vid`: the word edit "management" → "managements" shows "No longer applies to v3: Speech placement legacy:../../footage/sample vid .mp4:0:119.954 is missing." Cause, verified: `server/core/_internal/media-model.ts:147` builds the source id as `legacy:${plan.video}`. v1's plan names `../../footage/sample vid .mp4`; v2 and v3 name `footage.mp4`, a copy inside the version folder. Same footage, different id. Related: `server/core/_internal/carry.ts:53-55`.
  - When it happens, the error bar says only "Could not save the comments. One edit no longer applies to v3. Remove it or redo it, then freeze Working." (`server/core/_internal/save.ts:185`). The edit is named only inside the Edits panel (`web/src/review/_internal/EditsPanel.tsx:113`), so the owner cannot find it.
  - The test `tests/core/viewer-state.test.ts:9` "serializes simultaneous additions" fails intermittently in CI (runs 40353001559 and 40502178592) and passes on rerun (#94).
- Issues: #93 (carry bug), #94 (flaky test).
- Why: Lost edits break the promise that Kinotta carries the owner's work onto each new version, and the error leaves the owner stuck.
- Proposed outcome:
  - An edit matches its footage by what the file is, not by the path string in the plan, so it carries onto versions that copy the footage.
  - The viewer-state test passes reliably, with the cause of the flakiness found rather than retried away.
  - Any error about edits that no longer apply names each edit and its shot, and clicking it opens the Edits panel on that edit and moves the timeline to that shot.
- Affected: `server/core/_internal/media-model.ts`, `server/core/_internal/carry.ts`, `server/core/_internal/save.ts`, `server/core/_internal/edit-list.ts`, `web/src/review/_internal/EditsPanel.tsx`, the error bar in Review, `tests/core/version-media.test.ts`, `tests/core/viewer-state.test.ts` and the code it covers, carry and e2e tests.
- Constraints: Saved edit lists replay to the same result (ADR 0003). Versions stay self-contained, so agent output keeps copying footage. Preserve the animated revisions and the Review fix that loads the chosen Working revision.
- Out of scope: Caption styling (its own plan).
- Open questions:
  - O1: Identify footage by resolved path, by content hash, or both? Resolved 2026-10-27, owner approved: content hash, since `import.ts` and `media-library.ts` already hash imports; read `carry.ts` before deciding.

## Goal

1. An owner edit made on Working from v1 still applies after the agent writes a version that copies the footage into its own folder (#93).
2. The viewer-state test passes 50 runs in a row, with its cause fixed (#94).
3. An error about stale edits names each edit and its shot; clicking it opens the Edits panel on that edit and moves the playhead to that shot.

## Approach

**Identity.** `legacyMedia` (`media-model.ts:147`) keys sources on `legacy:${plan.video}`. Keep that id format for saved lists (ADR 0003), but resolve which footage an id means by content hash: when an edit's `legacy:` source is missing from the new version, find the new version's source whose file hash matches the old path's file, and map placement ids by range. The hash reuses `import.ts`'s helper and is cached per path, size and mtime. The first-conversion path in `carry.ts:53-55` uses the same lookup.

**Errors.** `edit-list.ts` already records `flagged[op.id]` with a message. Add the shot and time where the edit acts, and return them with the list. The save error (`save.ts:185`) and the Review error bar list each flagged edit as a button that opens the Edits panel on that row and seeks to its time.

**Flaky test.** Reproduce by looping the test, find why two parallel `addMarker` calls sometimes lose one (suspected: a read-modify-write in `markers.ts` outside a lock), and fix the cause.

## Steps

1. [x] Carry test (red): a v1 plan naming `../../footage/x.mp4` and a v2 naming `footage.mp4` with the same bytes; a word edit from v1 applies to v2. Anchor: `tests/core/version-media.test.ts:14`.
2. [x] Hash-based source matching in `media-model.ts`, `carry.ts` and edit-list replay.
3. [x] Flagged edits carry shot and time; core test.
4. [x] Error bar and Edits panel: clickable entries; e2e that forces a stale edit and clicks through.
5. [x] Flaky test: loop 50 runs, find the cause, fix, loop 50 runs again.
6. [x] Read-only check on the owner's `sample-vid` reel that the "managements" edit now applies to v3. Done 2026-10-28 on a copy; see Result.

## Risks

- Hashing large footage on every replay is slow: hash once per path, size and mtime.
- Two files with identical bytes would match; they are the same footage, so this is acceptable.
- Replay changes must not alter results for lists that already apply; the full core suite guards this.

## Checks to run

- New carry and flagged-edit tests, full core suite.
- The stale-edit e2e.
- `npx vitest run tests/core/viewer-state.test.ts` 50 times in a loop.
- `npm run typecheck`, `npm run build`.

## Result

Steps 1 to 5 shipped on `fix/carry-edits-across-copies`. Step 6 ran on 2026-10-28 on the owner's machine, against a scratch copy of `Kinotta-skill-split-check/reels/sample-vid`:

- The fix works. Replayed from the anchor the edit was made on (Working, `legacy:../../footage/sample vid .mp4`), the edit moves to `legacy:footage.mp4:0:119.954` on v3 and nothing is flagged. Source ids printed per plan, and the footage bytes in the reel folder, v2 and v3 are identical.
- The owner's real list stays flagged. The pre-fix code replayed it onto v2, flagged the edit and moved the anchor to v2, and a list is replayed only when a newer version arrives, so the current code never retries it. Only edits flagged before this fix are affected. The owner chose to redo that one edit in the editor rather than add retry code.

- Carry (#93): a legacy footage source is matched by content hash, so edits made on v1 apply to a version that copies the footage under another path. Saved ids keep their format (ADR 0003). Core tests in `tests/core/version-media.test.ts` and `tests/core/legacy-media-editing.test.ts`.
- Flagged edits carry `flaggedAt` (time and shot). The freeze error names each edit and its shot. The save error bar lists each flagged edit as a button that opens the Edits panel on its row (focused, Tally outline) and moves the playhead to its time; in Simple mode it switches to the editor first. Covered by `tests/e2e/stale-edit.spec.ts` (own server, port offset 21).
- Flaky test (#94): the cause was not a lost write. `markers.ts` checked the reel before taking its place in the write queue, so two simultaneous additions reached the queue in either order and were stored swapped; the test reads index 0 as the first. The queue slot is now taken before anything is awaited. Before the fix `viewer-state.test.ts` failed 2 of 50 runs (runs 38 and 39); after it, 0 of 50.

Deviations and findings:
- `operationMoment` was extended: a legacy clip names its source id, not a placement id, so it is placed by source time. Found by the e2e.
- The Storyboard "Build next version" button (`CommentsPanel`) shows the plain error without buttons; only the top bar Copy button lists them.

Checks:
- `npm run typecheck`: clean. `npm run build`: ok. `npm run check:docs`: ok.
- Core suites for handoff, working-reversals, version-media, legacy-media-editing: 4 files, 60 passed before the last test was added; version-media 9 passed after.
- `npx vitest run --project unit`: 3 failed, 1138 passed, 10 skipped. Not caused here: `tests/engine/sound-skill.test.ts` (3 tests; the container's pip numpy 2.5.3 breaks apt scipy). `tests/core/proxy-audio.test.ts` hit a 10 s hook timeout under load and passed alone.
- `tests/e2e/stale-edit.spec.ts`: 1 passed.
- Full `npx playwright test` (port base shifted because another run held the default ports): 170 passed, 25 failed, 3 did not run. The failures are in agent-confirm, agent-strip, simple-mode, playback-stutter, and once each optimistic-edits, parts-gate, pinned-effects. Re-run on this branch, 16 failed in those files (parts-gate, pinned-effects and optimistic-edits passed). On unmodified main, the same files fail 17 and 17 in two runs, with the same agent-strip, simple-mode and playback-stutter tests failing. They are flaky or environment-bound here, not caused by this change.
- The dashboard (`docs/plans/index.html`) was not regenerated: `pwsh` is not installed.

## Changelog

### 2026-10-27
- Plan created with Intent only. Owner asked for clickable errors that lead to the broken edit on 2026-10-27.
- Owner folded the flaky viewer-state test fix into this plan; issues #93 and #94 filed.
- Owner approved the Intent and its recommended answers; Goal, Approach, Steps, Risks and Checks written. Status Approved.

### 2026-10-28
- Step 6 checked on the owner's machine; Result updated.
