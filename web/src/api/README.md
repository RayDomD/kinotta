# web/src/api

The only module in the UI that talks to the Kinotta server (D10).

## Public interface

`index.ts` exports `fetchProject()` (`{ name }`), `fetchReels()` (`{ state, reels }`),
`fetchVersion(slug, n)` (a version's shots, overlays and sections), `versionPageUrl(slug, n)` (the same-origin
URL of a version's `index.html`, the only place server paths are built), `fetchComments(slug, n)` (a version's
numbered comments), `addComment(slug, n, { pin, text })` (resolves with `{ comment, comments }`), `copyBatch(slug, n)` (saves the batch file, resolves with
`{ text, file, count }`) and their types.

## Does not handle

Editing or deleting comments, notes and live events (`EventSource`). Later tickets add them here.

## Dependencies

The browser's `fetch`. The server's `/api` routes (`server/http`).
