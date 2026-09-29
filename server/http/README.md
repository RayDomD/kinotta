# server/http

Thin routes over the reels core, plus static serving of the built UI. No logic of its own (D10).

## Public interface

`createHandler(project, webRoot)` returns a Node request handler.

- `GET /api/project` returns `{ name }`.
- `GET /api/reels` returns the core's `listReels()` result.
- `GET /api/reels/<reel>/versions/<n>` returns the core's `readVersion()` result. An unknown reel or version is
  a 404, an unreadable `shots.json` a 422, both as `{ error }`.
- `GET /reels/<reel>/v<n>/<file>` serves a version's files same-origin. Only version folders under `reels/`
  are reachable (no dot folders, no path escapes).
- Any other `GET` (and `HEAD`) serves files from `webRoot` (the built UI), falling back to `index.html` for paths
  without a file extension.

## Does not handle

Range requests, comments and SSE. Later tickets add them.

## Dependencies

`server/core` (through its `index.ts`: types and `KinottaError`) and Node's `http`, `fs` and `path`.
