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

- `listComments(slug, n)` returns a version's comments, each with `id`, `number`, `pin`, `text` and `createdAt`.
  Comments are ordered by shot start, then creation time, and `number` is the 1-based position in that order.
  It is the number shown everywhere (frame, still, panel, later the pasted batch), so adding a pin on an earlier
  shot renumbers the later ones.
- `addComment(slug, n, { pin: { shot, x, y, element }, text })` saves a frame pin comment and returns
  `{ comment, comments }` (the saved comment and the renumbered list). The core fills in the pin's `kind`,
  `version`, `section` and `time` (the shot's start). `x` and `y` are fractions of the frame, rounded to 3
  decimals; `element` is the `data-el` name or null. Empty or whitespace text, an unknown shot and a position
  outside the frame throw `KinottaError` `invalid`; an unknown reel or version throws `not-found`.

Comments live in the editor's working state at `reels/.kinotta/<reel>/v<n>.json`
(`{ comments: [{ id, pin, text, createdAt }], note }`), written atomically (temp file, then rename), one save at
a time per file. Nothing is written into a version folder.

Outside code imports from `index.ts` only.

## Does not handle

Contract checks beyond a readable shot list (T7), stills, editing or deleting comments, notes, newest-version
enforcement, batches and events. Later tickets add them here.

## Dependencies

Node's `fs` and `path` only.
