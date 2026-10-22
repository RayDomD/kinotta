---
title: Realtime editing
date: 2026-10-22
status: In Progress
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
  - None. Resolved (owner, 2026-10-22): proxies are 540p with a keyframe every 6 frames, made in the background at import plus once for footage already in projects.

## Goal

On Review and Simple, with the owner's real footage: a cut, snip or delete closes up while the cut stays at the same screen position; no "Waiting for picture" message and no clock or sound hold while playing, seeking, crossing cuts or reordering; an edit shows on the timeline in the same frame it is made; and Ctrl+Z, redo and whole-phrase edits work on Simple captions.

## Approach

Claude orchestrates. Codex and agy work at the same time in separate worktrees, then Claude merges both into `feat/realtime-editing` and re-runs every check. agy splits its share across parallel Gemini 3.8 agents with no overlapping files. All fixes are test-first: a failing test, then the fix.

- **Lanes and worktrees.** Codex: `.worktrees/realtime-codex` on `feat/realtime-codex`. agy: `.worktrees/realtime-agy` on `feat/realtime-agy`. Both branch from `feat/realtime-editing`.
- **Shared file rule.** In `MediaEditor.tsx`, codex owns playback, picture readiness and the waiting status (the hold, `pictureStatus`, the waiting text, the `PictureLayers` mount). agy owns edit commands, the fitted window and snip seeks, and caption handlers (`retypeCaption`, the Simple key guard). Neither lane changes the other's lines; anything that needs to is reported, not edited.
- **Contract between lanes.** agy's server work adds `GET /api/media/:id/audio`, with the same `reel`/`version` query as the existing media URL. It returns an AAC audio-only file and a `mediaAudioUrl` helper in `web/src/api/`. The existing media URL serves the editing proxy once it exists and falls back to the playback copy or original until then. Codex codes against that contract and falls back to today's `mediaBytes(sourceUrl)` while the audio file is missing.

Codex, playback engine (in order):
1. **Picture readiness from a decoded frame.** In `PictureLayers.tsx`, a picture becomes ready on `loadeddata`/`canplay`/`seeked`, or on `requestVideoFrameCallback` where supported. Pause no longer clears it. Salvage the rate-based drift correction (`syncPicture`, `SEEK_DRIFT`, `RATE_LIMIT`) and `tests/web/picture-sync.test.ts` from `.worktrees/remove-leaves-gap`, plus `tests/e2e/playback-stutter.{spec,config}.ts` and its 4K50 fixture. Drop its 150 ms grace hold, which this plan replaces.
2. **No hold.** Remove `playback.hold`, `held` and the "Waiting for picture" text. The clock and sound never wait for pictures. The old frame stays visible until the new frame is decoded, then the new layer shows; no black flash.
3. **Playback engine outside React render.** Move scheduling in `useMediaPlayback.ts` into a plain engine object that the hook wraps. A `media` change reschedules sound from the current moment and keeps `ready` and decoded buffers. Only genuinely new sources are prepared. Sound comes from the audio route when available.
4. **One video element per source.** Pool `<video>` elements by source, not by placement, so a reorder or a cut within one file reuses the decoder. Keep the 3 s pre-loading of upcoming pictures.
5. **Optimistic edits.** `useEdits.add/remove/undo/redo` apply the change to the local list at once (with `applyOperations`, already client-side), send it to the server in the background, and roll back with the server's reason if refused. `App.tsx`'s `edits-changed` reload does not replace a pending local change. The server's list wins once it arrives.

agy, in parallel (agents take separate items):
- **A1 Close up.** Stop sending `leaveGap: true` from Delete, menu Remove, ClipSettings Remove and Apply snip (`MediaEditor.tsx`, `ClipSettings.tsx`). Trims are unchanged. Core support for saved `leaveGap` entries stays. Update button and hint text that promises a gap.
- **A2 Anchored timeline.** Keep the timeline's seconds-per-pixel scale and viewport across an edit; only explicit Fit rescales. After a closing edit, map the playhead through the removed range: unchanged before it, moved to the join inside it, shifted earlier after it. Keep the cut at its screen position, and suppress follow-paging for that one update. Covers `timeline.ts`, `NativeLanes.tsx`, the fitted window in `MediaEditor.tsx`, and `SimpleTimeline.tsx`.
- **A3 Simple draws played time on legacy reels.** `SimpleTimeline.tsx` and `SimpleMode.tsx` lay out surviving pieces at their reel time and show a cut as a join marker. Cut resizing still maps through to source ranges.
- **A4 Simple caption fixes.** Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y in `SimpleMode.tsx` call `edits.undo`/`redo`, except inside text fields. `retypeCaption` checks `captionEditable`, not `editable`.
- **A5 Proxies and audio files.** In `server/core/_internal/import.ts` and `runner.ts`, add a proxy maker: H.264, 540p, a keyframe every 6 frames, plus an AAC audio-only file. Both are stored by content hash under `footage/.proxy/` and `footage/.audio/` (dot folders, like `.playback/`). They are made in the background at import through the existing copy slots, plus a one-time background pass for footage already in projects. `mediaFile` serves the proxy for editor playback; renders and `original` reads keep the original. Add the audio route and the `mediaAudioUrl` helper. Saved versions' sources get proxies too, by content hash.

## Steps

1. Claude: create both lane worktrees, write the two briefs, dispatch both lanes, and watch each brief's Status.
2. Codex: engine steps 1–5, one commit per step, each with its failing test first.
3. agy: A1–A5, one commit per item, each with its failing test first.
4. Claude: verify each lane's diff against its scope, then merge `feat/realtime-codex` and `feat/realtime-agy` into `feat/realtime-editing`. Resolve `MediaEditor.tsx` by hand, regenerate `docs/plans/index.html`, and run all checks.
5. Claude: run the timeline-feel harness (`tests/artifacts/timeline-feel/repro.mts`) against main and the merged branch and record both sets of numbers.
6. Owner: check on real footage in Review and Simple. Then `/code-review`, then the PR.

## Risks

- **Sound ahead of picture.** Without a hold, a slow decode lets sound run ahead for a moment. Proxies and pooled elements keep that short. If the owner sees visible drift on 4K footage, revisit with a frame-skip rather than a hold.
- **Optimistic rollback.** A refused edit visibly snaps back. Some operations may depend on server-only state (media library, generated parts); those stay server-first, and codex lists which ones.
- **Proxy disk use and time.** The one-time pass over existing footage takes CPU and disk. It runs in the background through the two existing copy slots, and playback falls back to the original until each proxy is ready. ADR 0002 says the editor's copies are the only files it adds outside `reels/`; proxies and audio files are more of those copies, and A5 updates the ADR's wording.
- **Merge conflicts in `MediaEditor.tsx`.** The ownership rule above limits them; Claude resolves the rest.
- **Line numbers have moved.** The diagnosis was taken at `0d87ee1`, before F1–F5; lanes recheck every reference on main.
- **Stale built bundle.** Some e2e runs read `dist/web`; run `npm run build` before e2e, as the stutter plan found.

## Checks to run

- `npm run typecheck`
- `npm test`
- `npm run build`, then `npx playwright test tests/e2e/playback-stutter.spec.ts tests/e2e/simple-mode.spec.ts tests/e2e/editing.spec.ts tests/e2e/snip-save.spec.ts tests/e2e/review.spec.ts tests/e2e/alternates.spec.ts tests/e2e/working.spec.ts`
- New e2e checks, red before and green after: a cut keeps the next clip's screen position and the playhead maps through the cut, in Review and Simple; no `data-verify-waiting` episode while playing across a cut and reordering; an edit shows before the server replies; Simple Ctrl+Z and redo after a word edit; a Simple whole-phrase edit saves.
- Core tests: saved `leaveGap: true` lists replay unchanged; the proxy and audio files are made, served for editing, and never used by renders.
- Full `npm run test:e2e` once on the merged branch; failures that also fail on main are listed, not fixed.
- Timeline-feel harness numbers, main and merged branch.
- Owner: real footage in Review and Simple.

## Changelog

### 2026-10-22
- Plan created from codex's diagnosis (runs 1 and 2). Owner decisions: cuts, snips and deletes close up; trims keep leaving space; aim for realtime response, including architecture changes; use ffmpeg proxies.
- Base branch resolved: main (PR #59 merged as 5fade2f). Branch `feat/realtime-editing`, worktree `.worktrees/realtime-editing`.
- Owner approved the Intent, including proxies at 540p with a keyframe every 6 frames. Goal through Checks drafted: Claude orchestrates; codex takes the playback engine and optimistic edits; agy takes close-up, timeline anchoring, Simple fixes and proxies with parallel Gemini 3.8 agents.
- Owner approved the plan. Lanes dispatched: codex on feat/realtime-codex, agy on feat/realtime-agy.
- Codex: steps 1-5 (e167b4d, 8385ec4, 77ee60f, 628e721, 4651686), save waits in tests (5d4e466), four regressions found by Claude fixed (4fb1f11). Owner chose extra decoders only for simultaneous uses of one source. agy: A1-A5 with three parallel Gemini 3.8 agents.
- Merged both lanes (4867155, 9c40a4c); verify test now blocks the audio route too (2c32b14). Merged checks: build pass; vitest 1112 pass, 1 skip, 1 fail (editor-settings, fails on main); e2e 66/71, the 5 failures pass alone under no load (6/6); optimistic-edits 3/3; playback-stutter 4/4.
- Owner tried the merged build on RayDom (port 4330): "looking well, it feels good".
- Before/after (timeline-feel harness, main 5fade2f vs this branch, same 12 s fixture; added clock-freeze and picture-freeze samplers, >50 ms while playing): Waiting-for-picture 20 episodes/1307 ms -> 0; clock freezes 13/1500 ms (max 250) -> 2/121 ms (max 69); picture freezes 8/1028 ms (max 200) -> 5/552 ms (max 148). Simple Ctrl+Z after a word edit and whole-phrase save: fail on main, pass here. Zoomed 1-8 s cut: next clip edge moves x 183 -> 366 on main, stays at 183 here.
- Found by the harness: in Simple on a legacy (pieces) reel, resizing a cut rescales the ruler to source length, misplaces the join marker against the piece boundary and leaves empty space after the video. Sent to agy.
- agy fixed the legacy cut-resize bug (e11c56c): scale stays anchored, join marker on the piece boundary. Verified: typecheck, 5 Simple test files 19/19, harness LEGACY_AFTER and screenshot, simple-mode e2e 14/14.
