---
title: Playback copy dedupe
date: 2026-10-18
status: Done
summary: One H.264 playback copy per video content, made once, and no full rehash on every media request.
spec:
---

## Intent

- Problem: Playing a saved version with HEVC footage lags badly. Every ranged media request hashes the whole source,
  and while no playback copy exists each request starts its own ffmpeg transcode into the same staged file. A new
  version with byte-identical media transcodes again because copies are named by path.
- Why: Seen on a RayDom reel (2026-10-18): five concurrent 4K encodes of one 427 MB source, a likely corrupt copy,
  and a laggy editor.
- Proposed outcome: One transcode per video content, shared by every version and request; requests stop rereading
  the source.
- Affected: `server/core/_internal/import.ts`, `server/core/_internal/media-library.ts`, `tests/core/`.
- Constraints: Copies stay in `footage/.playback/` (ADR 0002). A changed source is still refused (ADR 0003 content
  hashes). Existing path-named copies stay valid.
- Out of scope: Serving the original while the first transcode runs.
- Open questions: None.

## Goal

Concurrent callers share one transcode, a version's video copy is keyed by content hash and reuses the library's copy
of the same bytes, and the source hash is cached by path, size and mtime.

## Approach

1. `ensurePlaybackCopy` keeps a map of in-flight copies by destination; each run stages to a unique name.
2. Saved-version videos use `footage/.playback/sha256-<hash>.mp4`. Before transcoding, reuse a library entry's
   playback file with the same content hash.
3. `hashOf` results are cached by resolved path, size and mtimeMs.

## Steps

1. Failing tests in `tests/core/version-media.test.ts` (one transcode for concurrent requests, shared copy across
   versions, changed bytes refused).
2. Implement the three changes.
3. Core suite and typecheck.

## Risks

- A stale hash cache entry if a file changes without size or mtime changing. Accepted: same-size same-mtime rewrites
  are not a real editing pattern.

## Checks to run

- `npm run typecheck`, the core test suite.

## Changelog

### 2026-10-18
- Plan created and approved.
- Implemented. New `tests/core/playback-copy.test.ts`: three tests fail on the old code and pass now; the changed-bytes
  guard passes on both. Tests assert on files in `footage/.playback/` rather than spying on `makePlaybackCopy`, since a
  module mock passed the spy an empty call.
- The saved-version path also checks for the content-named copy before running ffprobe, so a served copy costs one stat.
- Done in `2a2e7b2`. Two failures that also occur on `main` are recorded in the session summary.
