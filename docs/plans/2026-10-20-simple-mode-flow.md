---
title: Simple mode and a lighter editor
date: 2026-10-20
status: In Progress
summary: Drop-a-video simple mode with timeline pins and one-pass regenerate; remove approval and version gating
spec: docs/mockups/2026-10-20-simple-mode-single-pass.html
---

## Intent

- Problem: Kinotta is too confusing for a creator who just wants to drop a video and fix a few moments. Approval, version history and the copy-a-request handoff to an outside agent all stand between the owner and a finished reel.
- Why: The owner wants Kinotta as user friendly as possible before open sourcing it.
- Proposed outcome: Two modes on one project. Simple mode (the default): a one-time "About you" profile, drop a video, Make, then watch, pin moments with required typed notes, press one Regenerate that handles every new or changed pin in a single agent pass while the old cut keeps playing, step through pins (`[` `]`) to pick an alternate or keep the original, and export MP4 + CapCut. Detailed mode: today's editor, opened from the same project, with alternates kept.
- Affected: `web/src` (new simple-mode surface, Pins, App version/approval UI), `server/core/_internal/approval.ts`, `requests.ts`, `handoff.ts`, `runner.ts` (headless agent launch), `parts-alternates.ts`, `server/http/_internal/handler.ts`, `skill/kinotta`.
- Constraints: Kinotta starts processes only through `runner.ts`. The agent is the user's own installed CLI on their login, with no keys shipped (open-source). The agent runs scoped to the reel folder. Version folders stay as the storage unit underneath. Keep the copy-request fallback when no agent is installed. Preserve the animated revisions and the Review fix that loads the chosen Working revision.
- Borrowed ideas (from the 24/7 Editor course, join.aleccuenca.com/course; clean-room, no kit content copied):
  - Automatic dead-air pass on Make: cut word gaps over a threshold and trim breaths from the transcript's word timings, with one strength setting (gentle / normal / tight).
  - Cover reading glances with b-roll: detect look-away moments with a frame pass and let the build cover them. Later step; needs a vision pass.
  - Notes become rules: after Regenerate, "Always do this?" on a pin note appends it to `~/.kinotta/taste.md`.
  - Signature style: no style quiz. The look comes from the repo's DESIGN.md, which builds already read, plus the profile.
- Out of scope: Per-pin chat threads (rejected for speed). A terminal surface. Rewriting the detailed editor beyond removing approval/version gating.
- Open questions:
  - Resolved 2026-10-20: the user chooses their agent (Claude Code or Codex) in a setting.
  - Can the final MP4 re-render only the changed sections, or is it always a full render? (unverified)
  - Does the pending inline-alternates card in AGENTS.md still apply to detailed mode, or does simple mode's per-pin picker replace it?

## Goal

A creator drops one video, a few videos or a folder, gets a cleaned reel without waiting on transcodes, fixes moments with pinned notes in one Regenerate pass, and exports MP4 + CapCut. Each phase ships alone and leaves the app working.

## Approach

Build simple mode on the existing project model: version folders stay underneath, pinned comments become the pins, and the existing comment-batch request becomes the single-pass Regenerate, launched by Kinotta through `runner.ts` instead of copied. Measured on a 20 s / 50 MB iPhone HEVC clip: copy 0.1 s, hash 0.3 s, playback copy 13.7 s (`medium`), 6.2 s (`ultrafast`). The transcode is the drop wait.

## Steps

### Phase 1: Fast drop
1. Import returns once the file is in `footage/`; the playback copy runs in the background and the clip shows "preparing playback…" until ready.
2. Playback copy uses `-preset ultrafast` (`runner.ts:461`). Export settings unchanged.
3. Drop zone takes every dropped file, one progress row each; at most two background encodes at a time.
4. Folder drop and "Choose a folder…": walk subfolders, import every video, skip hidden and non-video files, show "Found N videos in <folder>".

### Phase 2: Remove approval and version gating
5. Remove `approval.ts`, its HTTP route, the approved badge and `approval-changed` event; move `requireVersionDir` to where `render.ts` can use it.
6. Hide version history in the UI behind "current" plus undo. Version folders stay.

### Phase 3: Simple mode surface
7. One-time "About you" profile (stored per machine), default to Simple mode, "Open in editor" to the detailed mode.
8. Drop → Make → preview with timeline, pins with required notes, pin list with jump and `[` `]`.
9. Regenerate initially copies the request (existing fallback) so the surface works before Phase 5.

### Phase 4: Dead-air pass
10. On Make, cut word gaps over a threshold and trim breaths from transcript word timings; one strength setting (gentle / normal / tight).

### Phase 5: Agent launch and single pass
11. Setting: Claude Code or Codex, with a setup check like the missing-tools screen; copy-request stays as fallback.
12. Regenerate launches one headless run through `runner.ts`, scoped to the reel folder, sending only new or changed pins; per-pin status streams into the list; the old cut keeps playing.
13. Per pin: 2–3 alternates plus Original, pick to apply.

### Phase 6: Notes become rules
14. "Always do this?" on a pin note appends it to `~/.kinotta/taste.md`.

### Phase 7 (later): Cover reading glances
15. Frame pass flags look-away moments; the build covers them with b-roll.

## Risks

- Browsers hide a dropped file's path, so large files still upload through HTTP; measured cheap, but very large files may need a native picker later.
- `ultrafast` playback copies are about 6x larger on disk.
- Headless agent runs cost the user's plan quota and can edit files; scope the working directory and tools.
- Removing approval touches render, HTTP and UI; existing approval tests are deleted or rewritten.

## Checks to run

- Phase 1: unit test that import returns before the playback copy finishes; e2e dropping a folder with mixed files; re-time a drop in the running app.
- Phase 2: typecheck, full core tests, e2e versions/review still pass; Review still loads the chosen Working revision.
- Phase 3+: e2e of the exact simple-mode interaction in the browser for each phase.

## Changelog

### 2026-10-20
- Plan created with Intent only. Mockup chosen: single-pass flow.

### 2026-10-20 (later)
- Agent is a user setting. Folded in dead-air pass, b-roll over glances (later), notes-become-rules; style from DESIGN.md.
- Merged fast-drop into this plan; Goal, Approach and seven phases written. Awaiting approval.
- Approved; Phase 1 started.
