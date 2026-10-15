# ADR 0006: shots are parts

Status: accepted, 2026-10-14.

Code-built reels can use contract 2. Each shot has a fixed folder name and immutable `r<n>` revisions. Its displayed number is its position in the manifest. Shared styles and fonts have their own immutable revision. Existing contract 1 and footage reels retain their existing paths.

The agent writes `reels/<slug>/shots.json` as the build input. It names `shared` and ordered shots with `name`, `revision`, `duration`, `title` and `description`. Starts are computed from preceding durations. `kinotta build <slug> --by <agent>` validates and assembles a stage, then publishes `v<n>` with one rename. Kinotta generates its `index.html` and keeps the manifest with publication fingerprints. A later change to any published revision, including its assets, is an issue. Authors write a new revision instead.

Each shot revision contains one `shot.html` section, scoped `shot.css`, a self-contained `shot.js` module exporting `seek(local)`, and optional assets. Shared revisions contain `shared.css` and optional fonts and assets. The pure assembler produces one document with isolated modules and a global seek. One iframe per shot was rejected because file renders cannot call a different file origin and element pinning inspects one document.

Unchanged revision folders are neither copied nor rewritten. A Working freeze reassembles the manifest and retains version-level offsets and the shared sound mix. Parts form an ordered sequence. Changing a duration moves later shots. Existing sound attachments use a shot name and local moment, resolved by generated shot anchors in the media sidecar. Sound without an attachment stays at its reel time.

Change detection compares revision identities and manifest timing. A shared revision change changes every section. Frame pins record `shotName` and carry by that name across additions and reordering. A removed shot keeps its feedback flagged. Parts batches group comments by shot and open with `Rebuild:` naming the commented shots.

Animations use `transform` while Kinotta reserves individual `translate` and `scale` for owner offsets. Revisions keep dependencies inside their own folders. Parts do not support transitions requiring two simultaneous shots, footage alternates, or cross-reel shot reuse.
