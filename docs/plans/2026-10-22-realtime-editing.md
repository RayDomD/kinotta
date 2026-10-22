---
title: Realtime editing
date: 2026-10-22
status: Draft
summary: Cuts close up without the timeline jumping, playback never stalls for a late picture, edits show instantly, seeks are fast on real footage, and Ctrl+Z works on Simple-mode captions.
spec: .herdr/briefs/2026-10-22-timeline-feel-diagnosis2-codex.md
---

## Intent

- Problem: Editing feels slow and jumpy (owner, 2026-10-22). Diagnosis on `integrate/2026-10-21` at `0d87ee1`, before F1–F5; recheck `SimpleMode.tsx` and `SimpleTimeline.tsx` line numbers (codex run 2, reproduced on the real Review and Simple screens):
  - Delete, menu Remove, ClipSettings Remove and Apply snip leave empty space, because they send `leaveGap: true` (plan `2026-10-19-remove-leaves-gap`).
  - When a cut closes up, the fitted timeline refits to the shorter reel, so every clip stretches wider (12 s to 9 s moved a clip edge from 50% to 33%). The playhead jumps to the start of the cut, and a zoomed view pages back to 0. On reels made from raw footage, Simple's timeline still draws the removed footage as striped space even though playback has closed up.
  - Playback freezes ("Waiting for picture") whenever any visible video is not actively playing. A video counts as ready only while it plays (`PictureLayers.tsx:46`), and a picture that isn't ready freezes the clock and sound (`MediaEditor.tsx:369-370`). Measured stalls: 50–260 ms when playback starts or crosses a cut, and 160 ms to over 800 ms when a clip is reordered during playback.
  - Every edit replaces the media plan, which stops all sound and prepares it again (`useMediaPlayback.ts:39-60`). Each edit also waits for the server's reply before the timeline updates (`useEdits.ts`).
  - Footage is played from the original files, whose keyframes can be seconds apart (a Kinotta render: 3–4 s), so each seek decodes many frames. Sound is prepared by downloading each whole video file in the browser (`mediaBytes`).
  - In Simple mode, Ctrl+Z after a caption edit does nothing: no Simple-mode handler routes it to undo (`SimpleMode.tsx:572`, `MediaEditor.tsx:557`). Separately, editing a whole caption phrase in Simple mode silently reverts and is never saved (`MediaEditor.tsx:138`, `:318`).
- Why: The owner edits while playing and feels stutter and lag on every action. Realtime response is the goal.
- Proposed outcome:
  - A cut, snip or delete closes up with no empty space, while the timeline keeps its scale and the cut stays at the same place on screen.
  - Playback never stalls for a late picture: the last frame stays visible until the next is ready, and the "Waiting for picture" message is gone.
  - An edit shows on the timeline at once, without waiting for the server or restarting sound.
  - Clicking, scrubbing and crossing cuts show the picture quickly on real footage.
  - Ctrl+Z and redo work after a Simple-mode caption edit, and whole-phrase caption edits save.
- Affected: `web/src/review/_internal/` (`MediaEditor.tsx`, `PictureLayers.tsx`, `useMediaPlayback.ts`, `useEdits.ts`, `NativeLanes.tsx`, `ClipSettings.tsx`, `timeline.ts`, `CaptionLane.tsx`), `web/src/SimpleMode.tsx`, `web/src/SimpleTimeline.tsx`, `web/src/App.tsx`, `server/core/_internal/import.ts` (proxies and audio files), and the media routes that serve them; core and e2e tests for remove, snip, playback and Simple captions.
- Constraints:
  - Saved edit lists replay to the same result (ADR 0003). Existing entries with `leaveGap: true` keep their meaning; only new edits stop sending it.
  - Trims keep leaving space (owner, 2026-10-22). Shift still gives the other behavior wherever it does today.
  - Final renders still use the original footage. Proxies are only for playback in the editor.
  - Keep the pre-loading of upcoming pictures, the animated revisions, and Review loading the chosen Working revision (AGENTS.md).
  - The server stays the source of truth: an edit shown immediately is rolled back if the server refuses it.
  - Kinotta will be open source: no new dependencies without checking licences. ffmpeg is already required.
  - Verify each change by exercising the actual interaction on Review and Simple, not only with core tests.
- Prior work to fold in: uncommitted In Progress work in `.worktrees/remove-leaves-gap` (plan `2026-10-20-playback-drift-stutter`, research `2026-10-19-cut-stutter-findings`, edits to `MediaEditor.tsx` and `PictureLayers.tsx`, `tests/e2e/playback-stutter.*`, `tests/web/picture-sync.test.ts`, a 4K50 fixture). It predates Simple mode; salvage it here rather than redo it.
- Out of scope: decoding frames with WebCodecs and drawing them to a canvas (only if this plan is not fast enough), a timeline-wide magnet toggle, Simple-mode gestures that don't exist today (playhead drag, clip move), and code-built reels.
- Open questions:
  - Proxy settings: resolution (proposed 540p) and keyframe spacing (proposed every 6 frames). Proposed: make proxies in the background at import, plus once for footage already in projects.

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-22
- Plan created from codex's diagnosis (runs 1 and 2). Owner decisions: cuts, snips and deletes close up; trims keep leaving space; aim for realtime response, including architecture changes; use ffmpeg proxies.
- Base branch resolved: main (PR #59 merged as 5fade2f). Branch `feat/realtime-editing`, worktree `.worktrees/realtime-editing`.
