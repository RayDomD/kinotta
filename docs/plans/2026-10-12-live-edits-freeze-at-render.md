---
title: live-edits-freeze-at-render
date: 2026-10-12
status: Draft
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
  - O1: Does a manual "keep this as a version" action stay for the moments you want a checkpoint without rendering, or do render and hand-off cover it?
  - O2: A Draft render is a quick check. Does it freeze a version like Final and Overlay, or render the working reel without one?
  - O3: While a batch is handed off, edits collect but Save is refused today. With no Save, do live edits keep applying during a hand-off and replay onto the agent's version as now?

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-12
- Plan created with Intent only. Decided with the owner: versions freeze at render and hand-off.
