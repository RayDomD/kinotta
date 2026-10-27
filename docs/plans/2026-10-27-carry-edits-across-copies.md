---
title: Carry edits across footage copies
date: 2026-10-27
status: Approved
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

1. [ ] Carry test (red): a v1 plan naming `../../footage/x.mp4` and a v2 naming `footage.mp4` with the same bytes; a word edit from v1 applies to v2. Anchor: `tests/core/version-media.test.ts:14`.
2. [ ] Hash-based source matching in `media-model.ts`, `carry.ts` and edit-list replay.
3. [ ] Flagged edits carry shot and time; core test.
4. [ ] Error bar and Edits panel: clickable entries; e2e that forces a stale edit and clicks through.
5. [ ] Flaky test: loop 50 runs, find the cause, fix, loop 50 runs again.
6. [ ] Read-only check on the owner's `sample-vid` reel that the "managements" edit now applies to v3.

## Risks

- Hashing large footage on every replay is slow: hash once per path, size and mtime.
- Two files with identical bytes would match; they are the same footage, so this is acceptable.
- Replay changes must not alter results for lists that already apply; the full core suite guards this.

## Checks to run

- New carry and flagged-edit tests, full core suite.
- The stale-edit e2e.
- `npx vitest run tests/core/viewer-state.test.ts` 50 times in a loop.
- `npm run typecheck`, `npm run build`.

## Changelog

### 2026-10-27
- Plan created with Intent only. Owner asked for clickable errors that lead to the broken edit on 2026-10-27.
- Owner folded the flaky viewer-state test fix into this plan; issues #93 and #94 filed.
- Owner approved the Intent and its recommended answers; Goal, Approach, Steps, Risks and Checks written. Status Approved.
