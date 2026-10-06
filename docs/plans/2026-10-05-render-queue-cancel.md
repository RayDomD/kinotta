---
title: One queue across processes, and cancel (T52)
date: 2026-10-06
status: Done
summary: kinotta render joins a running editor's queue through a port file, or hosts the server headless; cancel stops every render process and leaves no file.
spec: docs/specs/2026-10-05-approve-and-render.md
---

## Intent

- Problem: `kinotta render` always renders in its own process, so with the editor open two renders can run at once, against R8 and R12. A render can't be cancelled. `kinotta render` and `kinotta check` act only on the working directory.
- Why: one queue per project keeps the machine from running two renders side by side, and the owner needs to stop a render they started by mistake (R8, R12, R18).
- Proposed outcome: the server writes a port file while it runs; `kinotta render` finds a live one and enqueues over HTTP, or hosts the server headless until the queue drains. Cancel drops a queued job, or kills a running one's processes and removes its temp output and work folder.
- Affected: `server/main.ts`, `server/cli.ts`, a new `server/port-file.ts` and `server/editor-client.ts`, `server/http/_internal/handler.ts`, `server/core/_internal/render-queue.ts`, `render.ts`, `runner.ts`, `types.ts`, `index.ts`, the web client's `RenderJob` mirror, the core and http READMEs.
- Constraints: R8, R12, R18. No lock-file queue. Process starts stay in `runner.ts`. On Windows a killed render must not orphan Chromium or ffmpeg.
- Out of scope: the Picker queue UI and its cancel button (T55, T56); parallel segments (T54, which creates `.work-<job>/`; cancel already removes it).
- Open questions: None.

## Goal

With the editor running, `kinotta render` waits behind the editor's render and then renders; without it, `kinotta render` renders on its own and exits; a stale port file is ignored; cancelling leaves no output and no `.work-<job>/`; `--project` works for `render` and `check`.

## Approach

**Port file.** `startServer` writes `<project>/.kinotta-server.json` (`{ port, pid }`) after it binds, and removes it on `close()` and on process exit, only while the file still names its own pid and port (a later editor may have replaced it). It sits at the project root, not in `reels/.kinotta/`, because a project without `reels/` shows a "no reels folder" state that creating the folder would hide. `startServer` also returns its `Project`.

**Finding the editor.** `server/editor-client.ts` holds every call the CLI makes to a running server. `findEditor(projectDir)` reads the port file and returns the server's URL only when the pid is alive and `GET /api/project` answers with this project's name within a short timeout. Anything else is stale and ignored; the next server overwrites it.

**`kinotta render`.** It parses `--project`. With a live editor it uses its URL; otherwise it calls `startServer({ port: 0 })`, which writes the port file so a second `kinotta render` joins this one. Either way it opens `/api/events`, POSTs `/api/renders`, prints the job's progress until it is done, failed or cancelled, and prints the file. When it hosted the server, it waits for `renderJobs()` to be empty before closing, so jobs that joined it finish. A refusal (422) prints the reason and the approval hint as before.

**HTTP.** `POST /api/renders` (`{ reel, version, preset, audio? }`, 201 with the queued job), `GET /api/renders` (`{ jobs }`), `DELETE /api/renders/<id>` (200 with the cancelled job).

**Cancel.** `RenderJob.state` gains `cancelled`. `project.cancelRender(id)` marks a queued job cancelled at once (it is skipped when its turn comes); for a running job it aborts the job's `AbortSignal` and resolves once the processes are gone and the files removed. `runner.ts` kills a render's whole process tree on abort (`taskkill /pid <pid> /T /F` on Windows, SIGTERM elsewhere, which lets Playwright close its browser), and `renderOverFootage` does the same for both its processes on any failure. `runRender` removes `.render-<job>.*` and `renders/.work-<job>/` with `rm` retries, since Windows holds file locks briefly after a kill. Unknown job: `not-found`. A finished job is returned unchanged.

**`kinotta check --project <dir>`** reads that project instead of the working directory.

## Steps

1. Tests first: `tests/core/render-queue.test.ts` (cancel queued and running, `.work-<job>/` removed, HTTP routes, joined queue, headless exit with the port file gone, stale port file, `--project` for both commands). See them fail.
2. Core: queue cancel and the `cancelled` state, signal through `runRender` and `runner.ts`, cleanup.
3. HTTP routes; port file in `startServer`.
4. `editor-client.ts`, CLI `render` over HTTP, `--project` for `render` and `check`.
5. Web mirror of the state; READMEs.

## Risks

- Two `kinotta render` started at the same instant with no editor can both host. R12 accepts this (no lock file); it is noted in the summary.
- Killing on Windows: the tree kill must finish before the temp file can be removed. The cleanup retries cover the lag.
- SSE through Node `fetch`: events for the job can arrive before the POST returns its id, so the client buffers them by id.

## Checks

- typecheck, full vitest, and the full Playwright suite once (the web type changes).

## Changelog

- 2026-10-06: Plan written, In Progress.
- 2026-10-06: Done. Render tests now run one file at a time (see the summary). Summary: `docs/session-summaries/2026-10-05-render-queue-cancel-summary.md`.
