---
title: Smooth preview and gentle renders
date: 2026-10-19
status: Done
summary: Editor-sized playback copies, preloaded cuts, and renders that leave the machine usable.
spec:
---

## Intent

- Problem: Review shows "Waiting for picture…" on every Play, seek and cut, and a render freezes the owner's machine.
  Measured on RayDom (2026-10-18/19): media requests take 0.3–0.9 s before the first byte; playback copies are
  3840x2160, 50 fps, 22 Mbps with keyframes 4–5 s apart, so each seek decodes up to ~240 4K frames; the next picture
  starts loading only when its cut arrives. A render of a 4K reel ran 8 segments at once on 16 threads (13 ffmpeg,
  6 Chromium), CPU 100%, 0.4 GB of 15.2 GB RAM free.
- Why: It slows the owner's whole workflow, inside and outside Kinotta.
- Proposed outcome: Play, seek and cuts start almost at once, and the machine stays responsive while a render runs.
- Affected: `server/core/_internal/{import,media-library,runner,render}.ts`, `skill/kinotta/engine/render.js`,
  `web/src/review/_internal/{MediaEditor,PictureLayers}.tsx`, `tests/`.
- Constraints: Renders keep using originals at full quality. Playback copies stay in `footage/.playback/` (ADR 0002).
- Out of scope: Replacing playback copies already on disk (they are caches; delete them to remake). Serving the
  original while the first copy is made.
- Open questions: None.

## Goal

Playback copies are editor-sized with frequent keyframes, upcoming pictures are loaded before their cut, and a render
runs at most a few segments with bounded threads at below-normal priority.

## Approach

1. `mediaFile`: look for the library's copy of the same bytes before running ffprobe.
2. `makePlaybackCopy`: at most 1920 px wide (aspect kept, even sizes), a keyframe every 0.5 s, `-preset veryfast`.
3. Editor: `PictureLayers` also mounts pictures starting within 3 s, hidden and paused at their in-point, so the same
   element plays at the cut. A picture is only seeked when it is off its target, not on every Play.
4. Render workers: 4 threads per worker (was 2) and no more workers than free memory allows at about 1.5 GB each.
5. ffmpeg threads: each render's ffmpeg (composite, join, the renderer's encoder) gets `-threads` of cores ÷ workers.
6. Priority: render processes start at below-normal priority; their Chromium and ffmpeg inherit it on Windows.

## Steps

1. Tests: playback copy width and keyframe spacing; worker count from cores and memory.
2. Server changes 1, 2, 4, 5, 6.
3. Editor change 3, checked in the browser against a reel with a cut.
4. Typecheck, build, core tests by file, render tests.

## Risks

- Fewer workers lengthen renders. Accepted: the machine stays usable, and oversubscribed workers were not faster.
- Hidden preloaded videos hold decoder memory. Bounded to pictures starting within 3 s.

## Checks to run

- `npm run typecheck`, `npm run build`, affected core and web tests, the render project.

## Changelog

### 2026-10-19
- Plan created and approved by the owner ("let's do it and the previous comments").
- Implemented in `352a7fd` (playback copies), `74c7da7` (renders) and `b244743` (preload). Picture tests now select
  visible layers, since a preloaded picture is in the page but hidden. Details in the session summary.
