# Audio and multiple-source implementation handoff

Prepared 2026-10-07, Asia/Manila. Workspace: C:/FIles/Projects/Apps/Kinotta.

## Owner instruction and scope

Continue implementing the confirmed first delivery stage. Reserve the last 5% of account usage for an accurate handoff. This means stop new implementation before 95% used, not after consuming only 5%. Last reading before writing: 91% five-hour, 22% weekly. Read current account usage before resuming. Do not re-interview settled product decisions.

The whole stage is NOT complete. Import, placements, speech, sound, frozen Save and rendering must work together across the complete ledger. Recording and free layout belong to later stages. No git writes, commits, pushes, deployments or external sends occurred. Preserve existing uncommitted design and planning documents.

Model recommendation: GPT-6 Luna at Medium for a tightly bounded implementation task with explicit tests. Use GPT-6.1 Sol at Medium when resolving cross-engine architecture or hard synchronization problems. This is a recommendation, not a model-setting change. Keep contexts and test runs focused to save usage.

## Authority and plan

- docs/2026-10-07-audio-multiple-sources-grilling-decisions.md: final agreed ledger, S1–S12 and AM decisions.
- CONTEXT.md and ADRs 0003–0005: media preservation, placement identity and shared sound.
- docs/plans/2026-10-07-audio-multiple-sources-implementation.md: A1–A11, still In progress.
- docs/briefs/2026-10-07-audio-multiple-sources-grilling.md: completed interview evidence, not an implementation contract.
- This summary supersedes the earlier summary that incorrectly said there were no code changes and misread the usage instruction.
- Original entry handoff remains C:/Users/ryand/AppData/Local/Temp/2026-10-07-kinotta-audio-multiple-sources-implementation-handoff.md. Use this current summary for implementation state.

The owner explicitly authorized continued implementation after public test seams were proposed. Use TDD through public model functions, openProject workflows, real composing/rendering and browser behavior. Do not ask again.

## Implemented and verified paths

D1. Both engines now have independent Sources, Placements, ordered main sequence, explicit gaps, timed inserts/audio, image duration, legacy adaptation and occurrence-aware speech expansion. TypeScript modules: server/core/_internal/media-model.ts and media-audio.ts, exported through server/core/model.ts. Python: skill/kinotta/engine/pieces.py, build.py and scripts/shots.py. Placement operations add/change/remove/move/replace are persisted, replayed and support Undo/Redo. Replacement requires fresh identity. Word text, timing and phrase edits accept placement identity and preserve source cache/other occurrences. Native captions use cached speech and stop caption holds at occurrence boundaries.

D2. Project library supports streaming video/image/audio import, SHA-256 deduplication, search/filter, original retention, actual probing and HEVC/ProRes preparation. Project references and exact-content relinks exist in core/HTTP. Missing/changed original states are detected. Byte-range media serving validates known IDs, content and project containment. Waveforms use original amplitude, are content-cached and may be unavailable independently of media readiness. See media-library.ts, media-waveform paths, HTTP handler and web API.

D3. Save stages and hashes original media into version-local media/, preserving source IDs and optional display names. Changed originals are rejected on subsequent Save. Code-only authored pages retain their existing page and get a frozen media.json sidecar, with Save journal integration. Legacy read-only loading is preserved. readMediaModel resolves source roots correctly for reel-local, motion/ and code-only plans.

D4. Native graphics fragments now snapshot into dependencies/ with recursively copied literal HTML/CSS references and selected literal external-JS imports/fetch/new URL references. External dependencies are rejected before publication, retaining pending edits and previous versions. Implementation: graphic-preservation.ts and version-build.ts. This is deliberately partial: inline JS, dynamic references, srcset and all dependency syntaxes are not comprehensively analyzed. Code-only page dependencies are not yet all frozen. The graphic test verifies bytes and rewrites, not actual rendering of every asset type.

D5. Browser audio uses a shared AudioContext clock, decoded source buffers, scheduled loop phase, gain, linear volume points and proportional fades. Mute is saved, Solo is preview-only. Pending edits are audible. Pause/seek and rescheduling have measured browser tests. Render composes native pictures and whole-reel sound through FFmpeg without normalization, automatic join fades or segmentation-dependent audio changes. Authored graphics stay layered on the output. Native render accepts version-local plans or code-only sidecars.

D6. Native MediaReview displays placements, picture, authored page, playback, import/search/filter, waveform, range/start/duration, levels/fades/volume points, mute/loop/Solo, selected speech, word corrections, removal, main reorder and gaps. Legacy reels expose Edit media when existing edits permit. Save is connected. Source display names now survive freezing instead of becoming hash filenames. Native saved versions get appropriate sidebar help text. APIs remain centralized in web/src/api/. New UI is desktop-oriented and retains existing DESIGN.md styling.

D7. Native comment/pin backend anchors can identify placements and source times or local offsets. Reorder keeps targets stable and removal flags lost moments. The new editor does not yet create these pins through its UI.

## Latest actual verification

All listed commands completed with exit code 0 unless explicitly marked pending:

- npm run typecheck: passed after the last sidebar/display-name edits.
- npm run build: passed after the last sidebar/display-name edits.
- npm test -- tests/core/media-model.test.ts tests/core/media-audio.test.ts tests/core/media-library.test.ts tests/core/media-waveform.test.ts tests/core/version-media.test.ts tests/core/code-media-save.test.ts tests/core/media-pins.test.ts tests/core/graphic-media-save.test.ts tests/engine/media-model.test.ts tests/core/edit-model.test.ts tests/core/code-only-edits.test.ts tests/core/word-pins.test.ts tests/core/comments.test.ts tests/core/media-http.test.ts tests/core/footage-http.test.ts
  15 files, 90 tests passed, 4.02s.
- npm test -- tests/core/render-media.test.ts tests/core/render-media-preview.test.ts
  2 files, 3 tests passed, 19.10s. Actual Chromium and FFmpeg. Browser audio meter checks gain halving, pause silence, seek/resume, UI Save, legacy import/search/audio-add/Save. Render checks color markers/gap/product insert, decoded levels and exact single/two-segment AAC audio parity for the synthetic fixture.
- npm test -- tests/core/graphic-media-save.test.ts
  1 file, 1 test passed after a valid failing test proved fragments were still mutable.
- Initial baseline: 6 files, 63 tests passed including real footage/segmented render, before code changes. Do not treat the baseline as verification of new code.
- Final legacy Save plus browser regression run was started separately. Append its actual result below before resuming.

No full ledger completion, comprehensive picture/audio synchronization, full CLI workflow or complete UI accessibility certification has been established.

## Remaining work and suggested continuation

A1. First finish library readiness and speech: first-used source transcription/cache, project discovery, preparing/error retry states, UI reference/relink/retry/drop and library preview. Preparation failure may leave an unregistered original. Exact project relink exists, frozen-version dependency repair does not.

A2. Finish occurrence-aware editing and authored attachment behavior: native split/cut/snip and duplicate/reuse/replace UI, keyboard trim/move/snapping, source framing/crop, Follow footage attachment flags/repair, continuous sections, caption phrase positioning and source-start attributes, pending caption timing updates, native pin UI. Legacy word correction before adaptation and native source/role validation need focused auditing.

A3. Finish playback/render guarantees: picture preloading/readiness, pause on picture stall, retry instead of ignored video play failure, measured synchronization within one output frame, overload detection and owner acknowledgement, explicit Save and render versus Render saved version in UI/CLI, comprehensive required-content render gate. Audio-only tests do not establish picture synchronization.

A4. Finish reproducibility: comprehensive dynamic/page dependency analysis and freezing, independent authored page sound detection/conversion, frozen-version exact relink, required-source-only preservation, copy/build/publication interruption/restart coverage. Audit literal JS rewriting and inline JS carefully before extending graphic-preservation.ts.

A5. Preserve named-element editing when a code-only reel has native media, and implement its selected voiceover caption overlay. Current native MediaReview bypasses some old authored-page editing controls.

A6. Complete verification: MediaReview.verify.ts currently contains fixture names/invariant checks and runtime data-verify attributes, but no complete fixture mounting harness or deliberate FAIL proof. Impeccable context detector ran once, one desktop screenshot was inspected, and a scoped fresh reviewer was dispatched near handoff. Record findings before claiming finish review complete. The screenshot was an audio-only synthetic reel and predates display-name/sidebar copy fixes. No design-document changes were needed.

A7. Exercise the complete working reel and audit every applicable ledger requirement. All A2–A10 remain partial, A11 remains incomplete. Do not claim the stage complete based on the passing synthetic suites.

## Working discipline

No new module folders were created. Existing folder conventions apply. No git writes. Do not remove existing uncommitted docs. The plan dashboard must be regenerated after plan edits with powershell -NoProfile -File docs/plans/build-plans-index.ps1. Keep future summaries under docs/session-summaries/. Save the final 5% for evidence and handoff again if the next window approaches its limit.


## Final verification and finish review

The final command npm test -- tests/core/snip-save.test.ts tests/core/render-media-preview.test.ts completed: 2 files, 29 tests passed, 33.52s, exit code 0. This ran after the display-name and sidebar help corrections. No failing test or running test process remains.

Fresh read-only finish review identified these concrete unfinished issues. They are recorded, not fixed:
- F1 (P1): Speech inputs use defaultValue with keys based on placement/time only. Undo/Redo of word text can leave the visible input stale. Synchronize value/remount when the word changes, and add a browser Undo/Redo regression.
- F2 (P2): Removing a Solo placement leaves its ID in preview Solo state and can silence the remaining reel. Prune absent Solo IDs, with a measured playback regression.
- F3 (P2): The audio-only fixture has a large unexplained blank preview. Add an explicit audio state only when absence of authored graphics is established.
- F4 (P2): Image/silent-source placements expose ineffective audio controls, including Solo, which can silence real audio. Hide or disable those controls appropriately.

Review inspected the current source plus the earlier desktop screenshot. It was not a full ledger audit or verification-harness completion. No impeccable detector/FAIL harness result is claimed. Final account reading before document completion: 92% five-hour, 22% weekly. New implementation stopped here to preserve more than the requested final 5%.

## F1–F4 fixed, 2026-10-07 (later session)

All four finish-review findings are fixed in web/src/review/_internal/MediaReview.tsx, each test-first through one new real-browser test in tests/core/render-media-preview.test.ts ("keeps preview controls truthful..."). Each section of that test failed before its fix.

- F1: only the speech word inputs were affected. Placement inputs already remount because their container is keyed by the whole placement. Word inputs are now keyed by text too, so Undo shows the restored word.
- F2: Solo is filtered to placements that still exist, and pruned in state so Undo of the removal does not revive it. Proof: with the prune reverted, the remaining reel measured 0 RMS. With the fix it is audible.
- F3: "Sound only. No picture or graphics at this point." shows only when no picture plays at the playhead and the version has no shots, no overlays and is not code-only. That is where authored graphics are declared.
- F4: Volume, fades, Mute, Loop, speech, Solo and volume points are hidden for images and sources with audio: false. Solo checkboxes now carry an accessible name per placement.

Verification: npm run typecheck exit 0. npm run build exit 0. The 15-file core list from this summary: 90/90 passed. tests/core/render-media.test.ts, render-media-preview.test.ts and snip-save.test.ts: 3 files, 31/31 passed, 45.09s, real Chromium/FFmpeg.

Note for successors: browser tests run against dist/web, so run npm run build after UI edits before the browser suite. Use rtk proxy for vitest output because the rtk vitest parser fails on these runs.

Next: A1 (first-used source transcription, preparing/error/retry states, UI relink/retry/drop, library preview). A2–A11 remain as listed above.

## A1 library readiness and speech, 2026-10-07 (later session)

Implemented, each behavior covered by a test that drives it through public seams:

- Speech (AM30): server/core/_internal/media-speech.ts. Project.mediaSpeech and Project.transcribeMedia (GET/POST /api/media/:id/speech, optional reel/version) transcribe a source in the background with the project's transcriber, keyed by content hash and cached in footage/.transcripts/<hash>.json. Words are shared by every placement, reel and saved copy of the same bytes. A failed run reports its reason and starts again on retry. Save fills words for every source a placement selects as speech (main by default, others when chosen; legacy, image and audio: false sources excluded) and refuses with "Speech for <name> is not transcribed yet" otherwise. Review starts transcription automatically, shows "Transcribing speech…" or the failure with Retry speech, and shows the words in preview as soon as they are ready.
- Import failure (AM15/AM36): importMedia now removes the copy it made when the playback copy fails, so no unregistered original is left and a retry keeps the original name.
- Project discovery (AM5): Project.listProjectMedia (GET /api/media/project) lists supported files outside reels/, node_modules and hidden folders that the library does not hold. Review lists them under "In this project" with Add to library (reference in place, no copy).
- Library UI (AM10/AM15/AM25): drop files onto the library to import, Retry import for a failed file, Preview for ready image/video/sound, and Relink for a missing or changed entry, chosen from project files of the same kind. The exact-content check stays on the server.

Tests: tests/core/media-speech.test.ts (3, new). tests/core/media-library.test.ts gained the failed-preparation and discovery tests. tests/core/render-media-preview.test.ts gained the speech-retry and library-flow browser tests. tests/core/graphic-media-save.test.ts now declares its video has no speech (words: []), because Save requires words for a main take.

Red evidence: the failed-preparation test failed first with the leftover clip.mp4. The speech tests and the speech UI test were written before or right after their code, while the command classifier was down, so they could not be run red first. Instead, a temporary mutation proved each one bites: with the Save speech step disabled Save resolved instead of rejecting, and without the word merge the preview word never appeared. The discovery test was not seen red.

Verification: npm run typecheck exit 0. npm run build exit 0. tests/core and tests/engine without render suites: 383 passed, 1 skipped, 3–4 failures that are all 5 s timeouts under parallel load and vary between runs (including tests/core/editing.test.ts, which this work does not touch). The same files alone: 4 files, 18/18 passed. render-media, render-media-preview, snip-save: 3 files, 33/33 passed, real Chromium/FFmpeg.

Not done in A1: no visual critique/audit of the new library controls (they reuse existing classes and tokens). Discovery does not hide project files whose bytes are already in the library under another path; adding one returns the existing entry. Frozen-version dependency repair remains A4.

## A2 first slice: split, duplicate, replace, keyboard trim/move and snapping, 2026-10-07 (later session)

- placement-split (server/core/_internal/edit-model.ts): cuts a placement at a local moment into two uses, removing nothing. The first half keeps its identity; the second is `<id>~<operation id>` (deterministic on replay) with `origin` naming the first. Main takes split by source range, added media also on reel time, images and gaps by duration. The volume envelope continues across the cut (the second half starts from the level reached), fade-in stays on the first half and fade-out on the second, placement corrections are kept by both. Looping sound and moments at or outside the edges are refused with a reason. `origin` is a new optional field on SourcePlacement and GapPlacement.
- Feedback through a split (carry.ts remapMoment): a pin follows its placement, then any placement of the same origin, by source time. Gaps and images have no source time, so a pin past a split there is flagged as moment-removed rather than guessed.
- Review: Split at playhead, Duplicate (fresh identity, right after it in the sequence or on reel time), Replace with (ready library media of a compatible kind, fresh identity, same role and timing, corrections and volume points dropped because they belonged to the old content). Placement rows are focusable: arrow keys move added media by 0.1 s (Shift 1 s) or reorder main/gap items, [ and ] trim the start or end to the playhead, S splits there. "Snap to playhead and cuts" (on by default, can be turned off) stops a moved edge on the playhead or another placement's edge within 0.05 s past the step, and never holds an edge already on that point. Pure helpers in web/src/review/_internal/placement-edits.ts.

Tests: tests/core/media-split.test.ts (3, new: split geometry/envelope/words, refusals, a comment on the second half surviving Save and reorder). A new browser test in render-media-preview.test.ts drives split, Undo, snapped and unsnapped moves, trim, reorder, duplicate and replace. Existing browser tests now locate the playhead with an exact label, since "Snap to playhead and cuts" also matches "Playhead".

Red evidence: the split tests failed first (operation missing; carry placed the late comment wrongly). The browser test failed first on snapping, which exposed a real bug (a stop beyond the step could never win) that was then fixed.

Verification: npm run typecheck exit 0. npm run build exit 0. tests/core and tests/engine without render suites: 49 files, 389 passed, 1 skipped, no timeouts this run. render-media, render-media-preview, snip-save: 3 files, 34/34, real Chromium/FFmpeg. The carry test's Save runs the real build with a split plan, so the Python engine accepts `origin` and `~` identities.

Remaining A2: source framing/crop and Fit, Follow footage attachments with flags/repair, continuous section parts, caption phrase positioning and source-start attributes, pending caption timing updates, native pin UI, and the legacy/native validation audits. Edits replayed from an agent that target the original identity of content now in a later split half are flagged, not re-targeted.

## A2 framing, followed media and caption targeting, 2026-10-07 (handoff 3 continuation)

D1. SourcePlacement.framing now holds Crop or Fit plus normalized horizontal/vertical positions (0–1, centered by default). Placement changes persist it independently, with validation in both engines. Native preview uses the matching CSS framing and exposes its live state. Native FFmpeg rendering crops by default, supports Fit and adjusted positioning for video and photos, and retains the authored page's canvas instead of adopting the first video's shape. First-source frame-rate selection is unchanged. UI controls use percentages and existing editor styles. The edit cards now describe framing and attachment changes accurately.

D2. Added-media attachment holds a specific main-video placement, source moment and optional offset. Default is Stay at time. Both engines resolve the named occurrence, including split descendants, and flag removed anchors without choosing a repeated take. The edit model preserves the last valid reel position for repair. Move/trim, split and Duplicate maintain the offset. Splitting an already split anchor retargets its attached items to the half retaining the moment. Broken items remain listed, are excluded from picture, sound and speech selection, and block Save and every render preset. Review offers Follow footage at playhead and Stay at time. The browser test covers attachment, reorder, removal, Undo, detachment, explicit reattachment and Save. Save failure retains the edit list.

D3. Caption phrase-position operations now accept and require placement identity for native media. Position entries use placement plus source-start time, so repeated uses stay independent. Native word retiming moves the corresponding phrase offset. The Python builder applies only that occurrence's offset and emits data-source-start on caption scenes and their words. This is model/build support only: native caption position controls and pending caption timing preview are still outstanding. Caption offsets through a later placement split still need auditing.

Verification and red evidence:

- npm run typecheck and npm run build: exit 0 after final edits.
- npx vitest run --project unit tests/core tests/engine: 47 files, 378 passed, 1 skipped, one 5-second timeout in tests/core/version-media.test.ts. That file alone: 4/4 passed, exit 0. This broad run preceded the final caption changes and added Python framing-validation test.
- npx vitest run tests/core/render-media.test.ts tests/core/render-media-preview.test.ts tests/core/snip-save.test.ts: 3 files, 37/37 passed, 88.15 s, exit 0. Real Chromium and FFmpeg. This run preceded the caption-targeting changes; later build/typecheck and the caption-focused suite below cover those changes.
- npx vitest run tests/core/media-split.test.ts tests/core/snip-save.test.ts tests/engine/media-model.test.ts tests/core/media-model.test.ts tests/core/edit-model.test.ts tests/engine/captions.test.ts: 6 files, 93/93 passed, 26.71 s, exit 0 after final caption changes.
- Model tests were observed red before each framing/attachment/caption fix. Real render pixels exposed the canvas bug and default Fit behavior. Browser tests failed first on default framing and absent attachment controls. Additional failing tests proved attachment move/split offsets, repeated-split anchor repair, broken-voice caption selection, the render gate, Python framing validation, independent caption position and source-start metadata.

Visual check: inspected a full desktop screenshot showing the framing controls and actual cropped preview, with no overlap or clipped controls. Impeccable detector ran once and reported only advisories on existing literal font sizes in review.css. No font-size declarations changed. This does not complete A6's full fixture/FAIL harness or full visual audit.

Latest account usage: 18% five-hour, 25% weekly. Continue until roughly 95% used in either window, preserving the last 5% for a continuation handoff. The goal remains active. No git writes, external sends, commits or pushes.

Next A2: interrupted sections as continuous parts and broken graphic attachment flag/repair, then caption position controls and pending caption timing preview, native pin creation, legacy/native validation audits. A3–A11 remain as recorded above. No first-stage completion claim.

## A2 continuous sections and explicit graphic repair, 2026-10-07 (handoff 3 continuation)

D1. Native source-attached sections now retain every surviving continuous part, with distinct IDs and part names. A plain cut joins again when both source and reel time stay continuous. Source-attached graphics remain listed and flagged when any of their range is removed or interrupted. Neither engine silently chooses the longest stretch. Selected non-looping voiceover ranges also map, clipped to the actual placement duration and reel end. Version.mediaSections preserves the raw source anchors separately from the built sections.

D2. Explicit graphic repairs are persisted operations: trim to a surviving part, attach to the main footage range at the playhead, or split into all surviving parts. The split retains the original fragment and produces deterministic independent IDs/scenes, including implicit fragment lookup. Pending split parts reuse their original saved scene at each part's new time until Save builds the separate scenes. The editor lists continuous sections and graphic warnings with repair controls. Broken graphics block Save before staging and every render preset. Failed Save retains pending operations.

D3. Source-time trim and slide bounds use source duration for attached graphics, including surviving split descendants. Splitting an already split placement canonicalizes its section/graphic range anchors and carries caption phrase offsets to the half retaining the phrase's source start. This prevents a subsequent removal of the earlier half from losing the surviving attachment.

Verification and red evidence:

- npm run build: exit 0 after the graphic preview controls. npm run typecheck: exit 0 after all behavioral edits. The later public export addition only exports the two already-checked operation interfaces.
- npx vitest run --project unit tests/core tests/engine: 48 files, 392 passed, 1 skipped, exit 0, 34.74 seconds. This includes snip-save and the real-build graphic repair Save tests.
- npx vitest run --project render tests/core/render-media-preview.test.ts tests/core/render-media.test.ts tests/core/snip-save.test.ts: 2 render files, 11/11 passed, exit 0, 56.65 seconds. snip-save is a unit-project file and was covered by the broad command above. Real Chromium and FFmpeg.
- Focused source/attachment/Save/engine run: 5 files, 26/26 passed. The strengthened browser repair test also passed alone, verifying second-part scene timing, Undo, trim, reattachment and Save output.
- Observed failing tests before implementing continuous parts, broken graphic Save gating, source-time trim/slide bounds, repeated-split anchor preservation, selected voiceover mapping, explicit graphic splitting and the absent browser split button. A decimal-equality assertion was corrected to a tolerance check. Typecheck caught an invalid test-only phrase scale field and it was removed.

Remaining: looped selected speech has no cycle-specific range anchor yet. mediaSpans currently refuses looping placement attachments instead of guessing a cycle, so those graphics remain flagged and looping anchored sections still need explicit handling. The graphic repair UI selects main footage at the playhead; selecting a voiceover attachment is still a model operation. Nested splitting of an already saved graphic part still needs a pending-scene ancestry audit. Legacy adapter validation/source-linked ranges, native caption position controls and pending timing preview, native pin creation, and A3-A11 remain unfinished. The new graphics controls reuse existing classes but have not received a separate full screenshot critique. A6's fixture/FAIL harness remains outstanding. No first-stage completion claim.

Latest account usage: 38% five-hour, 28% weekly. Continue until roughly 95% used in either window, preserving the last 5% for a continuation handoff. Goal active. No git writes or external sends.

## A2 native caption positioning and pending timing, 2026-10-07 (handoff 3 continuation)

D1. captionPhrases in the public model groups live speech with the page builder's word cap, clause/pause/occurrence breaks and short phrase hold. A parity test runs the Python builder's phrase function and compares phrase timing, words and occurrence identities across repeated footage, a gap and selected voiceover.

D2. PagePlayer accepts a native captionPreview describing current phrases. It replaces the saved caption scenes with safe DOM nodes containing live placement, source-start, word timing, style and text, and explicitly updates active/said/now state after seeking. Existing authored graphic scenes remain untouched. Preview restores saved caption nodes if this option is removed. Legacy captionWords and captionShifts callers keep their existing path. MediaReview supplies all live phrases, including newly duplicated speech and newly transcribed words, using the saved look/color and pending positions. Caption previews are recomputed only when their model changes, rather than rebuilt on every playback tick.

D3. The native preview now supports the existing caption drag/keyboard handle: move all captions by default, Alt for the active phrase only. The phrase operation includes its placement identity and source-start. Source start/end inputs beside each speech word persist word-timing operations and immediately update caption scene/word timing. Undo restores both. Source end values are rounded to the media model's microsecond precision, avoiding long decimal strings after repeat placement arithmetic.

Verification and red evidence:

- npm run build and npm run typecheck: exit 0 after final behavioral edits.
- Public grouping test was observed failing before the helper existed. The browser flow failed first because the native caption handle was absent. It now checks independent repeated-phrase positioning, first-word retiming and retained position, Undo, duplicated caption scenes, active captions in the duplicate, no captions in the gap, and real Save output. The floating-point input assertion also failed before its fix.
- npx vitest run --project unit tests/core/media-model.test.ts tests/engine/media-model.test.ts tests/web: 6 files, 66/66 passed. Includes engine parity and the existing web helper tests.
- Broad unit run: 48 files, 392 passed, 1 skipped, 2 failures. One was the architecture scanner matching a builder filename in a new comment, corrected to plain wording. The other was a 5-second version-media timeout while the browser suite ran concurrently. npx vitest run --project unit tests/core/start-reel.test.ts tests/core/version-media.test.ts then passed 12/12.
- Browser suite during that concurrent run: 9 passed, one pre-existing volume RMS check missed its tolerance. Isolated npx vitest run --project render tests/core/render-media-preview.test.ts passed all 10 tests, 32.60 seconds. Avoid running this browser workload alongside the broad unit workload.
- After the decimal-input fix, the strengthened caption browser flow passed alone again (1 passed, 9 skipped), with real Save, and final build/typecheck passed. No other behavior changed after the isolated 10-test pass.
- Inspected full desktop viewport captures of the caption preview and the scrolled speech controls. Controls wrap within the main panel without overlap. The screenshot exposed the decimal display issue that was fixed. A6's full fixture/FAIL harness and broader visual audit remain outstanding.

Next: native pin creation, legacy/native validation and legacy source-linked graphic/section mapping. Also carry forward looping selected-speech range anchors and pending preview ancestry for nested graphic splits from the preceding checkpoint. The native word fields support corrections; whole-phrase text editing through the handle is still absent. A3-A11 remain incomplete. Goal stays active, with no first-stage completion claim and no git writes or external sends. Most recent usage check: 44% five-hour, 29% weekly.

## A2 native review pin creation, 2026-10-07 (handoff 3 continuation)

D1. Native MediaReview now creates frame pins at a paused playhead and word pins from selected speech. The frame overlay accepts a position or a keyboard-centered pick, resolves named page elements and shows a draft marker. The comment form retains its text on a failed save. It uses App's existing comments state/service, so the sidebar updates immediately. Existing pins have a local seek list and frame markers, and sidebar reveal seeks the native preview. Removed moments remain listed and disabled in the pending preview.

D2. remapMediaMoment is a shared pure public-model operation extracted from the native carry path. Preview and Save use the same occurrence/root/source-time mapping, including split descendants, timeless placement offsets and removed anchors. New pins on existing moments map back to their saved version before being stored. A new unsaved placement or a retimed word that has no saved word target requires Save first, with a readable message instead of inventing a target. New native words outside the authored shots use the complete native transcript. Frame and word pins select the section containing their actual moment, including when carried to a new native version with no shots.

D3. CommentsPanel deletion Undo now restores native frame time and placement, and word placement, instead of dropping the anchors. The new frontend NewComment fields match the existing native backend contract. A browser test exposed the lost native frame anchor before its fix. A public Version test exposed the no-shot native word restriction and missing section assignment before those fixes. The browser also exposed missing carried section assignment and the missing visible draft marker before their fixes.

Verification:

- npm run build and npm run typecheck: exit 0 after final UI edits. Final typecheck also passed after the carried-section fix.
- npx vitest run --project render tests/core/render-media-preview.test.ts: all 11/11 passed, exit 0, 36.91 seconds, after the final carried-section fix. The native pin scenario covers repeated-placement frame/word targets, injected comment-save failure and draft retention, deletion Undo, split/reorder preview navigation, refusal to pin an unsaved duplicate, pending removal/Undo, and real Save/carry results including sections.
- npx vitest run --project unit tests/core/media-pins.test.ts tests/core/media-split.test.ts tests/core/version-media.test.ts tests/core/comments.test.ts tests/core/word-pins.test.ts tests/core/code-media-save.test.ts: 6 files, 26/26 passed after the final backend edits.
- Earlier focused comment/web check: 8 files, 68/68 passed. Broad core/engine run: 48 files, 393 passed, 1 skipped, one 5-second code-media-save timeout. That file passed in the focused rerun above.
- Browser regressions exposed two substring selectors that matched both word inputs and the new pin buttons. Changed those selectors to exact labels. A library reload timeout did not reproduce in the isolated rerun. The audio level test failed twice because its 200 ms baseline sometimes sampled startup before the tone settled. The test now waits for a full-level baseline and polls the same half-volume and pause-silence checks instead of relying on fixed sleeps. Full browser suite passed with these checks. No audio runtime behavior was changed in this slice.
- Inspected desktop pin form screenshots, then added the missing draft anchor and matched the form's input styling to existing tokens. Final screenshot shows the anchor at the selected point and a readable form without overlap. Full A6 verification harness and wider visual audit remain outstanding.

Remaining: legacy-adapted MediaReview pin creation still needs mapping against legacy saved-version/backend semantics. The native pin path is verified for actual media versions only. Native word pins after genuinely new/retimed pending words require Save first. Legacy/native validation and source-linked legacy graphic/section mapping, looping selected-speech range anchors, nested saved-graphic split preview ancestry, whole-phrase text handle editing, and A3-A11 remain unfinished. No first-stage completion claim.

Latest usage: 62% five-hour, 32% weekly. Goal active. Stop near 95% used in either window and preserve the last 5% for the continuation handoff. No git writes or external sends.

## A2 legacy source conversion, 2026-10-08 (handoff 3 continuation)

D1. The read-only legacy media view now exposes its source-linked clips, sections and caption phrase identities. Legacy cuts share the source root, so a graphic or section crossing adjacent cuts maps continuously. Preview uses the mapped reel duration and ranges without rewriting the old source plan. The first native placement edit, attachment repair or placement-targeted speech correction converts the working plan deliberately. A placement correction preserves the cached source words.

D2. A first graphic trim includes its attachment identity, triggers conversion and rejects a stale or wrong identity. Native plans reject legacy snip/cut/move-piece operations rather than recording changes that native playback ignores. Converted saved versions use their preserved media route even when their source ID begins with legacy:. The working legacy adapter still previews the original footage route.

D3. Public tests exercise conversion, interruption rejection, explicit graphic splitting, first trim repair, independent word correction, untouched old page bytes and rejection of ignored legacy edits. A real Chromium test reorders late source ranges, shows the interrupted graphic and section parts, repairs the graphic, saves v2, then replaces the original media bytes and verifies that the saved media route still returns the preserved original bytes.

Verification:

- npm run typecheck: exit 0 after the final model guard.
- npm run build: exit 0 after that guard and all UI edits.
- npx vitest run --project unit tests/core tests/engine --maxWorkers=4: 49 files passed, 398 passed and 1 skipped, exit 0, 68.67 seconds. The preceding default-worker run produced 17 five-second timeouts in 14 files, with no behavioral assertion failures. The reduced-worker run completed all of them. Keep broad unit and browser suites sequential.
- npx vitest run --project render tests/core/render-media-preview.test.ts: 12/12 passed, exit 0, 37.57 seconds. The preceding full run had 11 passes and an audio-startup check returning silence after a fixed 250 ms wait. That check now polls the same >0.04 sound threshold. No playback runtime changed.
- Red tests were observed for missing legacy range conversion, the first placement word correction leaking into source words, missing attachment identity validation, ignored legacy edit acceptance and converted saved playback selecting the original footage route. The browser fixture was also corrected to await the native editor mount and request the actual saved media URL.

Next: legacy-adapted review pins still need a verified bridge to legacy saved-version pin semantics and first-conversion carry. The native-only carry branch currently has no before timeline when a legacy version becomes native. Also audit legacy source identity across differently rebased plan paths and duplicate legacy source ranges before choosing the bridge. Looping selected-speech anchors, nested saved-graphic split preview ancestry, whole-phrase text handle editing, native input validation, A3-A11 and the full A6 fixture/FAIL harness remain unfinished. No first-stage completion claim.

Latest usage: 76% five-hour, 34% weekly. Goal active. Stop near 95% used in either window and preserve the last 5% for a continuation handoff. No git writes or external sends.

## A2 legacy review pins and first-save carry, 2026-10-08 (handoff 3 continuation)

D1. The adapted legacy editor now stores frame pins at their explicit saved reel time and word pins against the legacy full transcript, including when authored shots exist. It maps a pending reordered moment back to the saved legacy timeline before storing it and omits synthetic placement IDs from the legacy backend request. Existing shot-based frame pins and legacy transcript word section semantics remain unchanged.

D2. First native conversion maps legacy pin times through the old version's source ranges into the adapter's original source lineage. Successful carry adopts the native placement and source-time anchor. A subsequent removal flags the pin instead of moving it to a newly created duplicate. A native rebuild with no legacy source lineage flags old footage pins rather than assuming the old reel time identifies the same footage.

D3. Agent-built legacy folders sometimes lack their own plan/transcript metadata. Before the first native conversion changes the working sources, Save now freezes missing old plan/transcript copies, rebasing the plan's paths, without overwriting existing copies or rebuilding the old page. This is limited to first native conversion. Ordinary legacy Saves retain their previous metadata contract. It does not retroactively preserve legacy source media bytes.

Verification:

- npm run typecheck: exit 0 after all implementation and test changes. npm run build: exit 0 after the UI changes. Subsequent edits affect backend code, type comments and tests.
- npx vitest run --project unit tests/core tests/engine --maxWorkers=4: 49 files passed, 400 passed and 1 skipped, exit 0, 52.64 seconds.
- npx vitest run --project render tests/core/render-media-preview.test.ts: 12/12 passed, exit 0, 39.93 seconds. The legacy flow now creates frame/word pins, reorders the native view, explicitly repairs its graphic, creates another frame pin against the reordered preview, checks its stored old-version time, saves and verifies all carried native times/source anchors. It also still checks preserved saved media bytes after changing the original.
- Focused legacy Save/comment regressions: 4 files, 53/53 passed. Earlier pin-focused run: 4 actual files, 23/23 passed. The requested nonexistent carry.test.ts did not contribute a file.
- Observed red evidence: legacy frame creation rejected the empty shot, first carry retained the old reel times with no native anchors, an unrelated native rebuild incorrectly kept a legacy pin, the browser rejected a synthetic placement ID, and a legacy v1 without metadata lost its late source ranges after Save. The initial broad run exposed three compatibility changes. Restricted metadata freezing to first native conversion and kept the existing legacy transcript section contract, then the focused and full suites passed.
- Test-only fixes: frame inputs need element:null to satisfy the public type, and successful comment creation returns HTTP 201 rather than 200.

Next: native/legacy validation audit. Reject malformed model structure, unsupported source kinds and placement roles, and inconsistent fields consistently in TypeScript and the render engine. Keep the earlier outstanding looping selected-speech range anchors, nested saved-graphic split preview ancestry, whole-phrase text handle editing, A3-A11 and full A6 fixture/FAIL harness. The full first stage is still incomplete. No git writes or external sends.

Latest usage: 82% five-hour, 35% weekly. Goal active. Stop near 95% used in either window and preserve the last 5% for a continuation handoff.

## A2 native structure and legacy range validation, 2026-10-08 (handoff 3 continuation)

D1. The editor model and render engine now reject malformed native collection structure, invalid source/placement identities, unsupported kinds and roles, incompatible picture/sound roles, malformed boolean flags, word arrays/timing, volume points, origin identities and attachment objects with readable model errors. A shared test matrix covers 36 malformed persisted models. Native main video duration must agree with its source range. A valid explicit duration stays consistent when that range is trimmed. Looping remains supported for sound placements.

D2. Legacy project reads reject null, array and scalar plan roots rather than throwing a runtime error or returning an empty media model. Legacy pieces must be a list of valid source-range objects. The engine's legacy timeline mapping has corresponding root/list/item checks and rejects nonfinite range bounds. Seven project API cases and an engine matrix were observed failing before these changes.

D3. A proposed requirement that every listed main/gap placement appear in the sequence was removed after regression evidence showed the existing model deliberately selects active main uses by sequence. The unused-gap attachment test remains unchanged. Validation does not impose that new policy.

Verification:

- Final npm run typecheck and npm run build: exit 0. The later Python-only change moves the timeline_plan docstring above its checks without altering behavior.
- Final npx vitest run --project unit tests/core tests/engine --maxWorkers=4: 49 files passed, 446 passed and 1 skipped, exit 0, 58.00 seconds. Completed after all validation changes.
- npx vitest run --project render tests/core/render-media-preview.test.ts tests/core/render-media.test.ts: 2 files, 14/14 passed, exit 0, 88.72 seconds. This run includes the native validation changes. It finished before the final legacy plan-root/piece-list guards, so the full browser/render suite has not been repeated after those final guards.
- Final focused legacy/model/engine check: 4 files, 37/37 passed, exit 0, 9.02 seconds. An earlier legacy Save regression run passed 36/36 in 3 files. Focused native/model/web validation passed 105/105 before the unused-gap compatibility correction and the last legacy guards.
- Red evidence included silent acceptance, runtime TypeErrors/AttributeErrors, conflicting main duration, and stale explicit duration after trimming. The initial broad native run had one unused-gap compatibility failure with 438 passes and 1 skip. After removing that proposed policy, the next broad run passed 438 plus 1 skip. The final broad run above also includes the added legacy cases.

This is a validation slice, not completion of the whole schema/operation audit. Remaining malformed clips/sections/caption settings and operation payload boundaries still need review. Also retain looping selected-speech attachment ranges, nested saved-graphic split preview ancestry, whole-phrase caption text editing, A3-A11 and the full A6 fixture/FAIL harness. No first-stage completion claim.

Usage reached 95% five-hour and 37% weekly. Implementation stopped at the owner's reserved-usage threshold. The already-running final broad tests completed successfully. Continuation handoff: C:/Users/ryand/AppData/Local/Temp/2026-10-08-kinotta-audio-media-handoff-4.md. No git writes or external sends.

## Handoff 4 continuation: render base, overload, mono parity, picture hold, audits, 2026-10-08

D1. AM40 Save and render versus Render saved version. `Project.saveAndRender` checks the preset and settings, runs Save, and queues the render of the version Save made. A refused or failed Save throws and queues nothing. HTTP `POST /api/reels/<reel>/save-and-render`. The Render popover, when the newest version has unsaved edits, asks "Saved vN" or "Save as vN+1, then render" with nothing preselected; Render stays disabled until a choice is made. Without pending edits the popover is unchanged. The CLI keeps rendering an explicit saved version.

D2. AM29/AM38 overload. `mediaMixArgs` builds the same FFmpeg mix as the render (both now share one per-placement chain and one mix tail) and prints one peak per 10 ms; `Project.mixOverload(slug, version?)` joins windows above full scale into spans. Without a version it measures the pending mix Save would preserve (`readPendingMedia`). Draft and Final of an overloaded native version are refused with the spans unless `acceptOverload: true`; Overlay is silent and skips it. Levels are never changed. The Render popover shows the spans and requires "Render with the overload". The editor shows a "Mix overload" warning for the mix it is playing, with Go to buttons, measured 400 ms after edits settle. `kinotta render --accept-overload` renders as it is.

D3. Mono parity bug found while measuring. FFmpeg's mono-to-stereo conversion in the render's audio chain lowered mono sources by 3 dB, while Web Audio preview plays mono at full level on both channels. The existing render test hid it by decoding with `-ac 1`, whose fold-down added the 3 dB back. The chain now up-mixes with `pan=stereo|FL=FL+FC|FR=FR+FC` (mono at unity, stereo unchanged) and the test decodes the left speaker. Red without the fix: 0.176 against 0.25. Limitation: a 5.1 source folds down differently from Web Audio's speaker rules.

D4. Encoder limitation, not fixed. Inside an accepted overload FFmpeg's native AAC encoder applies its own clip avoidance after the onset (a 1.2 sine decodes near 0.96 after about 100 ms). The mix reaches the encoder unchanged and the passage before an overload keeps its level, which the test checks.

D5. AM36 picture readiness. `useMediaPlayback.hold` stops sound and the clock while staying in play. MediaReview holds until the video element is actually playing (after a start, a seek, a source change or a stall) and shows "Waiting for picture…"; drift is corrected only beyond a 30 fps frame while running. A picture that fails to load or play stops playback, disables Play and offers Retry picture. A pause or new source interrupting `play()` is not treated as failure.

D6. A1 audit. Operation payloads: a 33-case matrix through `applyOperation` found two gaps, both fixed: a null added or replacing placement threw a TypeError, and a non-string phrase text silently deleted the phrase's words. Persisted plans: a shared 21-case matrix of malformed native clips, sections and caption settings (including loop cycles) is now refused with the same readable reasons by `mediaPlanTimeline` and the engine's `timeline_plan` (`checkPlanParts` / `check_plan_parts`). `CAPTION_LOOKS` now lives in pieces.py and build.py imports it.

D7. A2 looping selected speech. Clips and sections attached to a looping speech placement name a `cycle` (from 0); `clip-attachment` takes one too. Both engines map only the named pass, clipped at the reel end; without a cycle the attachment stays flagged rather than guessing; a cycle on a non-looping placement maps nothing beyond 0. Repairing onto a non-looping placement drops the old cycle. No UI picks a cycle yet; the graphic repair UI still attaches to main footage at the playhead.

Verification:

- npm run typecheck and npm run build: exit 0 after the final edits.
- npx vitest run --project unit tests/core tests/engine tests/web --maxWorkers=4: 54 files, 492 passed, 1 skipped, exit 0, before the payload, plan-part and loop-cycle slices. Those slices were then checked with npx vitest run --project unit tests/engine tests/core/media-attachments.test.ts tests/core/media-model.test.ts tests/core/operation-payloads.test.ts: all passed (134 and 105 in two runs).
- npx vitest run --project render: 11 files, 79/79, 494 s, exit 0, after D1-D4 (built before D5).
- After D5: npx vitest run --project render tests/core/render-media-sync.test.ts (3/3) and tests/core/render-media-preview.test.ts tests/core/render-save.test.ts tests/core/render-overload.test.ts (19/19).
- Red evidence: saveAndRender missing (3 core tests), overload gate resolving instead of refusing, mono level 0.176, all 20 plan-part cases and 6 loop-cycle cases, 2 payload cases. Mutation checks: removing the popover acknowledgement gate failed the overload browser test; disabling the picture hold let the clock run 0.66 s during a stalled picture. The Save-and-render browser test and the CLI flag test were written after their code; the CLI accept path would fail on an unknown flag without the parser change.

Remaining: the picture sync test checks preview agreement with the sound clock, not render-versus-preview timing within one output frame (AM39 needs decoded marker comparison). Cycle choice in the graphic repair UI, nested saved-graphic split ancestry, whole-phrase caption text through the handle, exact preservation of dynamic graphic dependencies and independent page sound detection (A4/A5 of the earlier list), code-only named-element editing with native media, the A6 fixture/FAIL harness, the full visual audit and the stage acceptance audit are still open. No first-stage completion claim. No git writes or external sends.

## Handoff 4 continuation, second batch, 2026-10-08

D1. AM39/S9 render timing measured: a 25 fps take cut to a 30 fps take renders its picture cut exactly at frame 30, with the sound changing within one 30 fps frame of it, in single and two-segment renders (`tests/core/render-media.test.ts`). This verified existing behavior; no code changed for it.

D2. AM42 page sound. New contract rule `page-sound`: an `<audio>`, a `<video>` without `muted`, or `new Audio`, `AudioContext` or `speechSynthesis` in an inline script. Reported by `kinotta check` and gating Final like other contract issues; `.play()` on a timeline is not flagged. Inline markup and scripts only. Documented in the skill's `reference/contract.md`.

D3. Native caption retyping (S2). The caption handle in the media editor now opens the phrase text (double-click or Enter) and records `phrase-text` against that phrase's own placement and source range, so the other use of a repeated phrase is unchanged; Save builds both.

D4. Nested graphic split lineage. An unsaved split part now plays in the scene of its nearest saved ancestor (`borrowedScene` in `edited.ts`), not the root fragment's, so a part split from an already saved part keeps that part's scene and element offsets until Save.

D5. AM33 dependencies. The preserver now freezes every `srcset` candidate, literal loads in inline scripts (`fetch`, `new URL`, `.src =`, imports) and `.src =` in script files, and refuses a load whose path is built at runtime (a variable, a sum or a template) with a readable reason. Fixed an existing mismatch: a separate script's `fetch` resolves against the page, so it now points into `dependencies/`, while module imports stay script-relative. Code-only Save now runs `freezePageDependencies`: files the page uses from outside its version folder are copied into `dependencies/` and rewritten, files inside keep their paths, an external reference or missing outside file is refused.

D6. S10 element editing with media. The media editor passes named-element editing to the page (code-only scenes or footage graphic clips), so a code-only reel keeps click, drag, scale and arrow nudges once it has sound. Found and fixed in the shared element layer: a field typed in before (such as the playhead) kept focus and took the arrow keys meant for the selected element.

D7. A2 cycle choice in the UI. Graphics attachments offer "Attach to <voice> (pass n) at playhead" for selected-speech voices under the playhead, naming the loop pass.

D8. A6 harness. `MediaReview.verify.ts` lists six fixtures (empty, preparing, ready, playing, error, and the deliberate FAIL `inconsistent`) and seven self-contained invariants. `tests/core/render-media-verify.test.ts` drives the real editor into each state through server fixtures and routed media, runs every invariant on the live DOM, and requires the FAIL fixture to fail exactly "empty matches a zero count".

Verification:

- npm run typecheck and npm run build: exit 0 after the final edits.
- npx vitest run --project unit tests/core tests/engine tests/web --maxWorkers=4: 55 files, 557 passed, 1 skipped, exit 0, after all of D1-D8.
- npx vitest run --project render: 13 files, 84/84, 491 s, exit 0, after D2-D5 and before D6-D8. The tests added for D6-D8 then passed alone (elements 2/2, verify 1/1).
- Red evidence: page-sound test, caption retype (and a mutation removing the wiring), borrowedScene, srcset/inline-script freezing and runtime-built refusal (v2 had been published), code-only outside-folder freezing, element editing (focus bug, then a mutation removing the wiring). The harness first failed because invariants used module constants that do not exist inside the page; they are self-contained now.
