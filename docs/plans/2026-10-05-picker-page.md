---
title: Picker page (T55)
date: 2026-10-06
status: Done
summary: Picker becomes the third tab, with a versions table (built by, comments, contract, approval), the read-only player under it, and a render panel and past renders in the right column.
spec: docs/specs/2026-10-05-approve-and-render.md
---

## Intent

- Problem: approving and rendering exist only as API calls. The owner has no screen for comparing versions, approving one or starting a render, and Picker is a disabled tab.
- Why: R11 makes Picker the approve-and-render tab.
- Proposed outcome: the Picker tab, built to `docs/mockups/2026-10-05-picker-layout.html` (option B) in the DESIGN.md world. A versions table and a read-only player sit in the main column; the right column holds the render panel and past renders.
- Affected: `web/src/App.tsx`, a new `web/src/Picker.tsx`, `web/src/lastTab.ts`, `web/src/review/_internal/Review.tsx` (two optional props), `web/src/styles.css`, the web API client, `server/core` (version listing counts, renders listing, reveal), `runner.ts`, the HTTP handler, READMEs, `playwright.config.ts`, a new e2e spec.
- Constraints: R4, R5, R11, R16, R17; the saved mockup; DESIGN.md (one light, zero radius, Doto numerals, flat panels). Process starts stay in `runner.ts`.
- Out of scope: the queue with cancel, the top-bar render indicator and the "ready" notice (T56); the finish pass (T59).
- Open questions: None.

## Goal

The Picker tab lists the reel's versions with built by, comments, contract status and approval; Approve and Withdraw work and the rail follows; selecting a row plays it; the render panel prefills from the preset and saved settings and starts a render; a refused Final or Overlay shows its reasons; past renders list with Play and Show in folder.

## Approach

**Server.**
- `listVersions` entries gain `comments` (the version's comment count) and `issues` (the count of `versionIssues`, the list the gate refuses on). The rail ignores them.
- `project.listRenders(slug)` lists `reels/<reel>/renders/`, skipping dot entries (temp files, work folders), newest first: `{ file, version, preset, bytes, at }`, where `version` and `preset` are read from the file name.
- `GET /api/reels/<reel>/renders` returns `{ renders }`. `GET /renders/<reel>/<file>` serves a finished render with byte ranges, confined to that folder and refusing dot names.
- `project.revealRender(slug, file)` asks the runner to show the file in the system's file manager: `explorer /select,<path>` on Windows, `open -R` on macOS, `xdg-open <folder>` elsewhere. `POST /api/reels/<reel>/renders/<file>/reveal` answers 204, or 404 for an unknown file.

**Picker.** `Phase` gains `Picker`, and the nav enables it. `lastTab` remembers it.
- *Main column.* The versions table has one row per version: version, built by, comments, contract (`ok` or `N issues`), and approval (`✓ Approved` with Withdraw, or Approve). Selecting a row selects that version, as the rail does, so the rail and the table always agree. Approve shows the warning the API returns for a version with issues. Under the table, Review's player plays the selected version read only: `Review` without `edits`, with the table passed in through a new `above` slot, so there is one `<main>`, labelled Picker.
- *Right column.* "Render v<n>": the preset (Draft, Final, Overlay) and the four settings, prefilled from `GET render-settings` for the chosen preset and refilled when the preset changes. Audio at cuts shows only for a footage reel. Render POSTs with `remember: true`. A refusal (422) shows its reason in the panel, as an alert. Accepted, the panel says the render is queued; T56 adds the queue itself.
- *Past renders:* file name, preset and time. Play swaps the player for the finished file (an `.mp4`; browsers can't play ProRes, so an Overlay `.mov` offers only Show in folder), with a way back to the version. Show in folder calls reveal. The list refreshes when a `render-progress` event says a job finished.

## Steps

1. Tests first: core tests for the version counts, `listRenders`, the renders file route and reveal's not-found. An e2e spec, `picker.spec.ts`, on a new port (4380) with its own copy of the showreel sample: approve a version and see the rail mark, withdraw, see a refused Final's reasons, render a Draft, play the finished file. See them fail.
2. Core and HTTP.
3. Client calls, Picker components, App wiring, styles.
4. READMEs.

## Risks

- A Draft render in e2e takes seconds; the spec uses the showreel's v1 with a long timeout.
- Reveal opens a real file manager window, so tests check only its refusal of an unknown file.

## Checks

- typecheck, full vitest, `picker.spec.ts`, then the full Playwright suite.

## Changelog

- 2026-10-06: Plan written, In Progress.
- 2026-10-06: Done. Full suites deferred to T56 (memory). Summary: `docs/session-summaries/2026-10-05-picker-page-summary.md`.
