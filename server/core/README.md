# server/core

The reels core. All Kinotta behaviour lives here, with no HTTP and no `node:http` imports (D10).

## Public interface

`index.ts` exports:

- `openProject(projectDir)` returns a `Project` with `name` (the folder's name) and `listReels()`.
- `listReels()` returns `{ state, reels }`. `state` is `ok`, `no-reels-folder` or `no-reels`, so the UI can
  tell them apart without an error. Each reel has `slug`, `title` (reel.json, else the slug),
  `newestVersion` and `lastChange` (newest file mtime in the reel), newest change first.

- `readVersion(slug, n)` returns a version: `number`, `isNewest`, `duration`, `shots` (`number`, `start`,
  computed `duration`, `title`, `description`, plus footage fields as parsed), `overlays` (empty when absent)
  and, when present, `sections` and `changedSections`. It throws `KinottaError` with code `not-found` (unknown
  reel or version) or `invalid` (missing or unparsable `shots.json`).

Outside code imports from `index.ts` only.

## Does not handle

Contract checks beyond a readable shot list (T7), stills, comments and events. Later tickets add them here.

## Dependencies

Node's `fs` and `path` only.
