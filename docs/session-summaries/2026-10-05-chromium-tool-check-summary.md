# Chromium in the tool check: summary

Date: 2026-10-05. Ticket T57 (#52). Plan: `docs/plans/2026-10-05-chromium-tool-check.md`.

## Shipped vs planned

Shipped as planned. `playwright` is a runtime dependency (1.63.0; `@playwright/test` stays a dev dependency). The tool
check adds Chromium, found by asking Playwright for its executable path and checking the file exists, with the hint
`npx playwright install chromium`. Each tool carries `neededFor` (`video`, `render`): Python 3 and faster-whisper serve
reels from video, Chromium serves rendering, ffmpeg serves both. The startup message prints one block per need ("Starting
a reel from a video needs…", "Rendering needs…"), so ffmpeg shows under both. The New reel "Needs on this machine" row
lists only the video tools, so its text is unchanged.

## Deviations

- Playwright's own Chromium was not installed on this machine; the e2e suite runs on installed Chrome
  (`channel: 'chrome'`). It was installed with the hint command so `render.js` can run for T49. The test of the default
  finder asserts it matches Playwright's executable path on disk rather than assuming the browser is present.
- The New reel row's check is its own e2e test: under the full suite's load the tool check's probes take several
  seconds, and inside the start-reel test that wait ran the test past its 30 s budget.

## Checks

- typecheck: clean.
- vitest: 38 files, 367 passed, 1 skipped. `tests/core/tools.test.ts` adds 3 tests and tightens 3.
- Playwright: `new-reel.spec.ts` 2 passed. Full suite: 101 passed, 1 failed, 1 did not run. The failure,
  `brief-reel.spec.ts:58`, is the known load flake: it passes when run alone (3 passed).
