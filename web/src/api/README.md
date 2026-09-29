# web/src/api

The only module in the UI that talks to the Kinotta server (D10).

## Public interface

`index.ts` exports `fetchProject()` (`{ name }`), `fetchReels()` (`{ state, reels }`),
`fetchVersions(slug)` (the reel's version rail rows), `fetchVersion(slug, n)` (a version's shots, overlays and sections), `versionPageUrl(slug, n)` (the same-origin
URL of a version's `index.html`, the only place server paths are built), `fetchComments(slug, n)` (a version's
numbered comments), `addComment(slug, n, { pin, text })` (resolves with `{ comment, comments }`), `copyBatch(slug, n)` (saves the batch file, resolves with
`{ text, file, count }`), `subscribe(onEvent)` (the server's change events over `EventSource`, returns a close function; the browser reconnects on its own) and their types.

## Does not handle

Editing or deleting comments, and notes. Later tickets add them here.

## Dependencies

The browser's `fetch`. The server's `/api` routes (`server/http`).
