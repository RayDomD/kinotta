---
title: Start from a dropped video (T42)
date: 2026-10-05
status: Done
summary: T42. Dropping a video on New reel streams it into the project's footage/ folder (an identical file is not copied twice), makes an H.264 playback copy for HEVC or ProRes, and starts a reel.
spec: docs/tickets-review-edit.md T42 (#44); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: A reel can only start from a video already in the project; there is no way to bring one in.
- Why: Kinotta works standalone (E1); the owner starts by dropping a file (E11).
- Proposed outcome: A video dropped on the New reel screen lands in `<project>/footage/` and starts a reel. Dropping the same file again reuses the copy. HEVC or ProRes gets an H.264 copy for playback; the original is never altered.
- Affected: `server/core` (import module, runner `makePlaybackCopy`, `footageFile`), `server/http` (`POST /api/footage`), `web/src/NewReel.tsx` (drop zone only), ADR 0002, tests.
- Constraints: ffmpeg only through the runner. The upload is streamed, never held in memory. Keep the NewReel change to the drop zone (T45 edits the same file).
- Out of scope: transcription progress (T43), a H.264 copy for a picked video, deleting copies.
- Open questions: none; decisions below.

## Goal

T42's four criteria met.

## Approach

- `Project.importVideo(name, body)`: streams the body to a temp file in `footage/` while hashing it; if a file in `footage/` has the same size and hash, the temp file is dropped and that path returned (`copied: false`); otherwise it is renamed to the sanitised name (`-2`, `-3` on a name taken by different content). Probes it (a non-video is removed and rejected), and for HEVC or ProRes makes `footage/.playback/<name>.mp4` through the runner.
- `footageFile` serves the playback copy when one exists next to the original; the reel's `footage` still names the original. `listVideos` skips dot folders, so copies are not listed.
- HTTP `POST /api/footage?name=` with the raw file as the body (201 copied, 200 reused). UI: the drop zone and a Choose a file button upload, then start the reel with the name taken from the file (decision: a drop starts at once; rename is for T31 onward).

## Steps

1. Failing tests: core (import, duplicate, HEVC copy, non-video, name clash), e2e (drop on New reel).
2. Runner, import module, `footageFile`, HTTP.
3. UI drop zone.
4. ADR 0002, full checks.

## Risks

- A browser drop of a very large file: the body is a `File`, which `fetch` streams.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, `rtk proxy npm run test:e2e`.

## Changelog

### 2026-10-05
- Plan created.
- Done. Added a tenth e2e server (port 4388) for drop-video.spec.ts.
