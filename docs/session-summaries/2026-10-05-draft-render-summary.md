# Draft render of a code-only reel: summary

Date: 2026-10-05. Ticket T49 (#52). Plan: `docs/plans/2026-10-05-draft-render.md`.

## Shipped vs planned

Shipped as planned.

- `skill/kinotta/engine/render.js` takes optional flags: `--scale` (the page's `deviceScaleFactor`), `--frames
  <from>:<to>`, `--crf`, `--no-blur`, `--codec h264|prores` and `--progress`, which prints JSON lines (the page's size
  and frame count, then one line per frame). With no flags the run is the same: on a test page the old and new scripts
  printed the same line and wrote byte-identical files.
- `runner.ts` gains `renderPage`, which spawns `render.js` with Node and parses its progress. The boundary test now also
  flags any other server module that names `render.js`.
- `server/core/_internal/render.ts` checks a request and renders it. `render-queue.ts` runs jobs one at a time in
  memory and raises `render-progress` events in whole percents with an estimate. `Project` gains `render`,
  `renderJobs` and `whenRendered`. A Draft of a code-only version is half size, CRF 28, no motion blur, 30 fps, written
  to `renders/.render-<job>.mp4` and renamed to `<reel>-v<n>-draft-<height>p30.mp4`. Rendering again replaces it, and
  a failure removes the temp file.
- `kinotta render <reel> v<n> --preset draft` renders in its own process, prints `Rendering <reel> v<n> (draft): N%`
  every 10% and `Rendered <absolute path>`, and exits 0. A refusal or failure prints the reason and exits 1.
- The web client mirrors `RenderJob` and the event. `App.tsx` gives `render-progress` its own branch, which does
  nothing until T56.

## Deviations

- `render.js` also renders a page without `#stage` at the 1920x1080 viewport. The fixture's hand-built code-only pages
  have no stage, and the old script failed on them.
- `render.js` now exits non-zero when ffmpeg fails; it used to exit 0. A successful run is unchanged.
- A code-only page has no source frame rate, so 30 fps stands in as its source rate (`CODE_ONLY_FPS`).
- Final, Overlay and footage reels are refused with `invalid` for now. T50 and T51 replace these refusals.
- The CLI opens the project in-process rather than hosting the HTTP server. Hosting it, with the port file, is what
  T52 needs and adds.
- The per-diff review ran inline, with no sub-agents, as the owner chose for this run. It narrowed the queue to copy
  only `reel`, `version` and `preset` from a request.

## Checks

- typecheck: clean.
- vitest: 40 files, 380 passed, 1 skipped. New: `tests/engine/render.test.ts` (4) and `tests/core/render.test.ts`
  (9), plus the boundary test's `render.js` rule.
- Playwright full suite: 103 passed.
- Manual: `kinotta render product-showreel v2 --preset draft` in a fixture copy took about 24 s, printed 0% to 100%
  and the path, and exited 0. `--preset final` printed the refusal and exited 1.
