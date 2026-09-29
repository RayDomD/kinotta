# server/core

The reels core. All Kinotta behaviour lives here, with no HTTP and no `node:http` imports (D10).

## Public interface

`index.ts` exports:

- `openProject(projectDir)` returns a `Project` with `name` (the folder's name) and `listReels()`.
- `listReels()` returns `{ state, reels }`. `state` is `ok`, `no-reels-folder` or `no-reels`, so the UI can
  tell them apart without an error. Each reel has `slug`, `title` (reel.json, else the slug),
  `newestVersion` and `lastChange` (newest file mtime in the reel), newest change first.

Outside code imports from `index.ts` only.

## Does not handle

Shots, stills, versions, comments and events. Later tickets add them here.

## Dependencies

Node's `fs` and `path` only.
