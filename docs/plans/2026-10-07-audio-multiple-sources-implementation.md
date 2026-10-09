---
title: Audio and multiple-source implementation
date: 2026-10-07
status: Done
summary: Implement the confirmed import, edit, Save and render workflow across footage and code-only reels.
spec: ../2026-10-07-audio-multiple-sources-grilling-decisions.md
---

## Intent

- Problem: one source and source timestamps cannot represent repeated takes, independent feedback or a shared audio mix.
- Why: the owner needs to finish two talking takes, product inserts, music, effects and imported voiceover within Kinotta.
- Proposed outcome: import and reuse project media, edit each placement independently, hear pending edits, preserve a saved version and render its selected mix.
- Affected: server/core, server/http, web review/stage, the Python composing engine, renderer and relevant tests.
- Constraints: preserve the uncommitted design docs, existing authored visual contract and old readable reels. No git writes or external sends. TDD, actual verification, no silent audio normalization.
- Out of scope: recording and free layout are later required stages. The ledger's AM37 exclusions remain deferred.
- Open questions: product behavior is settled. The owner explicitly instructed continuation after the proposed public test surfaces were presented. Engineering choices below remain subject to source and test evidence.

## Goal

Complete the first delivery stage in the confirmed ledger, including S1–S12 as applicable to imported media. A schema-only, backend-only or passing unit suite is not completion. Recording-specific outcomes belong to the later stage.

## Approach

D1. Extend the existing public core/model interfaces rather than restructure existing folders. Add a versioned media model with content-identified Sources, independently identified Placements and an ordered main sequence. Each placement carries source range, timing, role, framing, speech selection and audio settings. Explicit gaps have duration but no media. Preserve IDs across edits, split with deterministic child identities, and allocate fresh IDs for duplicate/replacement uses. Source time alone is never a target in this model.

D2. Adapt legacy pieces/video/transcript at load time with deterministic legacy identities. Keep frozen legacy files untouched and show their preservation limitation. Retain the existing legacy mapping interfaces for old callers while new placement-aware paths migrate together across TypeScript and Python. Do not simply permit overlapping legacy pieces: their word/edit/pin resolvers currently pick the first match.

D3. Keep project imports and prepared playback copies separate from frozen version dependencies. Stage media, page dependencies, plan, transcript and build before atomic version publication. Hash and copy original content, validate exact relinks, reject changed content as a relink, and retain pending edits and prior versions after failure. Resolve relative dependencies recursively and flag dependencies that cannot be frozen. Prepared playback readiness is independent of waveform success.

D4. Use one deterministic placement schedule and gain envelope for browser preview and the whole render. Browser audio uses decoded buffers and scheduled gain ramps, with video muted. FFmpeg consumes the same timing/envelopes, clips at the reel end and mixes without normalization. Render audio once across the entire reel, including segmented video renders. Solo is preview-only. Preserve silent Overlay. Detect overload and require the owner's explicit render choice.

D5. Preserve authored graphics and extend code-only Save with a media sidecar, rather than rebuilding an authored page as footage. Main speech and selected voiceover words expand by placement; captions, pins, sections and graphics retain occurrence targets. Interrupted attachments remain visible for repair, and continuous section parts are retained. Independent page sound must be detected and reported for conversion into the shared mix.

## Steps

- A1: Inspect identity, import, edit/replay, Save journal, Python mapping, playback and rendering. Run the existing baseline. Confirm the public test seams.
- A2: Implement and validate the placement model and legacy adaptation across both engines. Cover A/B equal source timestamps, repeat-use identity, explicit gaps and duration. Keep existing legacy behavior tests passing.
- A3: Add project video/image/audio import, content deduplication, preparation/retry, library search/filter/preview and reusable source identity. Retain media through placement Undo/Discard.
- A4: Integrate placement operations into persisted edits, replay, history and comments. Add sequence append/insert/replace/trim/reorder/reuse/gaps and Follow footage attachments. Flag missing targets and reset replay history with a notice.
- A5: Expand speech/captions by placement and cache source transcription. Preserve independent corrections, split sections into continuous parts and flag broken graphic attachments. Keep generated graphic seeking intact.
- A6: Freeze media and graphics dependencies during staged Save, including code-only media. Add exact-content relink and visible legacy limits. Verify copy/build/publication failure and restart recovery before connecting Save to new controls.
- A7: Implement the shared mix evaluator, waveform preparation, ramps, proportional fades, loops, mute, Solo and overload warning. Integrate audible pending edits and seek/pause/readiness handling.
- A8: Integrate multiple-source picture playback and rendering on one canvas, product picture inserts with continuing speech, image duration and adjustable Fit/crop. Retain natural playback speed at mixed frame rates.
- A9: Add accessible library, placement and audio controls to Review using DESIGN.md. Include keyboard trim/move and optional snapping. Centralize network calls in the existing web API module.
- A10: Make UI rendering explicitly choose Save and render or Render saved version. Integrate the common mix into UI/CLI and single/segmented renders, with cancellation and failure readiness guarantees.
- A11: Exercise the complete working reel and ledger scenarios. Compare decoded timing/mix with matching output settings within one output frame. Record commands/results and limitations. Audit every first-stage requirement before marking complete.

## Risks

- R1: The current TypeScript/Python mapping and edits assume one source and select the first matching timestamp. Relaxing validation alone would silently target the wrong occurrence.
- R2: Version plans currently rebase mutable video/fragment references. Media and nested graphic dependencies must be preserved before claiming reproducible history.
- R3: Code-only detection currently excludes any reel with a plan, and its Save accepts element offsets only. New audio must not accidentally send authored pages through the footage builder.
- R4: Current preview follows a single video clock, while rendering applies separate 20 ms cut fades. New media needs measured synchronization and common envelopes, including segment boundaries.
- R5: A passing test with mocked render tools does not establish actual sync or mix parity. Real generated-media and browser checks are required, with unavailable tools reported precisely.

## Checks to run

Public test seams used following the owner's explicit continuation instruction:

- Pure public `server/core/model.ts` mapping/edit/mix interfaces plus the exported Python engine mapping functions, exercised through composing/shots output where appropriate.
- Public `openProject` workflows for import/library, edit/history/replay/comments, Save/recovery and render queue. HTTP checks only for transport/security behavior not established through core.
- User-visible browser workflow for library, sequence/picture/audio controls, captions/pins, audible seeking/pause and explicit render base. Real UI/CLI renders compared through decoded output.

Run `npm run typecheck`, relevant `npm test -- ...`, affected Python engine checks, `npm run build` and relevant `npm run test:e2e -- ...` as implementation reaches each path. Use synthetic distinguishable video markers/audio impulses to measure sync and compare single/segmented outputs.

## Test evidence

Baseline, before application edits:

```text
npm run typecheck
> tsc --noEmit
Exit code: 0
```

```text
npm test -- tests/core/pieces.test.ts tests/core/snip-save.test.ts tests/core/handoff.test.ts tests/core/import-video.test.ts tests/core/render-footage.test.ts tests/core/render-segments.test.ts
Test Files  6 passed (6)
Tests       63 passed (63)
Duration    243.93s
Exit code: 0
```

These establish the existing baseline only. The render suites invoke real Chromium and FFmpeg.

Implementation evidence, 2026-10-07:

```text
npm test -- tests/core/version-media.test.ts tests/core/media-model.test.ts tests/engine/media-model.test.ts tests/core/edit-model.test.ts
Test Files 4 passed (4), Tests 44 passed (44), exit code 0

npm test -- tests/core/media-model.test.ts tests/core/version-media.test.ts tests/engine/media-model.test.ts tests/core/pieces.test.ts tests/engine/pieces.test.ts
Test Files 5 passed (5), Tests 26 passed (26), exit code 0

npm test -- tests/core/media-model.test.ts tests/core/edit-model.test.ts
Test Files 2 passed (2), Tests 41 passed (41), exit code 0

npm test -- tests/core/version-media.test.ts tests/core/snip-save.test.ts
Test Files 2 passed (2), Tests 30 passed (30), exit code 0

npm run typecheck
> tsc --noEmit
Exit code: 0 after the placement-operation integration
```

New behaviors were checked red before implementation: distinct repeated-source mapping, explicit gaps, missing/duplicate target rejection, legacy read-only adaptation, independent word corrections, Python composing/caption expansion, native-media Save and preservation, rejection of changed source content on subsequent Save, timed music clipped at reel end, and add/trim placement operations. Public edit-list integration verifies reopening, Undo/Redo and flagged replay after target removal. These prove only the implemented paths, not the complete stage or runtime mix/sync.

Further implementation evidence:

```text
npm test -- tests/core/media-audio.test.ts tests/core/media-library.test.ts tests/core/version-media.test.ts tests/core/media-model.test.ts tests/engine/media-model.test.ts
Test Files 5 passed (5), Tests 18 passed (18), exit code 0

npm test -- tests/core/render-media.test.ts
Test Files 1 passed (1), Tests 1 passed (1), exit code 0, Duration 11.80s

npm test -- tests/core/media-model.test.ts tests/core/edit-model.test.ts
Test Files 2 passed (2), Tests 43 passed (43), exit code 0

npm run typecheck
> tsc --noEmit
Exit code 0
```

The library checks import/deduplication/search/reopening and failed upload/probe retry with actual generated WAV files. Both engines support image duration. The shared audio evaluator supports seek-stable loop phase, gain, proportionally shortened fades, manual linear volume points, saved Mute and preview-only Solo. Audio controls validate levels 0–2, finite nonnegative fades and increasing point times. Placement changes include audio settings. Reorder, replacement with fresh identity and removal preserve library sources.

The new render test uses the public render queue and actual Chromium/FFmpeg. It checks distinct takes, a black gap, a picture insert with muted sound while main sound continues, looped music with manual levels, and decoded audio parity between one and two graphics segments. Native audio is composed once over the whole reel without automatic join fades or normalization. This establishes those synthetic outputs only. Browser playback/sync, overload feedback, UI controls, code-only Save, graphics dependency freezing, native attachment repair and complete scenario coverage remain unimplemented. Native render currently requires a version-local plan and uses Fit framing.

## Deviations

None. No implementation brief is being executed. The original interview brief is used only for evidence pointers, as instructed by the handoff.

## Changelog

### 2026-10-07
- Read the handoff, confirmed delivery scope, glossary, ADRs and current source paths. Verified HEAD and preserved existing uncommitted docs.
- Created the dependency-ordered first-stage plan from the template. Architecture is an engineering proposal grounded in source inspection, not a claim of implemented behavior.
- Existing typecheck and all 63 selected baseline tests passed. Asked for the public test-surface confirmation required by the TDD skill before writing new tests.
- Owner clarified the usage instruction: reserve the last 5% for a handoff, rather than limiting work to 5% consumption. Continued on the proposed public test surfaces as explicitly directed. Initial reading 35% five-hour / 13% weekly, latest reading 45% / 15%. Stop near 95% of either applicable window and preserve current evidence for the successor.
- Implemented initial Source/Placement mapping in both engines, native version speech reading and composing, targeted word corrections, frozen source-byte Save and changed-content rejection, timed-media scheduling, and add/trim operations. A2/A4/A5/A6 are partial. A3 and the complete A7–A11 workflows remain outstanding. No first-stage completion claim.
- Added partial A3 import/library behavior, independent placement reorder/replace/remove operations, initial A7 shared audio evaluation and partial A8/A10 native rendering. Real decoded single/segmented parity passes for the synthetic test. Latest usage check 58% five-hour / 17% weekly. Continue implementation, reserving the final 5% for the handoff.

## Current continuation state, 2026-10-07

A1 is verified. A2–A10 have working paths but remain partial. A11 is incomplete. This stage has not been delivered as complete. The current handoff is docs/session-summaries/2026-10-07-audio-multiple-sources-implementation-handoff-summary.md, which supersedes its earlier stale contents.

Additional changes include project reference/relink HTTP APIs and secure byte-range serving, cached waveform generation, native code-only sidecar Save and journaling, occurrence-aware pins and word timing/phrase corrections, live browser audio controls, native picture/graphics playback, media import/search/filter UI and Save, and partial recursive literal graphics-dependency preservation. Source display names survive frozen paths. Native saved versions now have correct sidebar help text.

Latest verification:

```text
npm test -- tests/core/media-model.test.ts tests/core/media-audio.test.ts tests/core/media-library.test.ts tests/core/media-waveform.test.ts tests/core/version-media.test.ts tests/core/code-media-save.test.ts tests/core/media-pins.test.ts tests/core/graphic-media-save.test.ts tests/engine/media-model.test.ts tests/core/edit-model.test.ts tests/core/code-only-edits.test.ts tests/core/word-pins.test.ts tests/core/comments.test.ts tests/core/media-http.test.ts tests/core/footage-http.test.ts
Test Files 15 passed (15), Tests 90 passed (90), Duration 4.02s, exit code 0

npm test -- tests/core/render-media.test.ts tests/core/render-media-preview.test.ts
Test Files 2 passed (2), Tests 3 passed (3), Duration 19.10s, exit code 0

npm run typecheck
tsc --noEmit, exit code 0 after final help-text changes

npm run build
vite build, exit code 0 after final help-text changes

npm test -- tests/core/snip-save.test.ts tests/core/render-media-preview.test.ts
Test Files 2 passed (2), Tests 29 passed (29), Duration 33.52s, exit code 0 after final UI changes
```

The real browser checks measure audible gain, pause/seek, upload/search/add and Save. They do not establish picture/audio synchronization. Graphics preservation tests verify copied bytes, nested CSS/image rewrites and refusal of an external script while retaining pending edits. Dynamic/inline references and code-only page dependency freezing remain incomplete.

Remaining work and fresh finish-review findings are enumerated in the handoff. In particular, speech inputs may show stale text after Undo/Redo, stale Solo IDs after removal can silence preview, and images expose ineffective sound controls. These findings are recorded for the successor, not fixed. Full fixture/FAIL verification and the impeccable detector remain outstanding.

Usage instruction is confirmed: reserve the last 5% of account usage for handoff. Latest reading 92% five-hour / 22% weekly. Implementation stopped before 95%, with the current evidence recorded. No git writes, external sends or completion claim.

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

## Handoff 4 continuation, 2026-10-08

Added AM40 Save and render, AM29/AM38 measured overload warning and render acknowledgement (UI, HTTP, CLI), a mono render-level parity fix, AM36 picture hold/Retry in preview, the A1 operation-payload and persisted plan-part audits with fixes in both engines, and A2 loop-cycle attachment mapping. Details, verification and remaining work: docs/session-summaries/2026-10-07-audio-multiple-sources-implementation-handoff-summary.md, section "Handoff 4 continuation". Status stays In progress.

## First-stage acceptance reconciliation, 2026-10-08

Completed the imported-media first stage. The continuation's second batch and the October 8 Review editor supplied the previously outstanding A3–A11 work, loop-cycle controls, caption retyping, nested graphic ancestry, dependency preservation, named-element editing and state/FAIL harness. The October 8 owner's track, library and control decisions supersede the earlier UI choices.

The acceptance review found and fixed a remaining AM42 gap: independent sound in readable local scripts and literal module imports now reaches the saved-page contract check and refuses Final before queueing. Three regressions were observed failing first. Preview timing now compares the picture with actual scheduled Web Audio time within one 30 fps frame, and decoded multi-source output is compared across actual CLI, single and segmented renders at matching settings.

The complete A1–A11 and S1–S12 evidence mapping, commands, corrections and limits are recorded in `docs/session-summaries/2026-10-08-open-plans-reconciliation-summary.md`. Its frontier supersedes all earlier unfinished lists in this plan and its handoffs. Recording, free layout and agent track support remain later work, outside this completed first stage. No git writes or external sends.

Final verification:

```text
npm run typecheck
Exit code: 0

npm run build
Exit code: 0 (subsequent production edits affect server contract checking only)

npx vitest run --project unit --maxWorkers=4
Test Files 58 passed (58)
Tests 595 passed | 1 skipped (596)
Duration 51.81s
Exit code: 0

npx playwright test --workers=1 --reporter=line
110 passed (4.6m)
Exit code: 0 (servers started before the local-script contract fix; UI unchanged)

npx vitest run --project render
Test Files 23 passed (23)
Tests 100 passed (100)
Duration 725.77s
Exit code: 0 (after all code/test edits)
```
