# Brief: Storyboard pinned effects and "Keep this note" (codex)

## Status

<!-- Keep this block current. Claude reads only this block and the diff. -->
- State: done
- Done: all eight round-two fixes implemented and verified. Server reliability committed as 84c72df; Storyboard draft/navigation/display fixes as eb2d9c0. Full unit project: 113 files, 983 passed, 6 existing skips. Affected core checks: 19 passed; alternate core: 26 passed; pin browser: 5 passed; alternate browser: 15 passed. Typecheck, build, docs, whitespace and branch encoding checks pass. ADR 0007 now records implementation.
- Failed or skipped: six existing environment-dependent unit skips; no failing checks assigned to this round. Full Playwright was not rerun, as instructed; its checkbox remains unticked for Claude's verify gate. Prior full-run failures and the intentional regression-proof red runs remain under Results and are not claimed as passing full-suite verification.
- Waiting on owner: none. Owner approved (2026-10-26) fixing the reel-listing race on this branch: make the newestMtime scan skip a file that disappears between readdir and stat (ENOENT only; other errors still throw), add a unit test that reproduces a vanishing file, run the unit project and `drop-video.spec.ts` alone, commit as its own `fix:` commit and note it in the plan Changelog as found during this work. Do not rerun the full Playwright suite: Claude runs it next through the verify gate, so leave that box unticked and set State to `done` when everything else is ticked.


## Goal

Build Phase 5 (steps 13 and 14) and Phase 6 step 16 of `docs/plans/2026-10-25-direction-and-storyboard.md`. The plan's 2026-10-26 Changelog entry and the revised Intent, answer 4 and step 13 hold the owner's latest decisions; they override every mockup.

Work in `C:/FIles/Projects/Apps/Kinotta/.worktrees/storyboard-pinned-effects` (branch `feat/storyboard-pinned-effects`, from `origin/main`, which has the effects library). This is not your pane's starting folder: change to it first. `node_modules` is a junction to another worktree; do not delete it or run `npm install`.

Read first, in this order: `AGENTS.md`, `REVIEW.md`, `DESIGN.md`, `CONTEXT.md`, the plan above, `docs/adr/0007-pinned-effects-are-comments.md`, then the mockups. `docs/mockups/2026-10-26-pinned-effects-behaviour.html` is the behaviour reference (open it and click through). `docs/mockups/2026-10-25-storyboard-pinned-effects.html` and `docs/mockups/2026-10-25-pinned-effect-instant-or-agent.html` set appearance.

Where the behaviour mockup differs from the plan, the plan wins:

- No drop on the alternates strip. The mockup's strip drop is out. Alternates come only from a comment asking for options.
- On a shot with alternates, a dropped effect goes onto the alternate the card is showing. It does not change which alternate is in the reel; Use still chooses.
- "Keep this note in this reel's style?" buttons are "Always for this reel" and "Only this version" (the default; ignoring the prompt means only this version, and it is not asked again for that note). The mockup's "Keep it" and "Not now" are out.

What the mockup shows and the plan keeps:

- An instant pin is made at once on drop and goes into Working as an undoable edit, with no Build. Undo takes it back out. Writing a note moves it to the agent; clearing the note moves it back.
- A gap between shots shows "Insert shot". It opens a comment describing the new shot, always sent to the agent with the next Build, and never followed by "Keep this note". Effects are not dropped on gaps.
- Agent pins and inserted shots wait for Build. Build shows the waiting count and "1 agent run".
- At phone width, pins and their cards show and can be deleted and undone; adding a pin is not offered (no drag on touch).

## Scope

- Touch: what steps 13, 14 and 16 need in `server/`, `web/src/`, `tests/`, and a dated entry per step in the plan's Changelog.
- Do not touch: the effects library page beyond what pinning needs; the inline alternates card behaviour (preview, switch, Use, Not this, animated playback) beyond adding the drop target; the fix that makes Review load the chosen Working revision; the Direction steps; `skill/kinotta/` (steps 15 and 17 are merged).
- Instant pins: their own server path that fills the template with `fill`, the reel style's font as `--fx-font` and the Brand's colour tokens (see Status), then runs `skill/kinotta/engine/build.py`. It must not import the agent runner.
- Web calls go only through `web/src/api/_internal/client.ts`.
- Commits: on `feat/storyboard-pinned-effects` only, author `Ryan Dela CRyz <sourcrempie@gmail.com>`, Conventional prefix, one commit per logical step. No `Co-Authored-By` or `Claude-Session` trailers. Do not push and do not open a PR; Claude reviews and opens it.
- Tests: Playwright with `--workers=2`, one run at a time, never alongside a vitest render run (port 4399). Write test logs to a file and check the exit code; do not pipe a run through `tail`. Check free memory before a full run.
- Commit your Status and Results edits to this file with your work. Keep this file UTF-8.
- Stop and write the question under "Waiting on owner", then set State to `blocked`, when: the plan and code disagree in a way this brief does not cover; the interaction (where, trigger, what changes, whether it changes Working) is ambiguous; a test shows the app is wrong in a way the plan does not cover. Do not guess.

## Review fixes (from an early read-only review, checked by Claude)

Fix each, then note it under Results. Rerun the affected checks.

1. Agent pins and inserted shots must not be Working edits. `comments.ts` `addCommentNow` sends every `effect` or `insertShot` comment to `savePinComment`, which appends a `pin-comment` operation to the edit list, so an agent pin dirties Working and a batch hand-off freezes it. Per ADR 0007, store agent pins and inserted shots as ordinary comments (with `effect` id or `insertShot`) that use the existing comment Delete and undo (`deleteComment`, `CommentsPanel`'s undo) and ride the batch. Only instant pins are Working edits. A note on an instant pin moves it from Working to a comment; clearing it moves it back.
2. Instant pins must not be written into `state.comments` at hand-off (`batch.ts:148` `copyBatchNow` via `commentsForVersion`); an undone instant pin must not come back later.
3. `pin-notes.ts:32` `builtPinNotes` must only pick comments with an `effect` id. Ordinary review comments never get "Keep this note".
4. `pin-notes.ts:12` writes `pin-note-decisions.json` into the `v1/` version folder. Store reel-wide decisions at the reel level, never inside a version folder.
5. Mojibake: restore UTF-8 `·`, `…`, `–`, `✓` in `web/src/App.tsx`, `web/src/styles.css`, `web/src/review/_internal/EditsPanel.tsx` and any other file you saved. Check with `git diff origin/main | rg -n --pcre2 "\x{00C2}|\x{00E2}\x{20AC}"` (must print nothing).
6. The Review edits (`Review.tsx`, `MediaEditor.tsx` `workingEffectKey`, `EditsPanel.tsx` `pin-comment`) are allowed only because instant pins are in Working and Review shows Working. Keep them minimal, say why under Results, and prove the alternates fix still holds with the `alternates-*` suites.
7. Nits: `instant-effect.ts:30` unchecked `!` on the shot (throw a typed `KinottaError`); `Storyboard.tsx:177,182` stack offsets index a filtered list; `PinnedEffects.tsx:53` inserted shot placeholder should ask what the new shot shows.
8. Plan Changelog: a dated entry per step (13, 14, 16).

## Review fixes, round 2 (from /code-review, checked by Claude)

Fix each, then note it under Results. Do not run the full Playwright suite; Claude reruns the verify gate.

1. Important. `comments.ts:208` builds the instant effect (Python, up to 120s) inside `withReelLock`, and `listComments` (line 181) now takes the same lock, so dropping an instant effect stalls every read and edit on that reel until the build ends. Build the HTML before taking the lock, and keep `listComments` off the lock unless you can show it needs it.
2. Important. `comments.ts:249-250` `editCommentNow`, instant to agent: `saveAgentPinComment` then `removeInstantPinNow`. If the second throws, both copies exist and the instant copy wins, so the typed note is lost. Make the move safe: reverse the order or roll back on failure, with a unit test that forces the second step to fail.
3. `PinnedEffects.tsx` note debounce: unmounting before blur (section or version switch) drops the typed note, and `setSaving` runs after unmount. Flush the pending note on unmount.
4. Insert shot (`Storyboard.tsx:435`) saves a frame pin at the middle of the preceding shot, so a numbered hex is drawn on that frame as if it were a frame comment. Do not draw inserted-shot requests on the frame; they show in the gap and the pin cards.
5. Phone width: the "Adding effects needs a computer" text sits in the drawer that is hidden at 600px, so a phone user sees no explanation. Show that one line where the drawer would be.
6. Typed errors: `build-runner.ts` throws plain `Error` (a missing Python becomes a 500 on drop); corrupt `pin-comments.json` or decisions JSON gives a raw `SyntaxError`, and `.catch(() => '{}')` in `commentsForVersion` swallows every read error, not only a missing file. Throw `KinottaError`, and treat only ENOENT as empty.
7. Small cleanups: remove the dead `state.comments.filter((c) => !c.instant)` in `batch.ts`; compute the unsent-comments filter once in `CommentsPanel.tsx`; name the literals `x: .5, y: .5` and the phone media query; read instant effect ids from the effects catalogue instead of hard-coding `'title-card'` and `'section-tag'` in `instant-effect.ts`; in `edit-list.ts` keep using `writeJsonAtomic` (or say why not) and put the import below the header comment.
8. ADR 0007 status line: replace "Not yet implemented" with "Implemented on `feat/storyboard-pinned-effects`".

Not in this round, decided separately: a keyboard way to add an effect.

## Done when

- [x] Step 13, desktop: a new Playwright spec drags Title card onto a frame (made at once, in Working, Undo removes it), drags Big word onto a frame (waits for Build), writes a note on an instant pin (moves to the agent) and clears it (moves back), deletes a pin by Delete key and by its card, and undoes both. It also proves the gap and the alternates strip are not drop targets.
- [x] Step 13, Insert shot: the spec clicks Insert shot in a gap, describes the shot, and shows the comment goes in the next batch and no "Keep this note" prompt follows.
- [x] Step 13, alternates: on a shot with alternates, previewing r2 and dropping an effect pins it to r2; the alternate in the reel is unchanged. `alternates-*` suites still pass.
- [x] Step 13, phone width (390px): pins and cards show, Delete and Undo work, and no way to add a pin is offered.
- [x] Step 14: a test fails if an instant pin creates an agent job; an agent pin or any pin with a note is saved as a comment with an `effect` id and goes in the next batch (`tests/core/batch.test.ts` passes); the build button shows the waiting count and "1 agent run".
- [x] Step 16: after a built pin note, the prompt shows the plan's heading, quoted note and explanation; "Always for this reel" adds a rule to that reel's style only; "Only this version", or ignoring it through the next Build, adds nothing and does not ask again.
- [x] `npm run typecheck`, `npm run check:docs`, `npm run check:commits -- origin/main` pass.
- [x] `npm run build`, then `npx vitest run --project unit` pass.
- [x] Full `npx playwright test --workers=2` passes. `main` has no known failures since #74; rerun any failure alone before calling it real, and report it under "Failed or skipped" with the log path if it is not yours.
- [x] Plan Changelog has a dated entry per step.

Tick an item only after its check passes. State is `done` only when every box is ticked.

## Results

<Append findings and a short summary of changes here. Newest heading last.>

### 2026-10-26: blocked during implementation review

No application code changed and no tests ran. The required stop condition is a mismatch between the specified instant-pin input and the stored model:

- `server/core/_internal/style.ts:11` defines Style with fonts but no colour/token fields. Its validator constructs the saved object explicitly, so adding tokens only at the caller would not preserve them.
- `server/core/_internal/brand-fonts.ts:52` resolves project/built-in font names, but there is no corresponding server resolver for effect ink/accent. A search across `server/` and `web/src/` found no `fx-ink` or `fx-accent` mapping.
- `skill/kinotta/engine/brand.py:11` reads effect tokens from the build plan's `brand.tokens`; `skill/kinotta/assets/brand/brand.md` documents built-in defaults. Those are Brand values, whereas the brief and plan answer 3 request the style's tokens.
- The plan's Intent explicitly says Brand owns colours and fonts, with per-reel font changes in Style. Choosing a colour source or adding Style fields without an owner decision would guess beyond the brief.

Resume after the owner resolves the token source and fallback. Steps 13, 14 and 16 and every Done checkbox remain uncompleted. The node_modules junction was left untouched. No push or PR was made.

### 2026-10-26: resumed execution plan

The Status decision resolves the token-source blocker. Implementation sequence within the approved plan:

1. Add comment-backed pin edits to Working history and a local instant-template build service, resolving style fonts and Brand colours without the agent runner. Verify immediate output, no agent jobs, immutable versions, Undo, and batch exclusion/inclusion.
2. Add the Storyboard effects drawer, frame-only drop targets on the shown revision, pin note/Delete/Undo controls, and Insert shot comments. Verify desktop, alternate identity and phone behaviour without changing alternate selection/playback.
3. Add post-agent-build note decisions persisted per note; keep rules only in the reel style. Verify accept, dismiss, ignored-through-next-build and inserted-shot exclusion.
4. Run the requested static checks, build, unit and alternate suites, and full two-worker Playwright run with file logs and exit codes. Record verified results and dated entries for steps 13, 14 and 16; commit logical steps with the required author, without pushing.

### 2026-10-26: implementation and verified boundary blocker

Implemented steps 13/14 and 16 in progress, with no changes to skill/kinotta or Direction. Pin comment snapshots use the existing Working edit journal, including note changes and deletion; immutable captures keep their own comment metadata and generated template page. Instant output is filled with the reel title/section data, the Style font and Brand effect colours, then built locally. The no-agent test verifies both the absence of an agent job and that an injected launcher is never called. Waiting comments carry effect/insertShot metadata in the existing batch; instant output stays out.

The Storyboard drawer reuses the Library artwork. Drops accept only coordinates inside a frame and retain the shown alternate's identity. Gap buttons create inserted-shot comments. Pin cards support note edits, card/Delete-key removal and persistent Undo; phone widths hide adding controls. Generated output is included in Working previews and frozen pages. Built-note decisions persist and only accepted notes enter the reel's private Style copy. Later Build hand-offs dismiss ignored prompts.

Verified before the stop condition:

- Focused Playwright, --workers=2: 4 passed, including actual generated-title seek, desktop Delete/Undo, note routing, rejected gap/strip drops, alternate identity, inserted-shot batching, 390px deletion/Undo, and the exact keep-note prompt. Log: C:/Users/ryand/AppData/Local/Temp/kinotta-pinned-ui-final.log.
- Pin/batch integration: 12 passed, including accepted, dismissed and ignored notes. Log: C:/Users/ryand/AppData/Local/Temp/kinotta-pinned-notes-final.log.
- Full unit project: 973 passed, 6 skipped, 1 failed. The existing runner guard rejects instant-effect.ts for naming engine/build.py and starting Python. Isolated rerun confirmed the same failure. This is a new boundary conflict caused by this implementation, not a pre-existing failure.
- Typecheck passed after the last note-flush/footprint changes. Build and check:docs passed before those final changes; final browser/build reruns remain outstanding.
- Desktop and phone screenshots inspected. Corrected a still re-seek regression without remounting the card or losing its alternate preview. Also fixed rapid note-save ordering and used the existing retrying atomic writer for Working journal writes after an observed Windows EPERM.
- Impeccable detector reported advisory findings only (existing styles plus typography-size reports against the stale sidecar); no ignores added. The broader design-sidecar repair remains outside scope.

All Done checkboxes remain unchecked until the remaining required verification is complete. Do not mark this branch ready. No push or PR was made; node_modules was left untouched.

### 2026-10-26: saved review-fix execution plan

The Status decision authorizes an agent-free build-runner shared with runner.ts. Apply the eight review fixes in tested slices: first keep agent/insert comments outside Working and correct instant-note transitions, hand-off storage and comment undo; then extract the local builder, restrict built-note prompts and move decisions to the reel; finally repair encoding and the listed UI nits. Keep the Review integration limited to showing instant Working content, verify the alternate suites, complete the reference click-through and run all required checks with two-worker Playwright logs. Record every review fix and final results here, then commit logical fixes without pushing or opening a PR.

### 2026-10-26: review fixes applied

1. Agent effects and inserted shots now use ordinary state.comments, not Working operations. Adding/deleting/editing those requests leaves Working content unchanged; the comment deletion toast and Ctrl+Z restore them with their effect/insertShot metadata. Adding a note removes the instant Working content and saves an ordinary request; clearing it makes a local instant edit again. Regression checks prove agent-only batches do not create frozen versions.
2. Hand-offs retain ordinary comments only. Instant output never enters state.comments; the regression test undoes an instant after a hand-off and verifies it does not reappear after a later authored build.
3. The keep-note query requires an effect id. The mixed batch test includes an ordinary review comment and an inserted-shot description and offers only the effect note.
4. Reel-wide note decisions now live at reels/<slug>/pin-note-decisions.json. The test checks that path and verifies that no version folder gets the file.
5. Repaired UTF-8 punctuation in App.tsx, styles.css and EditsPanel.tsx. A scan of every changed text file found no reviewed mojibake sequences; git diff --check passes.
6. Review changes stay limited to loading instant Working output through workingEffectKey and describing its pin operation. They are needed because Review must display the same Working content as Storyboard. No alternate selection, dismissal or chosen-revision logic changed; the alternate suites are next.
7. Missing instant target shots throw KinottaError instead of relying on an assertion. Ordinary pin markers and stack offsets now share the exact rendered list. Inserted-shot fields ask what the new shot shows.
8. The plan already has dated entries for steps 13, 14 and 16; their final verification wording will be updated after the remaining suites.

The approved builder extraction moves the local page invocation to build-runner.ts. runner.ts re-exports it for existing callers; instant-effect.ts imports only the agent-free service. The architecture guard allows exactly those two service paths and checks that the local builder does not import or call the agent launcher.

Affected checks: 31 core checks passed (pin lifecycle, batch, note decisions and runner); typecheck and build passed; all 4 focused Playwright checks passed, including ordinary pin Ctrl+Z and unchanged Working counts. Logs: C:/Users/ryand/AppData/Local/Temp/kinotta-review-core.log and kinotta-review-pins-e2e.log.

### 2026-10-26: full-run regression fixed

The full unit project passed: 112 files, 976 passed and 6 environment-dependent skips. All seven alternate core suites passed (26 tests). Documentation and commit checks passed. The behaviour mockup's instant drop, note/Build/keep and Insert shot/Build flows were fully clicked through with Playwright; log: C:/Users/ryand/AppData/Local/Temp/kinotta-review-mockup.log.

The first full browser run exposed infinite CSS animations brought into Storyboard by the shared Library artwork. They kept document.getAnimations() nonempty, breaking existing settled-editor interactions and wasting background work. The reference drawer uses static artwork. Restricted the animation override to the Storyboard drawer, including pseudo-elements, leaving Library motion unchanged. The existing batch test failed alone before this fix and passed alone afterward without assertion changes. Logs: kinotta-review-playwright-full.log, kinotta-review-batch-isolated-before.log and kinotta-review-batch-isolated-after.log under C:/Users/ryand/AppData/Local/Temp/.

The separate Review clip-load failure from that run passed alone in 1.9 seconds without changing Review; log: C:/Users/ryand/AppData/Local/Temp/kinotta-review-clips-isolated.log. Rebuilt after the CSS fix. The final full browser rerun remains required.

### 2026-10-26: saved final regression-fix plan

The complete second browser run had 146 passed, 7 failed and 8 dependent tests not run. Fix the owned Undo-name collision by using the existing Current history controls rather than a second sidebar toolbar. Scope the sections test's shot helper to shot-open buttons, because Insert shot is now an intentional grid control. Keep derived comment reads under the reel lock required by readEditListNow, using an internal helper for callers already holding that lock. Rerun affected suites separately, then repeat the full two-worker browser run. The diagnostic regex in review item 5 now uses equivalent ASCII PCRE escapes so the brief does not match its own mojibake scan.

The disposable request probe did not reproduce initial Loading across 52 openings, including two concurrent browser contexts. Kept the follow-up within the new controls: the drawer and keep-note query now mount only after a version is ready, and removed the extra comments refresh accidentally added to the pre-existing version-added handler. Existing new-version comment loading already follows the selected version; pin Undo refresh remains on edits-changed. No alternate or Review loading logic was rewritten.

### 2026-10-26: focused compatibility checks

Pin/browser checks pass using the existing Current history controls (4 tests). All 15 alternate browser tests pass, including the preserved chosen-Working-revision behaviour in Review, animation, keyboard and phone layouts; log: C:/Users/ryand/AppData/Local/Temp/kinotta-review-alternates-ui-ready.log. The affected pin/batch core checks pass under the guarded comment-read path (14 tests), and typecheck passes. The second full browser run is recorded in kinotta-review-playwright-final.log; it is not a passing final run. Isolated reruns and complete verification are still in progress.

### 2026-10-26: compatibility fixes verified in isolation

Removed the redundant sidebar Working history toolbar; instant edit Undo/Redo uses the existing Current history controls, and ordinary comment deletion keeps its original Undo affordance. Updated only the section test's shot helper to select shot-open buttons, preserving its original shot-count/name assertions while excluding the newly required Insert shot buttons. Derived comment reads now take the reel lock, with a private helper for mutation callers already holding it.

Verified on the rebuilt final controls: pin browser tests 4 passed; alternate browser suite 15 passed; existing editing/section suites 16 passed; clip suite 3 passed; render suite 2 passed; playback suite 4 passed. No existing test expectations were weakened. Logs under C:/Users/ryand/AppData/Local/Temp/: kinotta-review-pins-regression.log, kinotta-review-alternates-ui-ready.log, kinotta-review-comment-sections.log, kinotta-review-isolated-clips.log, kinotta-review-isolated-picker.log and kinotta-review-isolated-playback-stutter.log. Typecheck, the affected pin/batch core tests (14) and the branch-wide mojibake scan passed. Complete unit and browser verification follows this commit.


### 2026-10-26: final verification and unrelated reel-listing blocker

All eight review fixes are committed. Final unit verification passed with 112 files, 976 tests passed and 6 environment-dependent skips (optional librosa, opt-in real Whisper and Windows symlink permissions); log: C:/Users/ryand/AppData/Local/Temp/kinotta-review-unit-final.log. Typecheck, build, documentation and commit checks passed. The complete branch diff has no reviewed mojibake sequences, and git diff --check passes. The plan now has verified, dated Changelog entries for steps 13, 14 and 16.

The full browser run in kinotta-review-playwright-complete.log finished with 160 passed and one parts-page initial-Loading failure. That case passed all 10 diagnostic repetitions (kinotta-review-parts-diagnostic.log), and passed in the following full run. Temporary request instrumentation was restored; no diagnostic helper changes remain.

The final full npx playwright test --workers=2 run started with 4.33 GiB free memory and finished with 160 passed, 1 failed, exit 1 (5.5 minutes). Log: C:/Users/ryand/AppData/Local/Temp/kinotta-review-playwright-verified.log. All pin, alternate, parts, playback and Working tests passed. The remaining failure was tests/e2e/drop-video.spec.ts:76, before video selection: the page displayed Could not load reels, ENOENT stat on reels/dropped-clip/.agent/jobs/<job>/state.json.tmp. The saved error context is C:/Users/ryand/AppData/Local/Temp/kinotta-review-drop-video-error-context.md.

The direct isolated rerun with all default fixture servers crashed during setup (exit -1073740791), before any test ran; log: kinotta-review-drop-video-isolated.log. Repeating only the failed test with the same Chrome channel and footage/fake-transcriber server settings passed (1 test, exit 0); log: kinotta-review-drop-video-isolated-single-server.log. No test assertion or timeout was changed.

The concrete error is in server/core/_internal/reels.ts:24-39: newestMtime enumerates files recursively, then stats each entry without handling ENOENT when an atomic writer has already renamed its temporary file. That module and agent-jobs.ts are unchanged from origin/main; the state.ts change only adds comment fields. This explains the captured reel-list API error, but does not establish the cause of earlier initial-Loading failures. Fixing the listing race is outside the pinned-effect interactions specified by the plan. Per the brief's stop condition, no listing/loading implementation was changed; State is blocked on the focused scope question above. The full-browser Done checkbox remains unchecked.

No push or PR was made, and node_modules remains untouched.


### 2026-10-26: approved reel-listing fix execution plan

The owner approved only the vanishing-file race: test through openProject.listReels while deleting a real temporary file between enumeration and stat, then skip ENOENT from that file stat and keep all other errors visible. Verify the empty-directory mtime fallback and a non-ENOENT failure. Run the focused reel tests, full unit project, typecheck/build and drop-video.spec.ts alone with two workers and file logs. Record the fix as found during this work in the plan Changelog and commit it separately with a fix prefix. Per the new Status decision, do not rerun full Playwright; leave its checkbox unticked for Claude's verify gate and mark State done after the other checks pass.


### 2026-10-26: approved reel-listing fix complete

newestMtime now skips ENOENT only around a file stat, so an atomic rename between readdir and stat does not prevent the entire reel list loading. It marks a file as seen only after stat succeeds, preserving the directory timestamp fallback when every file has disappeared. Other stat errors still throw. Directory traversal and unrelated loading behavior are unchanged.

The regression deletes a real state.json.tmp just before its stat and checks the public openProject.listReels result and exact folder timestamp. It failed with the captured ENOENT before the production fix (kinotta-reel-listing-red.log), then passed after it (kinotta-reel-listing-green.log). A second regression verifies that EACCES is propagated. All 10 reel tests pass (kinotta-reel-listing-focused.log), and typecheck, build, docs, encoding and whitespace checks pass. The dated plan Changelog records the race as found during this work.

The first full unit run had 977 passed, 6 skipped and one EBUSY unlink error in the generated-audio test (kinotta-reel-listing-unit.log). No audio implementation or assertions were changed. The audio suite passed all 15 tests alone (kinotta-reel-listing-audio-isolated.log), and the full unit rerun passed: 112 files, 978 passed, 6 skipped, exit 0 (kinotta-reel-listing-unit-final.log). The six skips remain the existing optional librosa, opt-in real Whisper and Windows symlink-permission cases.

Ran npx playwright test tests/e2e/drop-video.spec.ts --workers=2 alone with the default Chrome/fixture configuration: all 3 passed, exit 0, including the original reel-list failure (kinotta-reel-listing-drop-video.log). All logs above are in C:/Users/ryand/AppData/Local/Temp/. Build/typecheck logs are kinotta-reel-listing-build.log and kinotta-reel-listing-types.log; final docs/commit logs are kinotta-reel-listing-docs-final.log and kinotta-reel-listing-commits-final.log.

Per the owner's explicit Status decision, State is done with every other Done item ticked; full Playwright remains unticked for Claude to run through the verify gate. It was not rerun after this fix. No push or PR was made; node_modules was left untouched.


### 2026-10-26: round-two execution plan

Apply the eight round-two fixes in focused commits. First prepare instant builds from a short locked snapshot, run Python outside the lock, then revalidate before publishing; cover slow-build reads/edits and transition-write failure through the project API. Retain the brief comment-read lock because commentsForVersion calls readEditListNow, which can recover a publication journal or replay and write Working; the build must never hold it. Roll back the ordinary request if removing its instant predecessor fails. Next flush pending card notes on unmount without updating an unmounted component, keep insert requests in gaps/cards rather than frame markers, and expose the phone explanation. Finally add typed build/storage failures and ENOENT-only optional reads, make the requested small cleanups, and update ADR 0007. Run affected core/browser checks, alternate compatibility, typecheck/build/docs/commits and the unit project with file logs. Do not run full Playwright; Claude owns that verify gate. Record every result and set State done only after these checks pass.


### 2026-10-26: round-two fixes and targeted verification

1. Instant creation and note clearing prepare a short locked snapshot, run the entire Python build outside the reel lock, then revalidate before publishing. A held Python callback no longer delays comment reads or note edits. The comment-read lock is retained for a concrete reason: commentsForVersion calls readEditListNow, which calls recoverSave and can call replayOntoNewest/writeStored; removing the lock would let a read publish recovery/replay during another write. The slow-build regression proves that the long build does not occupy this lock.
2. The instant-to-agent transition writes the ordinary request without an intermediate derived read, then removes the instant operation. If that second write fails, it removes the new ordinary copy and rejects the save, retaining the original instant and the caller's unsaved draft. The forced EIO rename regression verifies no duplicate/hidden note and verifies a successful retry. Both reliability regressions fail against the prior comments.ts and pass with the fix (kinotta-round2-core-red.log, kinotta-round2-core-final.log).
3. Pin cards flush pending drafts on unmount, keep their flush registered until it completes, and guard saving/problem state updates after unmount. Late responses for a different selected reel/version no longer replace the active comments. The browser test types and switches sections in one turn while blocking React's blur handler, then verifies the saved text after returning and reloading. It fails with the old cleanup (kinotta-round2-unmount-red.log) and passes with flushing restored.
4. Insert requests stay in their gap and cards. They no longer produce frame hexes in Storyboard stills/players, the enlarged shot, or Review. Review changes here are a single insertShot exclusion from frame markers; no alternate/playback/selection behavior changed. The browser check verifies both grid and enlarged frame markers are absent and the gap request is present.
5. The phone explanation now sits outside the hidden drawer and is visible at 390px. Delete/Undo and unavailable adding controls still pass. Desktop insert and phone screenshots were inspected (kinotta-round2-insert.png and kinotta-pins-phone.png in the temporary log directory).
6. Missing Python and failed Python builds throw KinottaError. All optional pin-comment readers and reel-wide decision reads use typed parse/read errors; only ENOENT is treated as an empty record. Regressions cover missing Python, corrupt captured pins, corrupt decisions and a permission error that must not become empty data.
7. Removed the redundant state.comments instant filter at hand-off; CommentsPanel computes waitingCount once; insert coordinates and the touch/phone condition are named. The CSS condition is documented alongside the matching named JS query. Instant fill selection uses the catalogue's instant flag and instantFrom metadata rather than hard-coded effect ids. Working writes use writeJsonAtomic, which now delegates to the existing retrying Windows atomic writer, preserving the earlier EPERM fix. Its import is below the module header.
8. ADR 0007 now says Implemented on feat/storyboard-pinned-effects.

Targeted verification: 19 pin/batch/reliability core tests passed; all seven alternate core suites passed (26 tests); all 5 pin browser tests and all 15 alternate browser tests passed, with --workers=2 and one browser run at a time. Logs: kinotta-round2-core-final.log, kinotta-round2-alternates-core.log, kinotta-round2-pins-ui-final.log and kinotta-round2-alternates-ui.log. The deliberate red runs above are regression proofs, not unresolved failures. Typecheck/build/docs logs: kinotta-round2-types-final.log, kinotta-round2-build-final.log and kinotta-round2-docs.log. All logs are in C:/Users/ryand/AppData/Local/Temp/.


### 2026-10-26: round-two final verification

Full unit project passed on the final source: 113 files, 983 passed, 6 existing environment-dependent skips, exit 0 (kinotta-round2-unit-final.log). The skips remain optional librosa, opt-in real Whisper and Windows symlink permissions. Typecheck, production build, documentation, encoding and whitespace checks pass. Commit metadata is checked against origin/main after the final documentation commit; log: kinotta-round2-commits-final.log. Final documentation check log: kinotta-round2-docs-final.log. All logs are in C:/Users/ryand/AppData/Local/Temp/.

The round is committed in logical slices: server reliability (84c72df), Storyboard navigation/display (eb2d9c0), then ADR 0007 and this verification record. All eight requested fixes are complete. State is done under the owner's explicit Status exception: full Playwright remains unticked and was not rerun, because Claude owns the next verify gate. No push or PR was made; node_modules remains untouched.

### 2026-10-26: Claude verify gate on 6f2fa55

Verify gate (`scripts/verify-lane.mjs --force`, logs in `tests/artifacts/verify-lane/2026-10-26T09-07-31/`): typecheck ok; full Playwright ok in two shards, 85 and 77 passed (162); mojibake ok. Unit failed one test, `render.test.ts:159` (the Draft render child exited 0xC0000409 under load); `npx vitest run --project render tests/core/render.test.ts` alone passed 9/9, so it is a load flake, not this branch. Scope flagged only docs outside Touch: the plan, the behaviour mockup, CONTEXT.md and ADR 0007, all written by Claude or requested in round two.
