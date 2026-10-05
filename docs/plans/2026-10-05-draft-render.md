---
title: Draft render of a code-only reel (T49)
date: 2026-10-05
status: Done
summary: render.js gains flags and JSON progress, the core queues a Draft render of a code-only version, and kinotta render runs it from the command line.
spec: docs/specs/2026-10-05-approve-and-render.md
---

## Intent

- Problem: Kinotta can't turn a version into a video file. The skill's `render.js` renders a page, but only at full size with motion blur and CRF 14, and it says nothing until it is done.
- Why: every later render ticket (footage, gate, queue across processes, presets, segments, Picker) builds on one engine in the core and one renderer.
- Proposed outcome: a Draft of a code-only version renders into the reel's `renders/` folder with a name that says what it is, from the core and from `kinotta render`, with progress as it goes.
- Affected: `skill/kinotta/engine/render.js`, `server/core/_internal/runner.ts`, a new core render module and queue, `Project`, `ProjectEvent` (core and web client), `App.tsx`'s event handler, `server/cli.ts`, the runner boundary test, the core README.
- Constraints: R1, R8, R12 (single-process half), R14, E3. `render.js`'s default run stays the same for the skill. Processes start only through `runner.ts`. A failed render leaves no file in `renders/`.
- Out of scope: footage reels, Final and Overlay (T50, T51), the port file, `--project` and cancel (T52), settings (T53), parallel segments (T54), any UI (T55, T56).
- Open questions: None.

## Goal

`project.render({ reel, version, preset: 'draft' })` queues a job that writes `reels/<reel>/renders/<reel>-v<n>-draft-<height>p<fps>.mp4` at half size, CRF 28 and without motion blur, raising `render-progress` events, and `kinotta render <reel> v<n> --preset draft` does the same from a terminal and exits.

## Approach

**render.js.** Positional arguments stay `html out [fps]`. New flags, all optional: `--scale <n>` (the page's `deviceScaleFactor`, so the page is scaled rather than re-laid out), `--frames <from>:<to>` (a frame range, end exclusive), `--crf <n>`, `--no-blur` (one sample per frame instead of four), `--codec h264|prores` (default: ProRes for an alpha page, H.264 otherwise, as now) and `--progress`. With `--progress` it prints JSON lines on stdout: first `{"width","height","fps","frames"}`, then `{"frame": done, "frames": total}` after each frame. Without any flag the arguments, the encoder settings and the output are what they were. A page without `#stage` renders at the 1920x1080 viewport instead of failing (Kinotta's hand-built code-only pages have no stage). An ffmpeg failure now sets a non-zero exit code; before, the script exited 0.

**Runner.** `renderPage({ page, out, fps, scale, crf, blur, codec }, onProgress)` spawns `node render.js … --progress` and parses the JSON lines, like `transcribeAudio`. It resolves with the page's size and frame count and rejects with the stderr tail. The boundary test also flags any other module that names `render.js`.

**Core.** `render.ts` turns a request into a job: it checks the reel and version exist and that the reel is code-only and the preset is Draft (else `invalid`, naming what isn't built yet). Draft is scale 0.5, CRF 28, no blur, H.264, 30 fps (a code-only page has no source frame rate, so 30 is named as its source rate). The job renders to `renders/.render-<job>.mp4`, then renames it to `<reel>-v<n>-draft-<height>p<fps>.mp4`, replacing a file with the same name. Any failure removes the temp file. `render-queue.ts` holds jobs in memory and runs one at a time, emitting `{ type: 'render-progress', job }` on every change; `Project` gains `render(request)`, `renderJobs()` and `whenRendered(jobId)`.

**CLI.** `kinotta render <reel> v<n> --preset draft` opens the project in its own process (the single-process half of R12), subscribes, queues the job, prints progress in steps of 10% and then `rendered <path>`, and exits 0; a failure prints the reason and exits 1. Joining a running editor's queue is T52.

**Web.** The client mirrors the event type and `App.tsx` gives `render-progress` its own branch (ignored until T56), so it isn't mistaken for a comment change.

## Steps

1. Tests: `render.js` flags (a frame range at a small scale gives the expected frame count and size; the default command line is unchanged), core Draft render (file name, size, CRF via ffprobe, replace, failure leaves nothing, events), CLI render, the boundary test.
2. render.js flags and progress.
3. Runner, render module, queue, Project, types.
4. CLI and web event branch.

## Risks

- `deviceScaleFactor` below 1 must produce a half-size screenshot in Chromium; checked before building on it.
- A 15-second fixture at 30 fps is 450 screenshots per Draft. Tests render it once or twice; more coverage uses `--frames`.

## Checks to run

typecheck, full vitest (including `tests/core/start-reel.test.ts`), the full Playwright suite (App.tsx changes).

## Changelog

### 2026-10-05
- Plan created and built. Summary: `docs/session-summaries/2026-10-05-draft-render-summary.md`.
