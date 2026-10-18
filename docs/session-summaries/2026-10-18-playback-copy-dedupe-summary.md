# Playback copy dedupe

Implemented on `fix/playback-copy-dedupe`, from `main` at `5f3a23d`, in commit `2a2e7b2`. Plan:
`docs/plans/2026-10-18-playback-copy-dedupe.md`.

Found on a RayDom reel: five ffmpeg transcodes of one 427 MB 4K HEVC source ran at once, all writing one staged file,
and the editor lagged. Every ranged request for a saved version's video rehashed the whole source, and while no copy
existed each request started its own transcode. A new version with the same bytes transcoded again because copies were
named by path.

Shipped as planned:

- `ensurePlaybackCopy` shares an in-flight copy per destination, and each transcode stages to its own name.
- A saved version's video copy is `footage/.playback/sha256-<hash>.mp4`, shared by every version with those bytes.
  Before transcoding, a library entry's copy of the same bytes is reused. Path-named copies for library and footage
  files are unchanged.
- `hashOf` caches by resolved path, size and mtime, so a changed file is still refused.

One addition: the saved-version path checks for the content-named copy before running ffprobe, so a served copy costs
a hash-cache lookup and one stat.

## Verification

- `npm run typecheck` passed. `npm run build` passed with its existing bundle-size advisory.
- New `tests/core/playback-copy.test.ts`: 4 passed. On the unfixed code, the three behaviour tests fail and the
  changed-bytes guard passes. Tests assert on files in `footage/.playback/`; a module mock of `makePlaybackCopy` passed
  the spy an empty call, so it was dropped.
- A full parallel run timed out 29 process-spawning tests under load. Run on their own, alternates-build, editing,
  handoff, version-media and editor-settings give 30 of 31, and the render project 15 of 16, the same with and without
  the fix.
- Two failures exist on `main` without this change: `editor-settings` "keeps Snip, Split, Media and trim keys distinct"
  and `render-media-preview` "creates native frame and word pins…" (strict-mode match on two "Later frame" buttons).
