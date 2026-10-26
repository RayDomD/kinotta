# Brief: Storyboard pinned effects and "Keep this note" (codex)

## Status

<!-- Keep this block current. Claude reads only this block and the diff. -->
- State: done
- Done: all eight review fixes and steps 13, 14 and 16 implemented and committed. The owner-approved reel-listing fix skips only file-stat ENOENT, preserves other errors and the folder timestamp fallback, with two new regressions. Final unit project: 112 files, 978 passed, 6 existing environment-dependent skips; drop-video.spec.ts alone: 3 passed with --workers=2. Typecheck, build, docs and commit checks pass; dated plan Changelog records the listing fix.
- Failed or skipped: six existing environment-dependent unit skips. The first unit run hit a Windows EBUSY deleting a generated WAV (977 passed, 1 failed); its audio suite passed alone (15 tests), then the complete unit rerun passed. Full Playwright was not rerun, per the owner decision below; its checkbox remains unticked for Claude's verify gate. Earlier full-run failures remain documented under Results and are not represented as a passing full suite.
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

## Done when

- [x] Step 13, desktop: a new Playwright spec drags Title card onto a frame (made at once, in Working, Undo removes it), drags Big word onto a frame (waits for Build), writes a note on an instant pin (moves to the agent) and clears it (moves back), deletes a pin by Delete key and by its card, and undoes both. It also proves the gap and the alternates strip are not drop targets.
- [x] Step 13, Insert shot: the spec clicks Insert shot in a gap, describes the shot, and shows the comment goes in the next batch and no "Keep this note" prompt follows.
- [x] Step 13, alternates: on a shot with alternates, previewing r2 and dropping an effect pins it to r2; the alternate in the reel is unchanged. `alternates-*` suites still pass.
- [x] Step 13, phone width (390px): pins and cards show, Delete and Undo work, and no way to add a pin is offered.
- [x] Step 14: a test fails if an instant pin creates an agent job; an agent pin or any pin with a note is saved as a comment with an `effect` id and goes in the next batch (`tests/core/batch.test.ts` passes); the build button shows the waiting count and "1 agent run".
- [x] Step 16: after a built pin note, the prompt shows the plan's heading, quoted note and explanation; "Always for this reel" adds a rule to that reel's style only; "Only this version", or ignoring it through the next Build, adds nothing and does not ask again.
- [x] `npm run typecheck`, `npm run check:docs`, `npm run check:commits -- origin/main` pass.
- [x] `npm run build`, then `npx vitest run --project unit` pass.
- [ ] Full `npx playwright test --workers=2` passes. `main` has no known failures since #74; rerun any failure alone before calling it real, and report it under "Failed or skipped" with the log path if it is not yours.
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
