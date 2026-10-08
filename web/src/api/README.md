# web/src/api

The only module in the UI that talks to the Kinotta server (D10).

## Public interface

`index.ts` exports `fetchProject()` (`{ name }`), `fetchReels()` (`{ state, reels }`),
`fetchVersions(slug)` (the reel's version rail rows), `fetchVersion(slug, n)` (a version's shots, overlays and sections), `versionPageUrl(slug, n)` (the same-origin
URL of a version's `index.html`, the only place server paths are built), `fetchComments(slug, n)` (a version's
numbered comments), `addComment(slug, n, { pin, text })` (resolves with `{ comment, comments }`), `copyBatch(slug, n)` (saves the batch file, resolves with
`{ text, file, count }`), `editComment(slug, n, id, text)` (resolves with `{ comment, comments }`), `deleteComment(slug, n, id)` (resolves with the renumbered comments), `fetchNote(slug, n)` and `saveNote(slug, n, note)` (the note on the whole reel), `approveVersion(slug, n)` (resolves with `{ approved, at, warning? }`) and `withdrawApproval(slug, n)`, `subscribe(onEvent)` (the server's change events over `EventSource`, returns a close function; the browser reconnects on its own), `footageUrl(slug)` (the same-origin URL of a footage reel's footage file), `fetchRenderSettings(slug)` (each preset's four
settings), `queueRender(slug, n, preset, settings)` (queues a render and saves the settings for the preset; a refusal throws
with the reason), `saveAndRender(slug, preset, settings)` (saves the pending edits as the next version, then queues its
render; a refused or failed Save throws and queues nothing), `fetchRenders(slug)` (finished renders, newest first), `renderFileUrl(slug, file)` and
`revealRender(slug, file)` (shows a render in the file manager), `fetchRenderJobs()` (the queue: jobs waiting or running)
and `cancelRender(id)`, and their types.

## Does not handle

Section batches and word pins. Later tickets add them here.

## Dependencies

The browser's `fetch`. The server's `/api` routes (`server/http`).
