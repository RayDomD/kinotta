# server/core

The reels core. All Kinotta behaviour lives here, with no HTTP and no `node:http` imports (D10).

## Public interface

Parts reels use contract 2. `buildParts(slug, by?)` reads the authored `reels/<slug>/shots.json`, loads immutable `shots/<name>/r<n>/` and `shared/r<n>/` folders, validates dependencies and publication fingerprints, and publishes one assembled version atomically. It returns `{ version, issues }`. The CLI is `kinotta build <slug> [--by <name>] [--project <dir>]`. `readVersion` exposes `parts` and shot `name`/`revision` with computed starts. Missing or changed revision files become `parts-files` issues shared by check and the Final render gate. `assembleParts(manifest, inputs)` is the pure assembler. It writes no files.

Parts Working timing closes the ordered sequence and a freeze reassembles its manifest. The existing sound attachment field uses the shot name as `placement` and a shot-local `time`; generated `media.shotAnchors` resolve it for preview and render. Unattached sound stays at its reel time. Pins record `shotName` and carry by name. Change detection compares manifests, including shared revisions, and parts batches open with `Rebuild:` and group comments by shot. Older single-page versions keep their existing behavior.

`readWorkingVersion` includes `workingParts` (`duration`, computed `shots`, content `key`) for parts Storyboard stills while retaining the base clips for operation replay. `workingPartsPage(slug)` returns the assembled Working HTML with owner offsets, served at `/reels/<slug>/working/index.html`. The client adds the content key to refresh stills after edits. It publishes no version. Undo of a consumed offset becomes a supported reversal on the next authored build. Other consumed reversals that require review are retained as flagged operations rather than silently lost.

A parts shot may offer two to four `alternates` (`revision`, `label`, `title`, `note`, `duration`). Its own revision must be in that list and match its duration. `Shot.alternates` marks `inReel`, with optional `dismissed: { reason }`. `choiceMade` records an explicit Use. `alternatePage(slug, version, shotName, revision)` caches a frozen assembled override, served at `/reels/<slug>/v<n>/alternate.html?shot=<name>&revision=<revision>`. Working page requests can use the same two query fields to preview against current timing and offsets. The assembled page remains one document.

The optional parts `alpha: true` emits the existing transparent-page class for Overlay. Shared styles must retain a transparent background. Both Draft and Overlay parts renders use the unchanged engine. The assembled global seek returns the active shot's result, so asynchronous shot seeks remain awaitable by stills and renders.

`NewComment.options` and `Comment.options` are 2, 3 or 4. Only one shot per version may ask. Carry clears requests on a later authored version, while hand-off mapping preserves the current request. `FramePin.alternate` identifies the viewed revision. Carry keeps it while available, otherwise flags the comment with `stateReason`. Batches report requests, the alternate in the reel, dismissals and alternate labels on pins. `shot-alternate` (`shot` name, `revision`) and `shot-alternate-dismiss` (`shot`, `revision`, optional `reason`) use the ordinary durable journal and Undo. A choice updates duration and later starts. Build carries undismissed options when the authored manifest omits the list. An explicit list is the agent's new answer, and the four-entry limit still holds.

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

- `listVersions(slug)` returns the reel's version folders oldest first, each `{ number, isNewest, isStoryboard, approved, comments, issues }` (`comments` is the version's comment count, `issues` the count of `versionIssues`, the list the render gate refuses on)
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
  command (R17). A code-only freeze never copies `approval.json` into the next version.
- `render({ reel, version, preset, audio? })` queues a render and returns the job (`{ id, reel, version, preset, state, progress,
  remaining, output?, error? }`) as `queued`. Jobs run one at a time in queue order (`_internal/render-queue.ts`), in
  memory only; each change raises `{ type: 'render-progress', job }` (progress in whole percents). `renderJobs()` lists
  the jobs waiting or running; `whenRendered(id)` resolves with the job once it is `done`, `failed` or `cancelled`.
  A render of 60 frames or more runs in parallel segments, one per two logical cores and at least 60 frames each
  (`openProject(dir, { renderSegments })` pins the count for tests; it is not a user setting). Each segment renders its
  frame range (`render.js --frames`) into `renders/.work-<job>/`; a footage Draft or Final composites each segment over
  its own stretch of the pieces, video only. ffmpeg's concat demuxer joins them with `-c copy`, encoding a footage
  render's sound once over all the pieces. Progress sums the segments. One failing segment stops the others, and
  `.work-<job>/` is removed on finish, failure and cancel.
  `cancelRender(id)` (R8) marks a queued job `cancelled` at once, so it never runs; for a running job it aborts the
  job's signal, which kills the render's whole process tree (`taskkill /T /F` on Windows, SIGTERM elsewhere), removes
  `.render-<job>.*` and `renders/.work-<job>/`, and resolves once that is done. A finished job comes back unchanged; an
  unknown one is `not-found`. The engine
  (`_internal/render.ts`) runs the skill's `render.js` through the runner and writes
  `reels/<reel>/renders/<reel>-v<n>-<preset>-<height>p<fps>.mp4` under a temp name (`.render-<job>.mp4`), renamed when
  complete so the same settings replace the file and a failure leaves nothing; `output` is that path relative to the
  project. Presets (R2): Draft is half size, CRF 28, no motion blur; Final is full size, CRF 16, with motion blur;
  Overlay is ProRes 4444 with alpha in a `.mov`, the page alone with no sound. Four settings (R3) go on top, each
  optional in the request: `fps` (`'source'`, 24, 25, 30, 60), `size` (`'half'`, `'source'`, `'1080p'`, `'4k'`: the
  short side, the long side keeping the source's aspect ratio, the page scaled through `deviceScaleFactor`), `quality`
  (`'standard'`, `'high'`: CRF 20 for Draft and 10 for Final, ProRes 4444 XQ for Overlay) and `audio`. A render uses the
  request's settings over the reel's saved ones for its preset over R2's defaults; an unknown value is `invalid`. High
  adds `-high` to the file name, and Hard cuts in a render with sound add `-hardcuts` (R18). With `remember: true` (only
  Picker's render sets it) the settings used are saved to `reels/<reel>/render-settings.json` (`{ draft, final,
  overlay }`) for that preset (R16). `renderSettings(slug)` returns all three presets' settings with defaults filled in. A code-only reel renders its page at the
  page's size and 30 fps, and has an Overlay only when the page is transparent (`invalid` otherwise). A footage reel
  renders at the footage's size and frame rate: `render.js` draws the overlay page as RGBA frames piped straight into
  ffmpeg, which cuts the original footage by the version's own pieces (through the plan resolver, never the reel's
  current plan), joins the audio with 20 ms fades at each cut (`audio: 'smooth'`, the default) or none (`'hard'`,
  named `-hardcuts`), and lays the frames on top. No intermediate file is written. An unknown reel or version is
  `not-found`. Final and Overlay pass a gate first (R10, R13, R19): an older footage version must have its own
  `plan.json` (the newest plays the reel's current plan, which is its own), and the version must have no issues from
  `versionIssues`; otherwise `invalid` naming every reason, as in `v1 can't be rendered as a Final: it was built before
  plans were kept; it has 1 contract issue: …`. Approval is not checked: pressing Render is the decision (R19). A Draft
  skips the gate.
- `renderWorking({ reel, preset, ...settings })` captures a Draft into a unique `.draft-<id>` folder without publishing a version. Its immutable inputs are removed on completion, failure or queued/running cancellation. Jobs and past renders carry `working: true`, and their filenames distinguish Working from numbered versions. Final and Overlay validate settings, contract, attachments, overload and transparency against staged inputs before freezing changed content, then queue an explicit render of the frozen result. HTTP: `POST /api/reels/<reel>/working-render`. `render` with an explicit version is unchanged.
- `mixOverload(slug, version?)` (`_internal/media-overload.ts`) measures where a native mix passes full scale: the same
  FFmpeg mix the render makes (`mediaMixArgs` shares its per-placement chain with `mediaRenderArgs`), one peak per 10 ms,
  joined into `{ spans: [{ start, end, peak }] }`. Without a version it measures the captured working mix. A
  Draft or Final of a version whose mix overloads is refused (`invalid`, naming the spans) unless the request has
  `acceptOverload: true`; levels are never changed (AM38). Overlay is silent and skips it. Mono sources play at full level
  on both sides, as Web Audio plays them in preview. FFmpeg's AAC encoder applies its own clip avoidance inside an
  accepted overload, so only the onset of an overloaded passage keeps its full peak in the file.
- `listRenders(slug)` lists `reels/<reel>/renders/` newest first, skipping dot names (temp files, work folders): `{ file,
  version, preset, bytes, at }`, the version and preset read from the file name. `renderFile(slug, file)` is a finished
  render's path, for serving it, and `revealRender(slug, file)` shows it in the system's file manager through the runner
  (`explorer /select,` on Windows, `open -R` on macOS, `xdg-open` on the folder elsewhere). Both throw `not-found` for an
  unknown reel or file, or a name that isn't a finished render.
- `versionIssues(version)` is every static issue of a version: its contract issues, then a footage reel's footage
  problems (`footage-missing`, `transcript`, `shot-type`, `no-spoken-line`). `kinotta check` prints this list, the
  render gate refuses on it, and the approval warning names it.
From v2 on, `readVersion` compares each section with the version before (its fields, its shots, the markup of the scenes over it)
and returns `changedSections` (also counting what shots.json claims) and `claimMismatch`; sections handed off and not changed
since carry `waiting: true`. The first touch of a new newest version (a read, a comment call, the watcher's `version-added`) settles
it once, whoever built it (a freeze or an agent): every unsent comment moves up from the version before at its remapped time, old
timeline to source time through the old version's pieces and onto the new timeline through the new version's. The pin's shot is
the new shot playing there; element and word pins keep their element or word. A moment that was snipped keeps the comment's text
and gives it `state: 'moment-removed'`, pinned where the snip closed up, until it is deleted or re-pinned as a new comment. Sent
comments never move. Comments say whether they were `sent` and which version they `carried` on to.

- `cancelHandoff(slug)` removes the outstanding batch marker without changing working content or history. A hand-off never blocks editing. `copyBatch` holds the reel lock through freeze, comment mapping and batch recording, and returns a batch naming the exact frozen version. Comments created on live footage use its visible word times and source anchors.
- `readEditList`, `addOperation`, `removeOperation`, `undoEdit` and `redoEdit` operate on the durable working journal outside version folders. Each operation has `{ id, by, kind, ... }`. Editor operations default to `you`; HTTP callers can supply an agent name. `kinotta edit <reel> --by <name> <operation json>` uses the same API and lock. Accepted changes emit `edits-changed` for live editor updates.
- The journal stores the authored `base`, native `anchor` (sources, transcript metadata and path base), `operations`, whole-list `undo`/`redo` history, `flagged` conflicts, and a separate `frozen`, `frozenIdentity`, `frozenOperations` and `sourceHashes`. Legacy lists migrate without a second application. The API exposes `base`, `frozen`, `editsSinceFreeze`, `canUndo` and `canRedo`. A freeze preserves history. A newer agent build consumes frozen operations and replays only later edits against its own inputs, resetting history at that authored-base change and flagging targets that no longer exist.
- `readWorkingVersion(slug)` returns the authored page and source view with `workingBase` naming its page folder and `number` naming the latest frozen snapshot. The editor applies the durable operations to that base. HTTP: `GET /api/reels/<reel>/working`. Numbered versions remain read-only in the editor, including the latest one.
- `freezeEdits(slug)` is the core boundary used by renders and hand-offs, not a manual editor action. It stages exact working inputs, compares effective content rather than operation count, reuses identical content, or publishes one new version atomically. It never clears history or writes edits back into authored source files. There is no `/save` or `/save-and-render` endpoint. The legacy `discardEdits` core/API remains for existing callers, but there is no Discard control.
- Code-built pages retain their authored graphics. Scene timing and `kinotta-edits.css` are generated from the working base plus its operations. Native and legacy footage captures retain exact media and local graphic dependencies. Missing media, changed originals, broken attachments or publication failures leave the journal intact and no half-built version discoverable.
- `server/core/model.ts` re-exports the pure parts (pieces mapping, the operation model) with no file access, for the web editor.
- A version may hold its own `transcript.json` and `plan.json`; `readVersion` reads them before the reel's (E14), and
  `builtBy` (from `shots.json`) says who made it. `startReel` and a freeze both write them.
- `startReel` returns once the reel and its plan exist; transcription runs in the background (`_internal/transcription.ts`). `transcriptionProgress(slug)` and `transcription-progress` events say how far it is, with an estimate; `whenTranscribed(slug)` resolves when the job ends. When it does, the transcript, the plan's sections (one, or about one per three minutes split at the largest pause) and v1 are written. A reel with no version yet collects edits (base 0) that replay onto v1; Working renders and hand-offs wait until it exists. Progress is in memory only.

Comments live in the editor's working state at `reels/.kinotta/<reel>/v<n>.json`
(`{ comments: [{ id, pin, text, createdAt }], note }`), written atomically (temp file, then rename), one save at
a time per file. Nothing is written into a version folder.

Outside code imports from `index.ts` only.

- `checkTools()` returns `{ tools, missing }`: Python 3, ffmpeg, faster-whisper and Chromium, each
  `{ id, name, present, hint, neededFor }` (`hint` is the install command for the platform; `neededFor` lists `video`,
  a start from video, and `render`). Chromium is Playwright's browser, found at its executable path. It never throws.
  `missingToolsMessage(check)` is the startup text naming each missing tool under what needs it, or null when all are
  present. The server serves the check at `GET /api/tools`.

Review markers are saved per reel under `reels/.kinotta/<slug>/markers.json`. `listMarkers`, `addMarker`,
`changeMarker` and `removeMarker` serialize writes to that file; markers never enter a version, render or comment batch.
`mediaStill` resolves registered or saved video sources (or the reel's legacy footage), then caches a JPEG by source
content, time and width. The encoder runs through `runner.ts`, and concurrent requests reuse one extraction.
`placement-ripple-remove` removes a clip and closes its own track; the existing main-sequence attachment rules still apply.

## Does not handle

Runtime contract checks (the stage does those).

## Dependencies

Node's `fs` and `path`, and `node-html-parser` (contract checks, and comparing the scenes of two version pages).
