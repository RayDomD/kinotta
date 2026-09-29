# server/http

Thin routes over the reels core, plus static serving of the built UI. No logic of its own (D10).

## Public interface

`createHandler(project, webRoot)` returns a Node request handler.

- `GET /api/project` returns `{ name }`.
- `GET /api/reels` returns the core's `listReels()` result.
- Any other `GET` serves files from `webRoot` (the built UI), falling back to `index.html` for paths
  without a file extension.

## Does not handle

Version files at `/reels/<reel>/<version>/<file>`, comments and SSE. Later tickets add them.

## Dependencies

`server/core` (types only, through its `index.ts`) and Node's `http`, `fs` and `path`.
