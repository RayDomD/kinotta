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
  and, when present, `sections` and `changedSections`. For a reel whose `reel.json` names `footage` it also returns
  `footage` (`{ path, exists }`, the project-relative path; the file stays where it is, ADR 0002), `transcript` (the
  timed words of `transcript.json`) and, on each shot with a `line` span, `words` (the transcript words whose start
  falls inside the span) and `spoken` (those words joined). A missing or unreadable `transcript.json` gives
  `transcriptProblem` (a readable reason) instead, never a throw. A code-only reel gets none of these. It throws `KinottaError` with code `not-found` (unknown
  reel or version). A version that breaks the timing contract still opens: `issues` lists each problem in plain words
  (`{ code, shot?, scene?, message }`, rules at the top of `_internal/contract.ts`), a missing or unparsable `shots.json`
  gives zero shots and one issue, and `index.html` is parsed with `node-html-parser`. Nothing here throws for contract problems.

- `listVersions(slug)` returns the reel's version folders oldest first, each `{ number, isNewest, isStoryboard }`
  (v1 is the storyboard in this phase). An unknown reel throws `not-found`.
- `subscribe(listener)` returns an unsubscribe function. Events: `{ type: 'version-added', reel, version }` (a `v<n>`
  folder with a `shots.json` appeared), `{ type: 'reels-changed' }` (a reel or version appeared or went) and
  `{ type: 'comments-changed', reel, version }` (a saved-comments file changed). Debounced (150 ms), never repeated,
  `*.tmp` files ignored. It watches the reels folder while anyone is subscribed (recursive `fs.watch`, polling
  where that is unavailable).
- `footageFile(slug)` returns the absolute path of the reel's footage file, or null when the reel has none, the file is
  missing, or the path leaves the project folder.

- `listComments(slug, n)` returns a version's comments, each with `id`, `number`, `pin`, `text` and `createdAt`.
  Comments are ordered by shot start, then creation time, and `number` is the 1-based position in that order.
  It is the number shown everywhere (frame, still, panel, later the pasted batch), so adding a pin on an earlier
  shot renumbers the later ones.
- `addComment(slug, n, { pin: { shot, x, y, element }, text })` saves a frame pin comment and returns
  `{ comment, comments }` (the saved comment and the renumbered list). The core fills in the pin's `kind`,
  `version`, `section` and `time` (the shot's start). `x` and `y` are fractions of the frame, rounded to 3
  decimals; `element` is the `data-el` name or null. Empty or whitespace text, an unknown shot and a position
  outside the frame throw `KinottaError` `invalid`; an unknown reel or version throws `not-found`; a version that is
  not the newest throws `frozen` ("v1 is frozen. Only the newest version, v2, takes comments."). Every comment change
  goes through one guard (`assertTakesComments`).
- `editComment(slug, n, id, text)` changes a comment's text (trimmed, not empty) and returns `{ comment, comments }`.
  `deleteComment(slug, n, id)` removes it with its pin and returns `{ comments }`, renumbered without gaps.
  `readNote(slug, n)` returns the version's note on the whole reel (empty string when none) and `setNote(slug, n, note)`
  saves it trimmed (empty clears it, at most 4000 characters) and returns `{ note, comments }`. An unknown comment id
  throws `not-found`, empty comment text or an over-long note `invalid`, a version that is not the newest `frozen`.
- `copyBatch(slug, n, { includeIssues?, runtimeIssues? }?)` writes `reels/<reel>/v<n>/comments.json` (atomically, replacing any earlier copy) and returns
  `{ text, file, count }`: the pasteable text for Claude, the saved path relative to the project root, and the
  comment count. The batch covers the whole reel (`section: null`) and includes the version's note when it has
  one. No comments and no note throws `KinottaError` `invalid` and writes nothing; a version that is not the newest
  throws `frozen`. With `includeIssues`, the version's issues plus `runtimeIssues` (problems only the browser saw) are
  added once each as a "Contract issues" block after Notes and an `issues` array in the file. It is the only place the editor
  writes into a version folder; the state file is left as it was.

Comments live in the editor's working state at `reels/.kinotta/<reel>/v<n>.json`
(`{ comments: [{ id, pin, text, createdAt }], note }`), written atomically (temp file, then rename), one save at
a time per file. Nothing is written into a version folder.

Outside code imports from `index.ts` only.

## Does not handle

Runtime contract checks (the stage does those), stills, per-section batches,
and carry-forward. Later tickets add them here.

## Dependencies

Node's `fs` and `path`, and `node-html-parser`.
