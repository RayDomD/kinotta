---
title: Renders in the background, everywhere (T56)
date: 2026-10-06
status: Done
summary: Picker shows the queue with progress, estimate and cancel; the top bar shows a running render on every tab; a finished render raises a ready notice with Play and Show in folder.
spec: docs/specs/2026-10-05-approve-and-render.md
---

## Intent

- Problem: once Render is pressed, the owner can't see what is rendering, how long it has left, or stop it, and a finished render goes unannounced unless Picker's past renders happen to be open.
- Why: R8 and R11 make renders run in the background with progress, an estimate and cancel, visible from any tab, with a "ready" notice.
- Proposed outcome: a Queue section in Picker's right column, a render indicator in the top bar on every tab, and a ready notice with Play and Show in folder.
- Affected: `web/src/App.tsx`, `web/src/Picker.tsx`, `web/src/styles.css`, the web API client and README, `playwright.config.ts`, a new e2e spec.
- Constraints: R8, R11; DESIGN.md (one light; numbers in Doto; flat panels). The server API is T52's (`GET /api/renders`, `DELETE /api/renders/<id>`, `render-progress` events).
- Out of scope: the finish pass (T59).
- Open questions: None.

## Goal

The queue shows the running job's progress and estimate and the waiting jobs; Cancel removes a job and leaves no file; the top bar shows a running render on every tab; a finished render raises a notice with Play and Show in folder.

## Approach

**Jobs in the app.** `App` keeps the project's queue: loaded from `GET /api/renders` once, then kept from `render-progress` events (a job is added or updated, and dropped once it is done, failed or cancelled). The client gains `fetchRenderJobs()` and `cancelRender(id)`.

**Queue (Picker).** Between Render and Past renders: the running job first (`v2 Final · 42% · about 1 min left`), then the waiting ones (`waiting`), each with Cancel. Jobs of other reels show their reel's title. A failed job's reason shows until the next render.

**Top bar.** While a job runs, the bar shows `Rendering v2 Final 42%` (plus `+N waiting`) on every tab, as a polite status.

**Ready notice.** When a job of any reel finishes, a notice says `<reel> v2 Final is ready.` with Play, Show in folder and Dismiss. It shows on every tab, fixed over the bottom of the main column, styled like the version notice. Play opens the reel in Picker playing the file.

## Steps

1. Tests first: `tests/e2e/renders.spec.ts` on its own server (port 4379, showreel sample). Start two Drafts, switch to Storyboard and see the top bar's progress, return to Picker, see the queue (one running, one waiting), cancel the running one, see the waiting one run and finish, and see the ready notice. Play from the notice. See them fail.
2. Client calls; jobs state in `App`; Queue, indicator, notice; styles.
3. README.

## Risks

- Two Drafts in a row take time; the spec uses a generous timeout.

## Checks

- typecheck, full vitest, `renders.spec.ts`, then the full Playwright suite.

## Changelog

- 2026-10-06: Plan written, In Progress.
- 2026-10-06: Done. Summary: `docs/session-summaries/2026-10-05-renders-everywhere-summary.md`.
