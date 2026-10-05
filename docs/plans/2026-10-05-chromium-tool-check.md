---
title: Chromium in the tool check (T57)
date: 2026-10-05
status: Done
summary: The startup tool check finds Playwright's Chromium, and each missing tool says whether reels from video or rendering need it.
spec: docs/specs/2026-10-05-approve-and-render.md
---

## Intent

- Problem: Rendering needs Playwright's Chromium at run time, but `playwright` is only a dev dependency and the startup check doesn't look for a browser. A machine without it fails at the first render with no hint.
- Why: T49 starts `render.js`, which launches Chromium. The owner should learn what is missing at startup, as for ffmpeg.
- Proposed outcome: `playwright` is a runtime dependency. The tool check lists Chromium with the hint `npx playwright install chromium`. The startup message says which tools reels from video need and which rendering needs.
- Affected: `package.json`, `server/core/_internal/tools.ts` and `types.ts`, the web client's `ToolStatus`, `MissingTools.tsx`, `tests/core/tools*.test.ts`.
- Constraints: R15. Chromium is found through Playwright's executable path, not a PATH probe. The check never throws.
- Out of scope: installing anything; the render itself (T49).
- Open questions: None.

## Goal

The tool check reports Chromium, and every missing tool's message names what it is needed for.

## Approach

`ToolId` gains `chromium`, and `ToolStatus` gains `neededFor: ('video' | 'render')[]`. Python and faster-whisper serve reels from video, ffmpeg serves both, Chromium serves rendering. `checkTools` takes an injectable `findChromium` (tests pass a fake); the default imports `playwright` lazily, reads `chromium.executablePath()` and checks that the file exists, returning false on any error. `missingToolsMessage` prints one block per need: "Starting a reel from a video needs tools that are missing:" and "Rendering needs tools that are missing:", each with `name: hint` lines, so ffmpeg can appear under both.

The New reel "Needs on this machine" row is about starting a reel from video, so `MissingTools` lists only the tools with `video` in `neededFor`. Its text stays as it was.

`playwright` moves into `dependencies` at the installed version (1.63.0); `@playwright/test` stays a dev dependency.

## Steps

1. Tests: a missing Chromium is named with its hint under "Rendering"; a missing ffmpeg appears under both; transcription tools name reels from video only; the HTTP listing includes chromium.
2. Types, `checkTools`, `missingToolsMessage`, the client type and `MissingTools`.
3. `package.json` and the lockfile.

## Risks

Importing `playwright` in the server costs a little startup time; it happens once, lazily, inside the check.

## Checks to run

typecheck, full vitest, Playwright `new-reel.spec.ts`.

## Changelog

### 2026-10-05
- Plan created and built. Summary: `docs/session-summaries/2026-10-05-chromium-tool-check-summary.md`.
