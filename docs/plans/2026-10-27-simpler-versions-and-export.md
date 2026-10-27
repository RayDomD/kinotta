---
title: Simpler versions and export
date: 2026-10-27
status: Draft
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
  - O1: Other "complicated things" the owner wants gone besides freeze (asked 2026-10-27, waiting).
  - O2: Does "Use this version" replace Working's edits as one undoable step, or start a fresh Working? Recommended: one undoable edit.

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-27
- Plan created with Intent only. Owner chose: keep all three export choices with plain names, a tooltip each and a "Why this?" line; bring back the version list; remove freeze from the screens.
