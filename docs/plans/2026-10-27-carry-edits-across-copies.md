---
title: Carry edits across footage copies
date: 2026-10-27
status: Draft
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
  - O1: Identify footage by resolved path, by content hash, or both? Recommended: content hash, since `import.ts` and `media-library.ts` already hash imports; read `carry.ts` before deciding.

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-27
- Plan created with Intent only. Owner asked for clickable errors that lead to the broken edit on 2026-10-27.
- Owner folded the flaky viewer-state test fix into this plan; issues #93 and #94 filed.
