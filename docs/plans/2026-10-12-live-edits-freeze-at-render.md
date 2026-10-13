---
title: live-edits-freeze-at-render
date: 2026-10-12
status: Approved
summary: Edits apply to the reel in place; a version is frozen only at a render or a comment hand-off.
spec:
---

## Intent

- Problem: Every change needs a new version. Save builds `v<n+1>` for a mute or a gain change, and the skill tells the agent that every change is a new `v<n+1>`. In `reels/kinotta-showcase`, v11 to v14 exist only for sound, and v14 changes nothing that can be seen or heard.
- Why: It is not how an editor behaves, it buries the versions that matter under ones that don't, and each one copies the reel's media to disk again (ADR 0003).
- Proposed outcome: You change a reel in place, as in any editor, with undo and redo and no Save step. A version is frozen when you render or when you copy a comment batch for the agent, and only if the reel changed since the last frozen version. The agent makes sound and other small changes to the working reel without building a version.
- Affected: `server/core` (edit list, Save, save-and-render, render, hand-off, comment carry), `server/http`, the Review editor's Save and Edits UI, `skill/kinotta` (SKILL.md, `reference/sound.md`, `reference/native-media.md`), `CONTEXT.md` (Version, Save, Edit list), ADR 0003, tests under `tests/core` and `tests/e2e`.
- Constraints: A frozen version still keeps the exact media, transcript and plan it was built from. Comments and renders still name an exact version. Existing reels and their versions keep opening. An agent's picture rebuild still produces a version until parts exist (see `2026-10-12-shots-as-parts.md`).
- Out of scope: Splitting a reel into parts. Changing what a render or a preset is. Deleting or merging existing versions.
- Open questions:
  - O1: settled. No manual checkpoint action. Final and Overlay renders and comment hand-offs freeze versions.
  - O2: settled. Draft renders use the working reel without freezing a version.
  - O3: settled. Live edits keep applying during a hand-off and replay onto the agent's next version.

## Goal

The newest reel is a persistent working reel. Mechanical edits, undo and redo survive a reload without Save and without creating version folders. Final and Overlay renders and comment hand-offs preserve an exact frozen version only when the working content differs from the last frozen content. Draft renders capture the working reel for the job without adding a version. Existing versions remain reproducible and continue opening.

Acceptance criteria:

- An edit is visible and durable when its existing edit operation succeeds. Restarting the server restores the same working picture, sound and history.
- Freezing does not discard undo or redo. Editing after a freeze changes the working reel while the frozen version stays exact.
- Repeating a Final, Overlay or hand-off without a content change reuses the frozen version. Undoing back to the last frozen content also reuses it.
- A Draft uses the content captured when it was requested, even if editing continues while it waits in the render queue. Its temporary inputs are removed on completion, failure or cancellation.
- A hand-off identifies an exact frozen version. Further live edits keep applying and replay onto the agent's next version, with conflicts shown through the existing flagged-operation flow.
- Legacy reels with pending edit lists migrate without applying their operations twice. Older versions and their renders keep opening.
- An operation the agent adds to the working reel is recorded with who made it. The Edits list shows each edit as made by you or by the agent's name, and undo reverses an agent's edit like any other.

## Approach

Keep the existing operation model and its per-reel lock. `edit-list.ts` already persists operations and undo/redo, and the editor already previews their applied result. Promote that durable state to the working reel instead of treating it as unsaved content. Frozen version folders remain immutable inputs to history, rather than the place mechanical edits write.

Separate capture and freeze from today's Save. `save.ts` already stages a version, preserves media and page dependencies, and publishes it atomically. Reuse those mechanisms behind one core freeze operation called by working-reel Final/Overlay renders and `copyBatch`. It captures the working state under the per-reel lock, compares its effective content with the last frozen content, and either reuses that version or publishes one new version. A content identity includes the applied plan, transcript, page and offsets, and media dependencies. Render settings alone do not create a content version.

The history journal needs an explicit distinction between its working base and the latest frozen result. Freezing must not erase the journal, reset history, or trigger replay of the same operations onto the snapshot that already contains them. Rebase happens when a new agent-built version arrives. The exact stored representation is settled in the first core step, with round-trip and crash-recovery tests before changing the editor.

Draft captures the same working inputs into temporary job storage, using the existing render pipeline without publishing `v<n>`. Jobs and render listings identify a working Draft separately from a render of an exact numbered version. An explicit render of an older version continues to render that version. Validate settings and the relevant render gates before publishing a boundary. A failed freeze publishes nothing and leaves the working state and history intact.

Comment hand-off freezes and maps comments onto that captured version before writing the batch. Keep existing section scoping, unsent-comment carry, and handed-off batch behavior. Serialize capture, comment mapping and hand-off recording so simultaneous edits cannot produce a batch naming different content. The hand-off snapshot stays fixed while later operations keep collecting and applying.

The Review editor opens the working reel by default and offers numbered frozen versions for history. Remove Save and the unsaved-edits framing. Keep the existing history controls and recovery messages, and clearly distinguish Working from a numbered frozen version in render and comment controls. Update the core/HTTP interface and agent guidance together. An agent still publishes a new version for a picture rebuild until the shots-as-parts plan lands.

Update ADR 0003 and the glossary to distinguish the working reel from a frozen version. Update the Kinotta skill's rule that every change creates a version. Do not delete or merge any existing versions.

## Steps

1. Test and implement durable working-state identity and history. Cover reopening a legacy pending edit list, undo/redo across a freeze, and an agent rebuild without double application.
2. Extract the freeze boundary from Save using staging, media preservation and the existing journal recovery. Test unchanged content, undo-to-frozen content, missing media, concurrent edits and interrupted publication.
3. Route working Final/Overlay renders through the boundary. Add transient Draft captures and their job/listing identity, queue isolation and cleanup. Keep explicit older-version renders unchanged.
4. Freeze and map comments at hand-off, then test later edits, section carry, agent replay and conflict recovery.
5. Build to `docs/mockups/2026-10-14-working-reel.html`, which the owner chooses in a preview before any agent is dispatched. Show Working in Review, remove Save, and connect history, renders and comments to the new core behavior. Follow a saved mockup for any unresolved visual choice before editing the UI.
6. Revise the HTTP/core documentation, glossary, ADR and local Kinotta skill references. Check the installed skill update procedure before synchronizing it.
7. Run the core/render/e2e checks, Impeccable critique and audit, then write the session summary and regenerate the dashboard.

## Risks

- R1: The current journal's base follows the newest version. A self-created freeze could replay operations twice or clear history unless working ancestry is represented explicitly.
- R2: A queued Draft or a concurrent hand-off can accidentally read later edits. Capture immutable job inputs and comment coordinates at the request boundary.
- R3: Media preservation and publication can fail partway through. Reuse transactional staging and recovery, and test that no incomplete version is discoverable.
- R4: Legacy native, legacy footage and code-built reels have different source/path rules. Migrate through their existing resolvers and test each kind without rewriting older versions.

## Checks to run

- `npm run typecheck` and `npm run build`.
- Core edit-list, save, saved-media, replay/carry, hand-off, comment batches and render queue tests. Add public-core regression cases for the acceptance criteria above.
- Browser tests for code-built sound edits, word/caption edits, timeline interactions and working renders.
- E2e undo/redo, reopen, hand-off, renders and legacy version navigation. Use bounded concurrency on this machine and retain complete logs.
- No edit operations on `reels/kinotta-showcase` during verification.
## Changelog

### 2026-10-12
- Plan created with Intent only. Decided with the owner: versions freeze at render and hand-off.
- Owner approved all three recommendations: no manual checkpoint, Draft renders use the working reel without freezing, and live edits apply during hand-off and replay onto the next version. Goal and Approach still need to be written and approved before implementation.
- Goal, Approach, acceptance criteria, steps and risks drafted from the existing journal, Save, render and batch paths. Awaiting approval of this implementation approach. No live-edits code has changed.

### 2026-10-14
- Approved by the owner as written, in the 2026-10-13 grilling session.
- Added: the agent's small changes appear in the Edits list under its name and can be undone.
- The Working screen is to be designed with the owner in a preview before dispatch; step 5 builds to that mockup.
- To be built by Codex (`gpt-6.1-sol`, medium effort) as the first part of one continuous run: live edits, shots as parts, alternates.
