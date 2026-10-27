---
title: Simpler versions and export
date: 2026-10-27
status: In Progress
summary: Drop "freeze" from the screens, let stale edits be skipped with Undo instead of blocking, bring back the version list, and give Export plain names with a tooltip each.
spec:
---

## Intent

- Problem:
  - The word "freeze" and its blocking step reach the owner. Saving comments fails with "One edit no longer applies to v3. Remove it or redo it, then freeze Working." (`server/core/_internal/save.ts:185`), and Export reads "Final, freezes as v4" (`web/src/Renders.tsx:276`).
  - The version list was removed on 2026-10-15 (`0bffa46`, "integrate working reels, parts and alternates"). The rail shows only "Current · N edits" with Undo and Redo (`VersionRail`, `web/src/App.tsx:199`), so the owner cannot look at v1, v2 or v3, although their folders and the storage API still exist.
  - Export offers Draft, Final and Overlay (`web/src/Renders.tsx:9-11`) with no word on what each is for.
- Why: The owner asked on 2026-10-27 to remove complicated steps that Undo can already cover, and to see earlier versions again.
- Proposed outcome:
  - No screen says "freeze". Saving Working as a new version still happens when comments are sent or a Final is rendered; the new version simply appears in the version list.
  - An edit that no longer applies does not block saving. It is skipped, a short note names it and its shot, and Undo brings it back. (The fix that stops edits going stale is `2026-10-27-carry-edits-across-copies.md`; the clickable error lives there.)
  - The rail lists Current, then every saved version, newest first. Clicking a version opens it read-only. "Use this version" makes it Working, and Undo reverses that.
  - Export keeps all three choices, renamed in plain words: Quick preview (Draft), Video (Final, the default), Transparent overlay (Overlay). Each has a tooltip saying what it does and a "Why this?" line, for example "Quick preview: cheap and fast to render; for checking timing or sending someone a quick look. Doesn't save a version."
- Affected: `web/src/App.tsx` (`VersionRail`), `web/src/Renders.tsx`, `server/core/_internal/save.ts`, `server/core/_internal/edit-list.ts`, version routes in `server/http/_internal/handler.ts`, `DESIGN.md` copy, editor and e2e tests that read "freeze" text or the rail.
- Constraints: Versions on disk stay frozen and replay the same (ADR 0003); only the wording and blocking change. Render preset ids (`draft`, `final`, `overlay`) and the `kinotta render --preset` CLI stay the same. Preserve the animated revisions and the Review fix that loads the chosen Working revision. Simple mode keeps working.
- Out of scope: Deleting versions, comparing two versions side by side, and new render presets.
- Open questions:
  - O1: Resolved 2026-10-27: nothing else besides freeze for now.
  - O2: Does "Use this version" replace Working's edits as one undoable step, or start a fresh Working? Resolved 2026-10-27, owner approved: one undoable edit.

## Goal

1. No screen in the editor or Simple mode shows the word "freeze".
2. Saving with a stale edit succeeds: the edit is skipped, a note names it and its shot, and Undo restores it.
3. The rail lists Current, then every saved version newest first; clicking one opens it read-only; "Use this version" makes it Working in one undoable step.
4. Export shows Quick preview, Video (the default) and Transparent overlay, each with a tooltip and a "Why this?" line.

## Approach

**Wording.** Replace user-facing "freeze" strings (`save.ts`, `Renders.tsx:276`, `MediaEditor.tsx:632`, labels in `App.tsx`) with plain text such as "Saved as v4". Internal names (`editsSinceFreeze`, `frozen`) stay.

**Stale edits.** In `buildWorking` (`save.ts:182-185`), instead of throwing on flagged edits, save without them and record one undoable "skipped" step in the edit list, so Undo puts them back as flagged. The reply names the skipped edits; the carry plan's clickable entries show them.

**Version list.** Bring back the rows removed in `0bffa46`, using `GET /api/reels/<slug>/versions` (`handler.ts:650`) and the existing read-only version view. "Use this version" adds one edit-list operation that sets Working's base inputs to that version's; Undo removes it. `23f782e` (the original rail) has markup and tests to reuse.

**Export.** Rename the labels in `Renders.tsx:9-11`, default to `final`, and add a tooltip plus a one-line "Why this?" under each choice:
- Quick preview: "A fast, lower-quality video of Working. Why this? Cheap and fast to render; for checking timing or sending a quick look. Doesn't save a version."
- Video: "The full-quality video. Why this? The one to publish. Saves Working as the next version."
- Transparent overlay: "Only the motion graphics, on a transparent background. Why this? To lay over your footage in another editor such as Premiere."

## Steps

1. [x] Tests (red): no "freeze" in rendered editor text; save with a flagged edit succeeds and Undo restores it; the rail lists versions; "Use this version" then Undo leaves Working unchanged.
2. [x] Wording changes.
3. [x] Skip-and-undo for stale edits in `save.ts` and `edit-list.ts`.
4. [x] Version rail rows, read-only open, "Use this version".
5. [x] Export labels, default, tooltips and "Why this?" lines.
6. [x] E2e: open v1 from the rail, use it, Undo; the export menu shows three choices with their descriptions.

## Risks

- A skipped edit can go unnoticed: the note stays until dismissed, and Undo always restores it.
- "Use this version" touches the edit list's base version; test with parts and alternates reels, and keep the Review fix that loads the chosen Working revision.
- Simple mode shares components; check it for leftover "freeze" text.

## Checks to run

- New core and render tests, full core suite.
- Version rail and export e2e.
- `rg -i freeze web/src --glob '*.tsx'` shows no user-facing strings.
- `npm run typecheck`, `npm run build`.

## Changelog

### 2026-10-27
- Plan created with Intent only. Owner chose: keep all three export choices with plain names, a tooltip each and a "Why this?" line; bring back the version list; remove freeze from the screens.
- Owner approved the Intent and its recommended answers; Goal, Approach, Steps, Risks and Checks written. Status Approved.

### 2026-10-28
- Cloud run paused after all six steps, with its last changes in `842de60` unreviewed. Owner approved finishing it locally: merge main, review the branch, run the plan's checks, fill the Result, open the PR, merge when green.
