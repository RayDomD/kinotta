# server/http

Thin routes over the reels core, plus static serving of the built UI. No logic of its own (D10).

## Public interface

`createHandler(project, webRoot)` returns a Node request handler.

- `GET /api/project` returns `{ name }`.
- `GET /api/reels` returns the core's `listReels()` result.
- `GET /api/reels/<reel>/versions` returns `{ versions: [{ number, isNewest, isStoryboard, approved }] }`, oldest first.
- `GET /api/events` is a server-sent event stream (`text/event-stream`): each core project event as one JSON
  `data:` message (`version-added`, `reels-changed`, `comments-changed`, `approval-changed`, `transcription-progress`, `render-progress`), plus a comment line every 25 s.
- `GET /api/reels/<reel>/versions/<n>` returns the core's `readVersion()` result. An unknown reel or version is
  a 404, an unreadable `shots.json` a 422, both as `{ error }`.
- `GET /api/reels/<reel>/versions/<n>/comments` returns `{ comments }`, numbered by the core.
- `POST /api/reels/<reel>/versions/<n>/comments` takes `{ pin: { shot, x, y, element }, text }` and answers 201
  with the core's `{ comment, comments }`. Malformed JSON is a 400, a body over 16 KB a 413, a refused comment
  (empty text, unknown shot) a 422, an unknown reel or version a 404, a version that is not the newest a 409. Other methods are a 405.
- `POST /api/reels/<reel>/versions/<n>/batch` answers 200 with the core's `{ text, file, count }` after writing the
  batch file. No comments and no note is a 422; an unknown reel or version a 404; a version that is not the newest a 409; other methods a 405.
- `PUT /api/reels/<reel>/versions/<n>/approval` approves the version and answers 200 with the core's
  `{ approved, at, warning? }`; `DELETE` on the same path withdraws it (`{ approved: false }`). An unknown reel or
  version is a 404; other methods a 405. It is the only way to approve.
- `POST /api/renders` with `{ reel, version, preset, audio? }` queues a render and answers 201 with the queued job.
  A malformed body or a render the core refuses (unknown preset, the gate) is a 422 naming the reason; an unknown reel
  or version a 404. `GET /api/renders` returns `{ jobs }`, the jobs waiting or running. `DELETE /api/renders/<id>`
  cancels a job and answers 200 once it has stopped, with the job (`cancelled`, or unchanged if it had finished); an
  unknown job is a 404. Progress comes as `render-progress` events on `/api/events`.
- `GET /reels/<reel>/v<n>/<file>` serves a version's files same-origin. Only version folders under `reels/`
  are reachable (no dot folders, no path escapes).
- `GET /footage/<reel>` serves the reel's footage file (from `reel.json`, confined to the project folder) with byte
  ranges: `Accept-Ranges: bytes`, `206` with `Content-Range` for a `Range` header, `416` for one past the end.
  A reel without footage, a missing file or a path outside the project is a 404.
- Any other `GET` (and `HEAD`) serves files from `webRoot` (the built UI), falling back to `index.html` for paths
  without a file extension.

## Does not handle

Range requests, editing or deleting comments and notes. Later tickets add them.
Editing or deleting comments, notes and SSE. Later tickets add them.

## Dependencies

`server/core` (through its `index.ts`: types and `KinottaError`) and Node's `http`, `fs` and `path`.
