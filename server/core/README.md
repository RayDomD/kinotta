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

- `listVersions(slug)` returns the reel's version folders oldest first, each `{ number, isNewest, isStoryboard, approved }`
  (v1 is the storyboard in this phase; `approved` when the folder holds an `approval.json`). An unknown reel throws `not-found`.
- `subscribe(listener)` returns an unsubscribe function. Events: `{ type: 'version-added', reel, version }` (a `v<n>`
  folder with a `shots.json` appeared), `{ type: 'reels-changed' }` (a reel or version appeared or went) and
  `{ type: 'comments-changed', reel, version }` (a saved-comments file changed) and
  `{ type: 'approval-changed', reel, version, approved }` (a version's `approval.json` appeared or went, whoever wrote it). Debounced (150 ms), never repeated,
  `*.tmp` files ignored. It watches the reels folder while anyone is subscribed (recursive `fs.watch`, polling
  where that is unavailable). `transcription-progress` and `render-progress` come from the jobs themselves, not the watcher.
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
- `copyBatch(slug, n, { section?, includeIssues?, runtimeIssues? }?)` writes `reels/<reel>/v<n>/comments.json` (atomically, replacing any earlier copy) and returns
  `{ text, file, count }`: the pasteable text for Claude, the saved path relative to the project root, and the
  comment count. On a one-section reel the batch covers the whole reel (`section: null`). On a reel with several sections `section` is required and the
  batch is that section's alone (`comments-<sectionId>.json`, `section: "<id>"`, header `..., v<n>, section 02 <name>`). The version's note goes
  into every batch. Each copy is recorded in the state file as the section's latest hand-off (`handedOff`). No comments and no note throws `KinottaError` `invalid` and writes nothing; a version that is not the newest
  throws `frozen`. With `includeIssues`, the version's issues plus `runtimeIssues` (problems only the browser saw) are
  added once each as a "Contract issues" block after Notes and an `issues` array in the file. It is the only place the editor
  writes into a version folder besides the approval below.
- `approveVersion(slug, n)` writes `v<n>/approval.json` (`{ approvedBy: "you", at }`, atomically) and returns
  `{ approved: true, at, warning? }`. Approving again keeps the first `at`. A version with contract issues is approved
  with a `warning` naming them. `withdrawApproval(slug, n)` deletes the file and returns `{ approved: false }`; renders
  stay. Both throw `not-found` for an unknown reel or version. Only the HTTP API calls them; the CLI has no approve
  command (R17). A code-only Save never copies `approval.json` into the next version.
- `render({ reel, version, preset })` queues a render and returns the job (`{ id, reel, version, preset, state, progress,
  remaining, output?, error? }`) as `queued`. Jobs run one at a time in queue order (`_internal/render-queue.ts`), in
  memory only; each change raises `{ type: 'render-progress', job }` (progress in whole percents). `renderJobs()` lists
  the jobs waiting or running; `whenRendered(id)` resolves with the job once it is `done` or `failed`. The engine
  (`_internal/render.ts`) runs the skill's `render.js` through the runner and writes
  `reels/<reel>/renders/<reel>-v<n>-<preset>-<height>p<fps>.mp4` under a temp name (`.render-<job>.mp4`), renamed when
  complete so the same settings replace the file and a failure leaves nothing; `output` is that path relative to the
  project. For now only a Draft of a code-only reel renders (half size, CRF 28, no motion blur, 30 fps); Final,
  Overlay and footage reels are `invalid`, and an unknown reel or version is `not-found`.
From v2 on, `readVersion` compares each section with the version before (its fields, its shots, the markup of the scenes over it)
and returns `changedSections` (also counting what shots.json claims) and `claimMismatch`; sections handed off and not changed
since carry `waiting: true`. The first touch of a new newest version (a read, a comment call, the watcher's `version-added`) settles
it once, whoever built it (a Save or an agent): every unsent comment moves up from the version before at its remapped time, old
timeline to source time through the old version's pieces and onto the new timeline through the new version's. The pin's shot is
the new shot playing there; element and word pins keep their element or word. A moment that was snipped keeps the comment's text
and gives it `state: 'moment-removed'`, pinned where the snip closed up, until it is deleted or re-pinned as a new comment. Sent
comments never move. Comments say whether they were `sent` and which version they `carried` on to.

- `cancelHandoff(slug)`: a copied batch marks the reel handed off in `reels/<reel>/handoff.json` (the version it was copied from). It ends when
  a newer version appears or `cancelHandoff` is called. While it holds, `readEditList` carries `handedOff: { version, copiedAt, reason }`,
  `saveEdits` throws `invalid` with that reason, and operations still collect. When a newer version appears (the watcher's `version-added`,
  or the next `readEditList`) an unsaved edit list is replayed onto its sources instead of going `stale`: each operation is checked in order,
  one whose target is gone (clip, word, piece index, element) stays in the list and is reported in `flagged` (id to reason), and the undo
  history goes. `saveEdits` throws `invalid` while any edit is flagged; remove it (or redo it) first.

- `readEditList(slug)`, `addOperation(slug, op)`, `removeOperation(slug, id)`, `undoEdit(slug)`, `redoEdit(slug)`, `discardEdits(slug)`,
  `saveEdits(slug)`: the reel's edit list and Save. The
  list is `{ base, operations, undo, redo }` (the last two are lists of whole lists, up to 100 back, shown to callers as `canUndo` and `canRedo`; any new change, an add or a removal, ends the redo history, and a removal can be undone) at `reels/<reel>/edit-list.json`, outside every version, rewritten atomically on every change;
  `base` is the newest version when the edits were made, and a list for an older one is `stale` (no edits, no Save, Discard
  works). An operation is `{ id, kind, ... }`; so far `snip` (`from`, `to`, source seconds). `addOperation` checks it applies on
  top of the list, else throws `invalid`. `removeOperation` drops one by id and keeps the later ones (operations name things in source
  time, so the result is worked out again from what remains; `invalid` if it would not apply, `not-found` for an unknown id). `saveEdits` writes the operations into the reel's `plan.json` (and `transcript.json`
  when an operation changes words), builds `v<n+1>` in `reels/<reel>/.save/` (its own `plan.json` and `transcript.json`,
  `index.html`, `edits.json`, then `shots.json` last with `builtBy: "you"` and `changedSections`), renames it into place and
  clears the list. Any failure (a build error, an empty list, a batch that is out) leaves no new version, the sources as they were
  and the list in place. `_internal/sources.ts` is the one resolver for the plan: the reel folder's `plan.json` (started in Kinotta), else the project's `motion/plan.json` for an agent-built footage reel, whose edits Save writes there; a code-only reel (no footage, no plan) takes `element-offset` only (anything else is `invalid`): each scene of its newest page stands in as a clip, and Save copies `v<n>` to `v<n+1>` plus `kinotta-edits.css` (`_internal/code-edits.ts`), linked from the page, holding the offsets the version already had with the list applied over them; `Version.code` carries its scene names and offsets. A
  new kind of edit is one member of the `Operation` union and one apply function in `_internal/edit-model.ts`.
- `server/core/model.ts` re-exports the pure parts (pieces mapping, the operation model) with no file access, for the web editor.
- A version may hold its own `transcript.json` and `plan.json`; `readVersion` reads them before the reel's (E14), and
  `builtBy` (from `shots.json`) says who made it. `startReel` and Save both write them.
- `startReel` returns once the reel and its plan exist; transcription runs in the background (`_internal/transcription.ts`). `transcriptionProgress(slug)` and `transcription-progress` events say how far it is, with an estimate; `whenTranscribed(slug)` resolves when the job ends. When it does, the transcript, the plan's sections (one, or about one per three minutes split at the largest pause) and v1 are written. A reel with no version yet collects edits (base 0) that replay onto v1; Save is refused until it exists. Progress is in memory only.

Comments live in the editor's working state at `reels/.kinotta/<reel>/v<n>.json`
(`{ comments: [{ id, pin, text, createdAt }], note }`), written atomically (temp file, then rename), one save at
a time per file. Nothing is written into a version folder.

Outside code imports from `index.ts` only.

- `checkTools()` returns `{ tools, missing }`: Python 3, ffmpeg, faster-whisper and Chromium, each
  `{ id, name, present, hint, neededFor }` (`hint` is the install command for the platform; `neededFor` lists `video`,
  a start from video, and `render`). Chromium is Playwright's browser, found at its executable path. It never throws.
  `missingToolsMessage(check)` is the startup text naming each missing tool under what needs it, or null when all are
  present. The server serves the check at `GET /api/tools`.

## Does not handle

Runtime contract checks (the stage does those) and stills.

## Dependencies

Node's `fs` and `path`, and `node-html-parser` (contract checks, and comparing the scenes of two version pages).
