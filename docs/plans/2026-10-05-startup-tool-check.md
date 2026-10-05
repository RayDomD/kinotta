---
title: Startup check for Python, ffmpeg and faster-whisper
date: 2026-10-05
status: Done
summary: Kinotta names any missing tool a start from video needs, with an install hint, at startup and through an API the New reel screen reads.
spec: docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: A start from video runs Python, ffmpeg and faster-whisper; if one is missing it fails halfway.
- Why: The failure should be named up front, with how to fix it.
- Proposed outcome: A missing tool is named with an install hint at startup and in the New reel screen; with all present, no message.
- Affected: server/core (new check), server/cli.ts, server/http handler, web api client, a small web component.
- Constraints: Core has no HTTP; one place for the check; never throws; no secrets.
- Out of scope: Installing anything; the New reel screen itself (T30, built in parallel); version checks beyond Python 3.
- Open questions: None.

## Goal

A missing tool is reported once by core and shown at startup and on the New reel screen.

## Approach

`checkTools()` in `server/core/_internal/tools.ts` probes `python3`/`python`/`py -3` (must report Python 3), `ffmpeg -version`, and a `find_spec` lookup for faster-whisper (no import, which is slow). The probe runner and platform are injectable for tests. `missingToolsMessage` formats the startup text, printed to stderr by the CLI after the URL line. `GET /api/tools` returns `{ tools, missing }`; `fetchTools` and `<MissingTools />` read it.

## Steps

1. Tests with a fake machine, then core module. Done.
2. CLI message, endpoint, client, component. Done.

## Risks

Probes spawn processes on each `/api/tools` call (about 0.3 s). Acceptable for one screen.

## Checks to run

typecheck, full vitest, Playwright.

## Changelog

### 2026-10-05
- Plan created and built.