# Open plans reconciliation

Date: 2026-10-08, Asia/Manila.

Reviewed the October 7 first-stage audio/multiple-source plan and the October 5 Approve and Render plan against current source, tests, continuation handoffs and the completed October 8 Review editor. This is an acceptance review of the current working tree, not a review of a Git diff. No git writes or external sends.

## Findings and corrections

- F1: The October 7 plan's A3–A11 list and validation frontier were stale. Its later continuation and the October 8 editor supplied their implementation and most verification. The tables below reconcile the first-stage requirements. October 8 owner decisions supersede the earlier library, track and control layout.
- F2: T58 was incomplete. The skill still prohibited MP4 rendering and its footage handover described Review as a future phase. Added the shared `kinotta render` rule, retained owner-only approval, required explicit owner acceptance of overload and corrected the footage handover. The glossary already defines Approval, Render and Preset consistently with R19. No skill file references the retired compositor.
- F3: T59's design guide still called Picker unbuilt. Documented the actual merged Review approval/render popovers, queue, ready notice and finished-file player. The October 6 merge summary and October 8 audit establish the critique, audit and corrections. Existing source and full browser checks confirm the retained rendering behavior.
- F4: AM42's static page-sound check omitted separate scripts. Three new public `readVersion` regressions failed with an empty issue list before the fix. Saved-page scanning now follows readable local script sources and literal module imports within the project, handles cycles and reports sound through the existing contract issue. A quiet module cycle stays valid. A Final render regression verifies refusal before any job is queued.
- F5: The existing preview timing assertion allowed 50 ms because React's displayed clock lags the audio scheduler. Extended the test to observe actual scheduled Web Audio time and require picture agreement within 1/30 second. This passed without a playback change. Extended the decoded multi-source render test to include an actual CLI process at matching settings, alongside single and segmented renders.

## October 7 implementation steps

Paths in this table name the existing tests under `tests/core/`, unless stated otherwise. The final unit/render runs below cover them together.

| Step | Reconciled implementation and evidence |
| --- | --- |
| A1 | Existing baseline and public seams are recorded in the plan. `operation-payloads.test.ts` and shared engine/model validation matrices cover the later schema and payload audit. |
| A2 | `media-model.test.ts`, `media-split.test.ts`, `legacy-media-editing.test.ts`, `media-pins.test.ts` and `tests/engine/media-model.test.ts` establish distinct occurrences, gaps, legacy adaptation, pin carry and loop-cycle mapping. `render-media-elements.test.ts` exercises explicit cycle choice. |
| A3 | `media-library.test.ts` covers ownership, content reuse, same-name distinct content, preparation failure, reference-in-place, exact relink and project discovery. `render-media-library.test.ts` and `render-media-preview.test.ts` cover search/filter/preview, input/drop, Retry and reuse. |
| A4 | `version-media.test.ts`, `media-model.test.ts`, `media-split.test.ts` and `media-attachments.test.ts` cover edit replay, independent uses and retained/flagged attachments. `render-media-replay.test.ts` covers the visible history reset and reopen. Native lane and preview tests exercise keyboard split, snip, trim, move, duplicate, reorder and replace. |
| A5 | `media-speech.test.ts` covers cached source transcription, Retry and frozen words. Model/attachment tests cover alternate speech and continuous section parts. Browser caption/pin/preview tests cover occurrence-specific editing, caption retyping, broken graphic repair and generated graphic seeking. |
| A6 | `version-media.test.ts`, `graphic-media-save.test.ts`, `code-media-save.test.ts`, `snip-save.test.ts` and `save-review-fixes.test.ts` cover frozen content/dependencies, missing media, failed publication/build and journal recovery. `render-media-verify.test.ts` covers the six state fixtures and deliberate FAIL invariant. Nested saved-graphic ancestry is covered by the edited-preview tests. |
| A7 | `media-audio.test.ts`, `media-waveform.test.ts`, `media-overload.test.ts` and `media-tracks.test.ts` cover common envelopes, loops, proportional fades, waveform readiness, mute, Solo and overload. Browser speaker tests measure pending/saved levels and silence after Pause. Decoded track renders compare the evaluator to output samples. |
| A8 | `render-media.test.ts` covers distinct takes, gaps, product pictures, continued sound, still duration/framing and mixed frame rates. Model and engine tests cover speech/captions under inserts. Preview checks exercise independent framing, picture stalls and Retry. |
| A9 | October 8's native lanes, Clip panel, library, toolbar and Settings supersede the old separate editor. `render-native-lanes.test.ts`, `render-editorial-lanes.test.ts`, `render-review-shell.test.ts` and the preview/library tests cover controls, keyboard use, optional snap, themes and bounded widths. Network calls remain in `web/src/api/`. |
| A10 | `render-save.test.ts`, `render-overload.test.ts`, `render-queue.test.ts`, `render-segments.test.ts` and the CLI tests cover explicit render base, refused Save, overload choice, cancellation and failure. The decoded multi-source test now compares CLI/single/segmented output at matching settings. |
| A11 | S1–S12 are mapped below. Actual browser audio, decoded FFmpeg output, engine checks, legacy/e2e flows and the existing populated visual audit supply acceptance evidence. This is synthetic, reproducible workflow coverage, not an assertion that a customer's production reel was manually completed. |

## First-stage scenario audit

The final ledger in `docs/2026-10-07-audio-multiple-sources-grilling-decisions.md` is authoritative. Recording portions of S11 belong to the later stage.

| Scenario | Evidence and boundary |
| --- | --- |
| S1 | Model, version and pin tests separate A/B placements at equal source timestamps. Native browser frame/word pins retain distinct targets through split and Save. |
| S2 | Repeated-placement tests retain independent edits, caption positions and feedback. `render-media-captions.test.ts` retypes one repeated phrase through its handle and saves without changing the other. |
| S3 | Insert mapping/render checks retain underlying speech, default product mute and independent levels. Alternate speech is tested in both model engines. AM42 page sound is reported for conversion into the shared mix, including local script modules after F4. |
| S4 | Sequence edits close snips while reel-time music continues. Follow-footage attachments move with their named occurrence or remain flagged after removal. Added audio is clipped at the new reel end. |
| S5 | Model and decoded render checks cover image duration, gaps and silent spans. Selected voiceover supplies words without inventing captions for silent spans. |
| S6 | Frozen media/dependency tests preserve earlier version bytes after source changes, enforce exact relink, refuse replacement as relink and retain authored code-only pages. Browser checks show legacy limits and explicit render-base choice. |
| S7 | Existing handoff/Save checks block publication while a batch is out. Replay retains targeted operations, flags removed targets and starts fresh Undo/Redo with a visible notice. Reopen preserves ordinary history and Discard retains imported library media. |
| S8 | Browser speaker checks cover unsaved gain, seek and Pause. The strict scheduled-clock assertion verifies preview within one 30 fps frame. Decoded whole-reel sound is compared across single, segmented and CLI output without added segment joins. Loop and ramp seek states are also tested in the evaluator. |
| S9 | Decoded crop/Fit and mixed-rate checks verify one fixed canvas and natural source speed. Picture cuts at frame 30 and sound changes within one 30 fps output frame, for single and segmented renders. |
| S10 | Legacy and code-only read/edit/Save checks preserve compatibility and honest limitations. Named-element editing still works after adding shared sound. The page-sound contract identifies supported static sound constructs for conversion to the shared mix. |
| S11 | Preparation, missing-file, failed build/Save, recovery and Save-and-render tests retain prior versions/edits and refuse readiness. Queue tests verify cancelled/failed output is not published. Recording is outside this first-stage plan. |
| S12 | Gain/ramp/fade matrices and actual overload measurement cover twice-recorded level and proportional short fades. UI and CLI require explicit overload acceptance. The mix is not normalized. Codec clipping behavior remains a stated limit below. |

## October 5 remaining tickets

| Ticket | Closure evidence |
| --- | --- |
| T58 | Corrected `skill/kinotta/SKILL.md`. `CONTEXT.md` already has the three required definitions. Repository skill search finds no retired compositor reference. Agent track authoring remains deferred under the October 8 decision. |
| T59 | October 6 merge summary records the live critique/detector audit and fixes, with 110 passing browser tests. October 8's audit records subsequent P1/P2 corrections and twenty populated viewport/theme/rail states. `DESIGN.md` now records the retained merged components. This run independently repeats the full 110-check browser suite. |

## Verification

- V1: `npm run typecheck` passed after the final code/test edits, exit 0.
- V2: `npm run build` passed, exit 0. Subsequent production edits affect server-side contract checking only.
- V3: `npx vitest run --project unit --maxWorkers=4` passed 58 files, 595 tests and one existing skip, exit 0, 51.81 seconds, after the contract change.
- V4: `npx playwright test --workers=1 --reporter=line` passed all 110 checks, exit 0, 4.6 minutes. Servers started before F4. UI files did not change during this review. New F4 regressions are verified through the public core and render gate.
- V5: `npx vitest run --project render tests/core/render-media-sync.test.ts -t 'keeps the picture on the sound clock'` passed the strengthened real scheduled-clock check, exit 0, 5.22 seconds. This is a focused check, not a six-test suite claim.
- V6: `npx vitest run --project render` passed 23 files and all 100 tests, exit 0, 725.77 seconds. This final run includes the new Final refusal, strict scheduled-clock assertion and decoded CLI/single/segmented parity check.

Both reviewed plans are now Done, and T58/T59 are checked off. The plan dashboard was regenerated with its existing script after the status changes. Earlier unfinished lists are historical handoffs, superseded by this acceptance reconciliation.

## Limits and later work

- R1: Page-sound scanning is static. It follows readable local files and literal imports, without executing scripts or fetching remote code. Runtime-generated code, obfuscated calls and remote scripts are not a complete sound certification. Missing files and unsupported dynamic dependency loads have their separate preservation/readiness checks.
- R2: The one-frame measurements cover the generated 30 fps fixtures, browser source scheduling and decoded output. They do not measure sound-device latency or guarantee every hardware/codec combination. Existing 5.1 downmix differences and AAC overload clip avoidance remain documented in the October 7 continuation.
- R3: The existing visual audit covers the twenty measured chrome states. It excludes authored iframe artwork, disabled/hidden text and complete touch or assistive-technology certification. No visual behavior changed in this review.
- R4: In-app recording, free layout/split screen/overlapping regions and agent support for tracks remain later work. AM37 exclusions and library folders/tags remain deferred. None is a remaining item in the first-stage implementation plan.

## Deviations

Acceptance review uses the latest working tree and later owner decisions rather than a fixed Git comparison. The new contract regressions were run failing before their implementation. Render-gate and timing/CLI extensions strengthen existing acceptance evidence and were added after the behavior existed. No playback or rendering algorithm was changed by this review.
