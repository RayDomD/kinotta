# Smooth preview and gentle renders

Implemented on `fix/playback-copy-dedupe`, after the playback copy dedupe, in `352a7fd`, `74c7da7` and `b244743`.
Plan: `docs/plans/2026-10-19-smooth-preview-and-gentle-renders.md`.

Shipped as planned:

- Playback copies are at most 1920 px wide with a keyframe every 0.5 s (`-preset veryfast`). The RayDom copy of a
  4K 50 fps source had keyframes 4–5 s apart, so a seek decoded up to ~240 4K frames.
- A saved version's video checks the library's copy of the same bytes before running ffprobe.
- Render workers: 4 threads each (`RENDER_THREADS`), capped by free memory at 1.5 GB a worker. 16 threads now run 4
  segments, not 8.
- Render ffmpeg (renderer encoder, footage composite, native composite, join) runs with `-threads 4` and
  `-filter_threads 4`. `render.js` takes `--threads`.
- Render processes start below normal priority.
- The editor mounts pictures starting within 3 s, hidden and parked on their first frame, and no longer seeks a paused
  picture that is already on its frame when Play is pressed.

Deviation: three browser test files selected every `.mv-picture`; they now select
`[data-verify-unit="PictureLayer"] > .mv-picture`, the visible pictures, because a preloaded one is in the page.

Copies already on disk keep their old size until deleted; they are caches and are remade on next use.

## Verification

- `npm run typecheck` and `npm run build` passed.
- `tests/core/playback-copy.test.ts` 5/5, including a 2560x1440 source copied to 1920x1080 with keyframe gaps of
  at most 0.5 s (failed at 2560x1440 before the change). `tests/core/gentle-render.test.ts` 2/2.
- Render project: render-segments, render-footage, render-media and render-queue 28/28; render-media-sync 6/6;
  render-media-regions 3/3.
- A real render, inspected while running: `render.js` and its ffmpeg at priority 6 (below normal) with `-threads 4`;
  Chromium processes at 6 except one that raises itself to 10, which Kinotta does not control.
- Unit and web: playback-copy, gentle-render, import-video, media-library, version-media, media-stills, media-http and
  tests/web, 78/79.
- Failures that also occur on the clean branch head: `editor-settings` "keeps Snip, Split, Media and trim keys
  distinct"; `render-media-preview` "creates native frame and word pins…" (two "Later frame" buttons); and
  `render-media-preview` "flags an interrupted graphic…", which failed one of two full-file runs both with and without
  these changes.
- Test runs that overlapped the owner's unthrottled render (old build) timed out and were rerun on an idle machine.
