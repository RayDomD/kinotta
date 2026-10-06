# One queue across processes, and cancel: summary

Date: 2026-10-06. Ticket T52 (#52). Plan: `docs/plans/2026-10-05-render-queue-cancel.md`.

## Shipped vs planned

Shipped as planned.

- **Port file.** `startServer` writes `<project>/.kinotta-server.json` (`{ port, pid }`) once it binds and removes it
  on `close()` and on process exit, but only while the file still names that server. The editor's `kinotta` turns
  Ctrl+C and SIGTERM into a normal exit so the file goes then too. `RunningServer` now carries its `project`.
- **Finding the editor.** `server/editor-client.ts` holds every call the CLI makes to a server. `findEditor` returns
  the URL only when the pid is alive and `GET /api/project` answers with this project's name within 2 s; otherwise the
  file is stale and ignored. `queueRender` opens `/api/events` before it POSTs, so events that arrive before the job id
  is known are kept, and it settles as failed if the server goes away mid-render.
- **`kinotta render`.** It joins a live editor's queue and prints "Waiting behind N render(s)" when jobs are ahead.
  Without an editor it starts the server headless on port 0, writing the port file so another `kinotta render` can
  join it, and closes once the queue is empty. Refusals print the reason and the approval hint as before.
- **HTTP.** `POST /api/renders` (201 and the queued job; 422 for a malformed body or a refusal), `GET /api/renders`
  (`{ jobs }`), `DELETE /api/renders/<id>` (200 once stopped; 404 for an unknown job).
- **Cancel.** `RenderJob.state` gains `cancelled` (mirrored in the web client). `project.cancelRender(id)` drops a
  queued job at once. For a running job it aborts the job's signal: `runner.ts` kills the renderer's whole process
  tree (`taskkill /pid <pid> /T /F` on Windows, SIGTERM elsewhere), and `renderOverFootage` now kills both processes'
  trees on any failure, not only on cancel. `runRender` then removes `.render-<job>.*` and `renders/.work-<job>/` with
  `rm` retries. A finished job comes back unchanged.
- **`--project`** works for `kinotta render` and `kinotta check`.

## Deviations

- **The port file is at the project root, not in `reels/.kinotta/`.** A project without `reels/` shows a "no reels
  folder" state, and creating the folder to hold the port file would hide that state.
- **The render tests now run one file at a time** (`fileParallelism: false` in the `render` vitest project). With the
  new file alongside the others, the footage test's own Chromium screenshot failed once ("Unable to capture
  screenshot"); the file passed alone. The full vitest run went from about 150 s to about 300 s.

## For the owner

- Two `kinotta render` commands started at the same instant with no editor running can each host a server. R12 accepts
  this, since there is no lock file. The later port file wins, and both renders still finish.

## Checks

- typecheck: clean.
- vitest: 43 files, 408 passed, 1 skipped (full run). New: `tests/core/render-queue.test.ts` (10 tests), a footage
  cancel test in `render-footage.test.ts`, and a `--project` test in `check.test.ts`. They were seen failing first.
- After the footage cancel test, no Chromium, ffmpeg or `render.js` process was left running (checked with
  `Get-CimInstance Win32_Process`).
- Playwright: full suite, 103 passed (the e2e servers now write and remove port files).
