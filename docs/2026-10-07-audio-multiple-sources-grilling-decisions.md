# Audio and multiple-source editing design session

Started: 2026-10-07, Asia/Manila. This is a docs-only owner interview for audio controls and multiple-source editing. Recommendations are not decisions.

Status: design session complete. On 2026-10-07 the owner confirmed the final shared-understanding recap: "that works". No application implementation, tickets, dependency installation, external sends or git writes authorized by this session.

## Decision ledger

| ID | Decision | Depends on | State | Answer or evidence |
| --- | --- | --- | --- | --- |
| Q1 | First complete job | — | settled | AM1: Owner said "let's go with that" after the proposed running example. Interpreted explicitly in chat as two talking takes + product insert + background music. The exact current external-editor steps were not supplied; current capability gaps have static evidence below. This selects an example, not a release scope. |
| Q2 | Range of reels for first audio release | — | settled | Owner: audio must work with both footage and code-only reels. Existing intent values both equally (F1). AM12 settles staged delivery. |
| Q3 | Immediate role of the media library | — | settled | Owner: media is shared within one project. This extends the existing project-owned footage model, not a cross-project library. |
| A1 | Required audio roles | Q1, Q2 | settled | AM2: original speech, music, sound effects, imported voiceover and voiceover recording inside Kinotta are required. Owner rejected limiting the workflow to speech + music. |
| A1R | Voiceover recording modes | A1, Q3 | settled | AM7: both recording while watching the reel and standalone recording. Capture details remain in A1R2. |
| A1R2 | Recording capture and take handling | A1R, A1F | settled | AM11: record to picture at the playhead, optional reel audio during capture, audition before Keep or Retake; standalone recordings enter the project library. |
| A1R3 | Recording controls and recovery | A1R2 | settled | AM16: microphone choice, optional countdown, preserve completed earlier takes until explicitly discarded; show permission/interruption errors. No partial-capture recovery guarantee accepted. |
| A1F | Existing recording capabilities | A1 | settled | Static investigation found no microphone capture or independent audio transport in inspected paths. Current import probes for a video stream and rejects audio-only media. No runtime guarantee established. |
| A2 | Direct sound editing and overlap | A1 | settled | AM4: owner answered Q6 "yes" to preview, trim, move, duplicate, remove and concurrent sounds. Addition was already required by A1. |
| A3 | Audio attachment behavior | A2, M4 | settled | AM13: original sound follows its take; music continuous on reel time; added media offers Follow footage or Stay at time, default Stay. Removed followed moments flag their items for resolution. |
| A4 | Gain, fades and duration behavior | A3 | settled | AM18: per-placement volume/mute and start/end fades, optional music looping; all audio stops at reel end. AM23/AM38 settle manual ramps and proportional short-item fade limits. |
| A5 | Ducking | A4 | settled | AM23: manual volume changes over passages first. Automatic ducking deferred, does not block the first slice. |
| A6 | Waveform and controls | A2, A4 | settled | AM24: waveforms, keyboard trim/move and optional snapping to cuts/playhead. AM29/AM36 settle monitoring and loading/failure behavior. |
| A7 | Audio preview contract | A3–A5 | settled | AM29: immediate unsaved audio edits, consistent seek/pause and same rendered mix; mute exported, Solo preview-only, overload warning. Supersedes R9's no-preview-fades exception. |
| A8 | Audio render and history | A7, X3 | settled | AM35: Draft/Final selected mix for both reel types; Overlay silent/transparent; segmented render same mix; failed/cancelled output not ready. AM40 settles unsaved-render choice. |
| A4D | Volume/fade control limits | A4, A5, A7 | settled | AM38: silence to twice recorded level, manual smooth ramps; overlapping fades shortened proportionally to fit; warn on overload, owner may still render without silent level changes. |
| M1 | Required media types | Q1, Q3 | settled | AM3: video and still images are both required for the product insert, alongside audio required by AM2. Owner's "for 15 both" was interpreted explicitly in chat as answering Q5. |
| M2 | Media-library import and reuse | M1 | settled | AM5 ownership, AM10 controls, AM15 drop/selection, identical-content reuse, distinct same-name content preservation and failed-import retry. Folders/tags deferred. |
| M3 | Required picture arrangement | Q1, M1 | settled | AM6 sequential takes/product inserts; AM21 free layout; AM28 overlapping regions. |
| M3P | Picture-in-picture scope | M3 | settled | AM28 supersedes AM9's inset deferral: overlapping freely arranged regions include picture-in-picture in the later layout stage. |
| M3S | Split-screen layout controls | M3, M7 | settled | AM21: chosen preview C, arbitrary custom regions with several sources and independent timing/framing. AM28 settles overlap/stacking. |
| M3O | Free-layout overlap and stacking | M3S | settled | AM28: overlapping picture regions with front/back order. |
| M4 | Source placement editing | M3 | settled | AM8: append, insert, replace, trim, reorder and reuse; later main takes move earlier when a take shortens. Attachment behavior remains A3. |
| M4G | Deliberate empty gaps | M4, X2 | settled | AM26: intentional gaps allowed; blank canvas unless other picture covers it; added music/voiceover follows placements. Normal snips still close sequence. |
| M5 | Source and occurrence identity | M4 | settled | AM14: each repeated use independently targetable for edits, volume, captions and pins. Underlying media is Source; each timed use is Placement. |
| M6 | Speech, captions and generated clips | M3–M5 | settled | AM22 speech selection; AM30 transcribe when first used as speech, reuse timed words, omit silent-span captions, split sections into continuous parts, graphics follow surviving words/flag broken attachments. |
| M7 | Mixed-media canvas behavior | M1, M3 | settled | AM9 framing plus AM17: one canvas, natural video speed despite different frame rates, adjustable photo duration; retain existing canvas or initialize from first main video. Initial photo duration remains a control default, not a fixed requirement. |
| M8 | Media ownership and historical versions | M2 | settled | AM19: saved versions preserve exact media content despite disk cost. Reel/library removal preserves saved versions and leaves disk files alone. AM25/AM31/AM33 settle relink/replacement, legacy and graphic dependencies. |
| M9 | Multiple-source playback and rendering | M3–M8 | settled | AM36: preparing/retry states, pause if required media cannot keep up; block Save/Final for missing/unpreservable required media; relink/retry; waveform failure alone doesn't block playable media. Current original/playback-copy distinction stays. |
| X1 | First release slice | A1, M1, M3 | settled | AM12: design together, deliver complete import/edit/render first; recording and free layout follow. First slice includes original speech, music, imported effects/voiceover, sequential takes and product video/photo inserts for both reel types. Final acceptance scenarios are specified below. |
| X2 | Timing and identity model | A3, M5 | settled | AM20: comments/edits follow specific placements; removed moments retain flagged feedback; resolve/discard missing edit targets before Save. Replacement media has a new identity. Extends E8/E5/E15. M6 still owns speech/caption selection. |
| X3 | Version and ownership guarantee | X2, M8 | settled | AM25: exact-content relink, different content treated as replacement, failed Save preserves previous version/pending edits, readiness only after complete build/media. Legacy and edit-list details remain X3L/X3E. |
| X3L | Legacy media/history behavior | X3 | settled | AM31: old reels readable with explicit unpreserved-media limits, exact-original relink, no silent substitution. |
| X3E | Undo, reload and Save lifecycle | X3 | settled | AM32: pending edits/undo/redo restored after reopen; Discard retains media; complete successful Save publishes new version; handoff blocks Save. |
| X3U | Undo history after agent replay | X3E | settled | AM34: retain replayed edits, start fresh Undo/Redo with clear notice. Reopen alone preserves history. |
| X2L | Clip/Piece/Placement vocabulary | M5, X2 | settled | AM27: Source underlying media; Placement each use; Piece main-video stretch; Clip generated graphic. Narrows old broad Clip definition in CONTEXT.md. |
| RF2 | Identity/history feasibility facts | X2, X3 | settled | Static findings below: shared source-time targets, first-match words, longest-run graphics/sections, media not frozen, staged/journaled footage Save, separate code-only edit path. No runtime results claimed. |
| X3A | Referenced graphic media preservation | X3 | settled | AM33: preserve local images/fonts and dependencies used by generated graphics; flag external dependencies that cannot be frozen. Authored timing/element contract remains. |
| X4 | Preview and render agreement | A7, M9 | settled | AM39: within one output frame, stable fades/loops after seek, no sound after pause, same mix across editor/CLI and single/segmented renders. Acceptance target, not a runtime result. |
| X4R | Render with pending edits | A8, X3E | settled | AM40: explicit Save and render or Render saved version. Failed/blocked Save does not start Save-and-render output. |
| X4D | Reel end and longer added media | A8, M9, M4G | settled | AM41: main sequence sets footage duration, authored duration sets code-only duration; additions stop at end, extension is deliberate. |
| X4A | Audio authored inside graphics | A8, M9, X3A | settled | AM42: agent-authored sound joins common audio controls/mix; independent page audio excluded from new model. Visual technique remains free. ADR 0005 narrows ADR 0001's audio allowance. |
| X5 | Scope boundary | X1 | settled | AM37: explicit Q40 exclusions, existing authored graphics allowed, recording/free layout remain later required, folders/tags remain deferred. Final closure awaits CONF only. |
| CONF | Final shared-understanding confirmation | all A/M/X choices, S1–S12 audit | settled | AM43: owner confirmed the final recap with "that works" on 2026-10-07. Design session closed; implementation requires a separate request. |

## Evidence checked

- The workspace is at `43d2fb1dd49beb3df52e9fddbf0ad57513588556`, the commit named by the handoff. The handoff is the only untracked material.
- `server/core/_internal/footage.ts` exposes one footage reference for a reel; `server/core/_internal/pieces.ts` defines pieces only by source-time range.
- `server/core/_internal/edit-model.ts` has no first-class audio-placement, gain or fade operation.
- `web/src/review/_internal/usePlayback.ts` takes one HTML video element; `server/core/_internal/runner.ts` applies only the existing smooth or hard cut audio treatment.
- Verified detail: Smooth is a fixed 20 ms fade around internal source-audio joins at render time. Review preview has no equivalent fade or mixing path.
- Verified detail: dropped video is copied, hashed and deduplicated under project `footage/`; the picker discovers project videos. Neither path is a typed still-image or audio library.
- Verified detail: source-time mapping drives comments, words, captions and replay. Repeated or multiple source uses need an explicit identity rule before those capabilities can be extended.

## Current frontier

The frontier is empty. Owner accepted Q39/Q42–Q44 and confirmed the final recap with "that works". No session questions remain. Acceptance scenarios are specified, not executed. Future implementation uses the agreed handoff without re-interviewing settled choices.

## Accepted decisions

**AM1 — Working reel:** two talking takes, a product insert and background music. Owner answer: "let's go with that", interpreted explicitly in chat as accepting the proposed example. This supplies a concrete job for A1 and M1 without superseding any existing product decision. Source pointers: `footage.ts/readReelFootage`, `pieces.ts/Piece`, and `edit-model.ts/Operation` show the current single-source and audio-editing gaps. Acceptance candidate: finish this example within Kinotta and render it; detailed outcomes remain open.

**AM2 — Required audio roles:** owner requested sound effects, imported voiceover and recording voiceover inside Kinotta in addition to the working reel's speech and music. This supersedes the round 2 recommendation of speech + music only, which was never accepted. It opens A2 and the new recording branch A1R. Acceptance candidates include importing an effect and a voiceover, and recording a voiceover inside Kinotta; capture and edit outcomes remain open. Existing `edit-model.ts/Operation` has no first-class audio placement controls, so this describes desired behavior, not shipped capability.

**AM3 — Required media types:** both video and still images for product inserts, plus audio for AM2. Owner answer: "for 15 both", interpreted explicitly as Q5. This opens M2 and M3 without choosing layering or placement behavior. Acceptance candidates include using a product video and a product photo; their duration and fit remain open. Current `import.ts/importVideo` is video-specific.

**AM4 — Direct sound edits and overlap:** owner answered "q6 yes". Preview, trim, move, duplicate and remove added sounds directly; several sounds can play together. Rationale: permits speech, music and effects to coexist. Opens A3 once M4 settles. Acceptance candidate: move one effect while music and speech continue, then duplicate or remove that effect without changing the others. Gain, original-sound attachment and export semantics remain open.

**AM5 — Import ownership:** owner accepted the Q7 recommendation. Copy files imported from outside the project into it; reference files already in the project. Matches ADR 0002's video ownership direction and extends it to the required media types. Opens historical-media questions once other M2 choices settle. Acceptance candidates: import an outside audio file and select an existing project photo. Removal, changed content and frozen-version protection remain open.

**AM6 — Picture arrangements:** owner requested "product inserts and a split screen". Sequential takes from AM1 remain required. Product inserts with continuing speech and split screen are included; picture-in-picture is undecided. This rejects the recommendation to defer split screen and opens M4 and M7. Acceptance candidates: show a product over a continuing sentence and two sources side by side. Audio/caption source, layout controls and placement timing remain open.

**AM7 — Recording modes:** owner answered "q9 Both". Record while watching the reel and record separately. Opens A1R2. Acceptance candidates: narrate a visible passage and capture narration without reel playback. Placement, monitoring, retakes and recovery remain open. Static evidence confirms this requires new capture and audio handling, not an existing recording feature.

**Round 4 answer:** owner said "yes alll". Interpreted explicitly in chat as accepting all recommendations presented in the final response, including their deferrals. Recommendations found only in the internal ledger and omitted from that response are not owner decisions.

**AM8 — Main-sequence editing:** all Q10 actions and repeated uses are supported. Shortening a main take moves later main takes earlier. Opens A3/M5; explicit gap insertion is still open. Acceptance candidate: shorten A and B starts earlier without editing the media file. Existing E8's single-source assumption must be extended; attachment and identity decisions remain pending.

**AM9 — Framing and inset scope:** fill by cropping is the default, with Fit and adjustable framing available. Movable picture-in-picture is deferred; split screen remains required in the later stage. Opens remaining M7 choices. Acceptance candidate: choose Fit for a portrait source in a landscape region. No automatic reframing or new aspect-ratio deliverables were approved.

**AM10 — Library controls:** name search, media-type filters, previews and reuse across project reels. Folders/tags deferred without blocking the first slice. Opens remaining M2 import details. Acceptance candidate: find and preview an effect, then use it in another reel in the same project.

**AM11 — Recording flow:** timed recording starts at the playhead, with reel audio optionally audible; audition before Keep or Retake. Standalone recordings enter the project library. Opens A1R3. Acceptance candidate: record against a passage, audition, then choose Keep. Recording monitoring is not yet an export mute policy.

**AM12 — Delivery order:** complete importing, editing and rendering first; recording and split screen follow. Both remain part of the design. This settles the first-stage boundary without granting implementation permission. Acceptance candidate: assemble the working example with imported sounds, Save and render before adding in-app recording/split screen. Detailed preview, history and failure guarantees remain unsettled.

**Round 5 answer:** owner supplied five "yes" answers, one for each of Q15–Q19. Only recommendations actually presented in chat are accepted.

**AM13 — Attachment behavior:** original sound follows its take; music continues on reel time. Added audio and picture items offer Follow footage or Stay at time, with Stay at time the default. Removing a followed moment preserves and flags the item for resolution. Opens A4/X2. S4 candidate: snip five seconds without removing five seconds of music; a removed attached effect is flagged. Save/replay blocking and replacement outcomes remain open.

**AM14 — Source and Placement:** independent edits/comments for repeated uses, including volume, captions and pins. Source names underlying media; Placement names each timed use. Opens M6/X2; extends E8's single-source assumption without yet selecting representation. S1/S2 candidate: distinguish A's second 10 from B's second 10, and edit/comment on only the second reuse of A's same range. Definitions captured in CONTEXT.md. Existing Clip/Piece vocabulary still needs reconciliation before design closure.

**AM15 — Import completion and reuse:** both drop and file selection; reuse identical content; preserve different same-named files; failed imports show a failure and retry, never readiness. Settles M2 and opens M8. S11 candidate: an interrupted copy is not a ready asset and can be retried without overwriting unrelated content. Exact retry recovery mechanism remains an implementation investigation, not an approved schema.

**AM16 — Recording controls and completed takes:** microphone selection, optional countdown, prior completed takes retained until explicitly discarded. Permission/interruption errors are visible; Retake preserves earlier completed takes. Partial-capture recovery was not offered in the final question and is not guaranteed. S11 candidate: a failed retake leaves the prior completed take available. Device/runtime support remains untested.

**AM17 — Canvas and duration:** one canvas per reel, natural playback speed across different source frame rates, editable still-image duration. Retain an existing canvas, otherwise initialize from first main video. Opens split-screen layout choices. S9 candidate: portrait/landscape sources share a fixed canvas and remain in sync at their original speeds. No numeric sync tolerance or additional aspect-ratio deliverables accepted.

**AM18 — Volume, fades and looping:** owner answered yes to Q20. Each placement has manual volume/mute and start/end fades; optional music looping, fades shortened to fit short sounds, all audio ending with the reel. Opens A5/A6. S12 candidate: a short sound's fades fit its duration. Owner then asked whether levels can be adjusted manually; confirmed as already included. This question did not settle the caption speech source in Q21.

**AM19 — Frozen media content:** owner answered "q22 yes". Saved versions preserve exact media content, accepting disk cost; removing library/reel entries preserves saved versions and leaves files on disk. Opens X3. S6 candidate: changing the original file does not change v1's rendered media. This expands ADR 0002's reference policy; snapshot method, missing-source recovery and interrupted Save remain open. A short ADR is warranted once those trade-offs are resolved.

**AM20 — Placement-based feedback and replay:** owner answered "q23 yes". Edits/comments follow their specific placement through cuts/reordering. Removed moments retain flagged feedback; missing edit targets require resolution/discard before Save. Replacement media has a new identity. Extends E8/E5/E15. Opens X3 and deliberate-gap choices. S7 candidate: agent removal of an audio target produces a flagged edit rather than applying it to a different sound. Stable identity representation remains an implementation choice requiring investigation.

**AM21 — Free layout:** owner chose C “so we can have the freedom” after the ui-preview comparison. Several sources can be arranged in arbitrary custom regions, with independent timing/framing, instead of restricting split screen to two pictures and preset dividers. Keeps AM12's later delivery stage. Opens overlap/stacking Q25; does not silently revoke the picture-in-picture deferral. Acceptance candidate: recreate the preview's large region plus three smaller regions. Chosen comparison saved as [split-screen options](mockups/2026-10-07-split-screen-options.html). Final UI and numeric performance limits are not settled.

**Round 7 answer mapping:** owner responded "YEs / Manual Frist / Yes / Yes / YEs / Yes". Interpreted explicitly in chat as Q21 yes, Q26 manual first, Q27–Q30 yes. Q25 is not silently accepted and stays open.

**AM22 — Caption speech selection:** main talking take supplies captions by default, with manual voiceover selection instead where needed. Product-insert audio starts muted but can be enabled/adjusted. Opens remaining M6. S3 candidate: the speaker's sentence/captions continue over product footage even if that footage contains its own sound. Transcription timing, silent gaps and generated graphics remain open.

**AM23 — Manual volume changes first:** owner chose manual first for lowering music across passages. Automatic ducking is deferred without blocking the first slice. Audio cleanup/EQ/normalization/mastering were not in the final question and are not considered excluded by this answer. Opens A7, with manual volume variation included.

**AM24 — Waveforms and direct controls:** yes to waveforms, keyboard trimming/moving and optional snapping to cuts/playhead that can be disabled. Acceptance candidate: locate an effect onset on its waveform and reposition it without forced snapping. Playback-only monitoring, loading errors and export semantics remain open.

**AM25 — Relink and failed Save:** identical content can be relinked; different content is replacement. Failed Save retains the prior version and pending edits. Readiness requires the complete build and media. Opens legacy/lifecycle follow-ups. S6/S11 candidates: relink an unchanged source and retry a failed Save without losing edits. Exact staging/recovery mechanism awaits implementation, with static feasibility investigation pending.

**AM26 — Intentional gaps:** yes to explicit gaps, blank canvas when no picture covers the gap, and music/voiceover following their placements. Normal snips still close the main sequence. S5 candidate: intentional blank interval with continuing background music, then the next take. Caption visibility follows M6.

**AM27 — Canonical media names:** Source = underlying media; Placement = timed media use; Piece = main-video stretch; Clip = generated graphic. Supersedes the old broad Clip definition in CONTEXT.md while preserving Piece's editing meaning. No new API/schema follows from the name alone.

**Round 8 answer:** seven affirmative responses (including "Tes") map in order to Q25/Q31–Q36.

**AM28 — Overlap and stacking:** regions may overlap with front/back ordering, including picture-in-picture. Supersedes AM9's inset deferral. Keeps free layout in the later delivery stage. Acceptance candidate: a product region overlaps a speaker region and can be moved in front/behind without changing either's source.

**AM29 — Audible preview and monitoring:** unsaved volume/fade/loop edits are heard immediately; seeking/pause preserves the mix heard in the render. Placement Mute affects render; Solo isolates for preview only. Overlapping overload produces a warning. Supersedes R9's preview-fades exception and opens A8/X4. S8/S12 candidates: seek into a fade, pause/resume and hear its proper level; see an overload warning without silent normalization. Quantitative sync and overload override remain open.

**AM30 — Speech dependencies:** transcribe when a source is first used as speech and reuse its words for placements; no captions in silent spans. Interrupted sections split into continuous parts. Graphics follow surviving words; broken/discontinuous attachments are flagged for explicit repair, not silently dropped. This replaces the current longest-run mapping behavior for affected graphics/sections and preserves independent caption corrections. S1/S2/S5 candidates: repeated speech has captions for both placements, silent photo gap has none, interrupted graphics remain accounted for.

**AM31 — Legacy reels:** keep old single-source/code-only reels readable, identify missing media-preservation guarantees, permit exact-original relink and avoid silently substituting changed files. Does not invent retroactive history or authorize modifying frozen old versions.

**AM32 — Persistent edits and successful Save:** restore pending edits/undo/redo on reopening, retain imports/recordings when placement edits are undone or discarded, handoff blocks Save, new version appears only after complete success. S7/S11 candidates: failed Save retains edits and old version; Discard does not delete a completed voiceover recording.

**AM33 — Authored graphics media:** preserve local images, fonts and referenced files used by graphics; flag external dependencies that cannot be frozen. Extends AM19 without restricting the timing contract or authored technique. Render/Save gating for unfrozen external content remains Q38/Q37.

**AM34 — Undo after replay:** replayed edits remain, but Undo/Redo starts fresh with a visible notice when an agent version changes the base. Reopening alone keeps history. Matches current replay behavior. S7 candidate: existing pending audio edits are retained or flagged, not lost merely because history resets.

**AM35 — Render mix and failure outcome:** yes to Q37: Draft/Final include the selected mix for both footage and code-only reels; Overlay stays silent/transparent. One versus several segments use the same mix. Failed/cancelled renders never appear ready. Supersedes R2's source-audio-only direction for mixed outputs while preserving silent Overlay and the existing shared UI/CLI core. Unsaved-render behavior remains Q42.

**AM36 — Media preparation and readiness:** yes to Q38: show preparing/retry, pause if required media cannot keep up, block Save/Final when required media is missing or cannot be preserved, offer relink/retry. Waveform failure alone does not block playable media. No placeholder approximation was accepted. Maintains original versus derived playback-copy distinction. S11 candidate: incomplete conversion isn't ready and can be retried without losing the original.

**AM37 — Deliberate exclusions:** yes to Q40: defer colour grading, additional aspect-ratio deliveries, multicam, advanced VFX controls, cloud collaboration, marketplaces, automatic ducking, audio cleanup and automatic transcript cutting. Recording and free layout remain required later. Existing authored graphics techniques remain allowed, and folders/tags stay deferred. Deferrals do not prevent the selected first slice.

**AM38 — Audio control limits:** yes to Q41: silence through twice recorded level, manual points with smooth ramps, proportional shortening of overlapping fades to fit duration, overload warning with owner choice to render, no silent level adjustment. S12 candidate: a very short sound keeps valid combined fades and the mix shows overload visibly. This is accepted product behavior, not a tested audio implementation.

**Round 10 answer:** owner accepted Q39/Q42–Q44 together: "yep let's go with those".

**AM39 — Measurable output agreement:** picture/sound alignment within one selected output frame, consistent fades/loops after seek, silence after pause, same mix across editor/CLI and single/segmented renders. This is an accepted verification target; runtime checks have not been run. S8/S9 candidates use visual markers and audio impulses plus repeated seek/pause and decoded render comparisons. Compare timing and selected mix, not bytes between different encoding presets.

**AM40 — Explicit render base:** offer Save and render versus Render saved version. The former saves previewed edits as a new frozen version before rendering; failed/blocked Save prevents that render. The latter uses selected saved content, including older versions, without silently including pending edits. S6/S11 candidates cover both choices and failed Save.

**AM41 — Duration boundary:** footage duration follows the main sequence; code-only duration follows the authored page. Added media stops at that end, rather than silently making the reel longer. Extension is deliberate. S4/S5 candidates check that a shortened sequence clips music at its new end and that silent/image gaps retain defined durations. Explicit extension does not imply new animation beyond an authored clip's span.

**AM42 — One visible audio model:** agent-added sound appears as Source/Placement in the common audio controls/mix instead of independently sounding inside a graphic page. Narrows ADR 0001's Web Audio allowance for playback, preserving unrestricted authored visual techniques, named elements and deterministic seek. Addresses the code-only case and S3/S8/S10. ADR 0005 records the trade-off: authoring sound must integrate with the visible mix so seeking and preview/render cannot diverge.

**AM43 — Shared understanding confirmed:** owner answered "that works" to the final D1–D5 recap, artifact links and explicit design-only boundary. Closes CONF and this design session. No implementation authorization is implied.

## Final agreed handoff

**First complete workflow:** assemble two talking takes, product video/photo inserts, original speech, background music, imported effects and imported voiceover inside Kinotta; directly edit, Save and render. Audio works on footage and code-only reels. Media is owned/shared within one project.

**First delivery stage:** video/image/audio import and project library, main-sequence editing/reuse/gaps, product inserts, explicit placement identity, selected speech/captions, direct sound controls/waveforms/manual volume ramps/fades/looping, frozen media and reliable Save/preview/render. Preserve the authored-graphics contract and extend code-only Save for audio.

**Later required stage:** microphone voiceover capture, both recording modes, microphone/countdown/Keep/Retake with completed-take preservation; free layout C with several timed/cropped regions, overlap/front-back order and picture-in-picture. AM28 supersedes the earlier inset deferral. This order is selected, not an implementation plan.

**Deliberately deferred:** folders/tags, colour grading, additional aspect-ratio deliveries, multicam, advanced VFX editing controls, cloud collaboration, stock marketplaces, automatic ducking, audio cleanup/normalization/mastering and automatic transcript-driven cutting. These do not block the first stage. Authored visual techniques remain available, including advanced techniques an agent already knows how to use.

**Trade-offs:** preserved media costs disk space; background media defaults to Stay at time while optional attachments follow specific footage moments; interrupted sections split into continuous parts; broken graphics/edits require explicit repair; agent replay resets Undo/Redo; arbitrary independently sounding page audio gives way to the shared visible mix; preview pauses rather than drifting when required media is unavailable. No silent auto-leveling or placeholder approximation was accepted.

**Verification when implemented:** finish the complete working reel; exercise every scenario below; compare editor/CLI and single/segmented output with matching settings; check sync within one output frame, seek/pause/loop/fade state, mute/Solo distinctions, repeated-use captions/pins, old-version preservation and failure recovery. These are future acceptance checks. Static source investigations and document readback were performed during this docs-only session, with no application tests or runtime/render/capture checks.

**Artifacts:** this ledger, [CONTEXT.md](../CONTEXT.md), [chosen preview](mockups/2026-10-07-split-screen-options.html), [ADR 0003](adr/0003-saved-versions-preserve-media.md), [ADR 0004](adr/0004-placements-have-independent-identity.md), [ADR 0005](adr/0005-all-sound-uses-shared-mix.md). No feature plan/dashboard changes or implementation tickets were produced.

**Implementation research still needed:** specific Source/Placement representation and migration across TypeScript/Python; playback/mixer/capture integration; preservation of asset dependencies and extension of the Save journal to media preparation; frame-accurate preview/render and device testing. Static facts identify the current constraints and no known incompatible product requirement remains. These are engineering tasks for a separately authorized implementation, not outstanding owner choices or claims that current Kinotta meets the design.

## Final scenario outcomes

These are specified acceptance scenarios, not test results.

| ID | Agreed outcome |
| --- | --- |
| S1 | A/B words, pins and edits belong to their distinct placements even at equal source timestamps. |
| S2 | The second reuse can be edited, captioned and commented independently. |
| S3 | Product picture replaces/covers the speaker picture; speaker audio/captions continue by default. Product sound starts muted; manual levels and alternate caption speech selection are available. Authored sounds use the shared mix. |
| S4 | Snip closes the main sequence; music stays continuous and ends at the new reel end. Attached items follow specific moments; removed attachment targets flag their items. |
| S5 | Images have editable duration; silent spans have no captions unless selected voiceover supplies speech. Main gaps show blank canvas unless other pictures cover them; added sounds follow placements. |
| S6 | Preserved v1 remains reproducible after v2 or original-file changes. Exact originals can be relinked; changed content is replacement. Legacy limits are visible. Render base is explicitly saved versus Save-and-render. |
| S7 | Handoff blocks Save. Edits replay by placement; missing targets flag and require resolution/discard. Completed media stays available. Undo/Redo restarts after agent replay with notice. |
| S8 | Seek restores fade/ramp/loop state, pause stops all sound, and editor/CLI/single/segmented renders use the same mix without added join effects. Timing target is within one output frame. |
| S9 | Portrait/landscape and mixed-rate sources retain natural playback speed in one fixed canvas with adjustable crop or Fit. Timing target remains one output frame. |
| S10 | Old single-source/code-only reels remain readable with honest preservation limitations. New audio supports both reel types and the authored visual contract. Independent page sound uses the new shared mix. |
| S11 | Copy/conversion/recording/Save failures do not claim readiness. Prior versions, pending edits and prior completed recordings survive applicable failures. Save-and-render waits for successful Save; cancelled/failed render is not ready. |
| S12 | Gain can reach twice recorded level; manual ramps/fades are valid on short items with proportional fade limits. Overload is warned, owner controls render, and levels are not silently changed. |

## Completion check

- C1–C5: workflow, delivery boundary, identity/timing, scenario outcomes and persistence/output behaviors specified above.
- C6: code facts have source pointers and are static, with remaining implementation verification named explicitly. No runtime success claimed.
- C7: settled terms are in CONTEXT.md; accepted trade-offs are captured in ADRs 0003–0005. Superseded recommendations remain historical, not current scope.
- C8: final recap delivered and explicitly confirmed by the owner with "that works" on 2026-10-07. Design session complete, with implementation still outside this brief.

## Round 10 questions

- **Q39 (X4):** Verify picture/sound alignment within one selected output frame, same mix in editor/CLI renders and single/segmented renders, correct fade/loop state after seek, and no sound continuing after pause? Recommendation: yes as acceptance targets, with no numeric performance budget invented. Verify with authored impulses/visual markers, repeated seeks and rendered waveform/frame comparisons when implemented. Existing runtime behavior is not claimed to pass.
- **Q42 (X4R):** When unsaved edits exist, render the saved version, or Save the heard/seen edits into a new version before rendering? Recommendation: clearly offer Save and render and Render saved version. Save and render matches current preview only after Save succeeds; failed/blocked Save does not launch that render. Older-version renders always use their frozen content.
- **Q43 (X4D):** What sets the reel end when an added picture or sound extends past it? Recommendation: main sequence sets footage duration, authored duration sets code-only duration; added placements stop at that end rather than silently lengthening the reel. Extending the main sequence/reel duration is deliberate, and must not invent animation beyond an authored graphic's span. Alternative: longest placement always sets the end.
- **Q44 (X4A):** If an agent adds a sound to a graphic, should it appear in the same audio controls/mix instead of playing invisibly inside the page? Recommendation: yes, provide audible material as a project Source/Placement through the common audio model. Graphics keep their authored visual technique/timing/element contract. This narrows ADR 0001's permission for independently authored Web Audio playback, necessary for deterministic seeking, mixing and output. Alternative: support separately authored page audio with an explicit preview/export integration contract, requiring further design.

## Scenario audit before final output choices

These are agreed acceptance candidates, not executed tests.

| ID | Outcome from accepted decisions | Remaining policy |
| --- | --- | --- |
| S1 | A/B words, pins and edits target distinct placements, even at the same source second. | None beyond implementation verification. |
| S2 | Repeated source ranges have independent edits, captions and comments. | None beyond implementation verification. |
| S3 | Product picture covers speech; its audio initially muted; manual levels and chosen caption speech source. | Q44 for sounds authored independently inside graphic pages. |
| S4 | Music continues on reel time; original sound follows take; optional attachment; removed attachment flagged. | Q43 determines clipping at a shortened reel end. |
| S5 | Editable image duration, no silent-span captions, background audio by placement; explicit gaps allowed. | Q43 establishes duration source. |
| S6 | New versions preserve media and graphic dependencies; exact relink, replacement gets new identity, old limitations shown. | Q42 governs rendering with pending edits. |
| S7 | Handoff blocks Save; edits replay by placement; missing targets flagged/resolved, history resets with notice. | None beyond implementation verification. |
| S8 | Immediate unsaved audio edits, stable seek/pause state, same mix and no added segment boundary effects. | Q39 measurable alignment, Q42 saved versus pending render, Q44 authored page audio. |
| S9 | One canvas, crop/fill or Fit, natural playback speed and chosen output frame rate. | Q39 alignment target. |
| S10 | Old single-source/code-only reels readable with limits; audio supports both; new code-only Save path required. | Q44 common authored-audio boundary. |
| S11 | Preparing/error/retry states, failed Save retains old version/edits; cancelled render not ready; completed recordings retained. | Q42 failed Save-and-render must not render stale content. |
| S12 | Manual gain/ramp/fades, proportional fade limits, overload warning and owner-controlled render, no silent normalization. | None beyond implementation verification. |

## Round 9 questions

- **Q37 (A8):** Draft and Final contain the same selected mix, while Overlay remains silent and transparent? Recommendation: yes, for footage and code-only reels. One and several render segments use the same timing/mix; failed/cancelled renders never appear ready and leave no completed output. Graphic/section attachment failures must be resolved before a trustworthy Final; external-dependency gating follows Q38.
- **Q38 (M9):** While media copies/converts or a waveform loads, show preparing/loading/retry states rather than pretending it is ready? Recommendation: yes. Preserve originals and use derived playback copies when needed. Pause playback when required media cannot keep up instead of drifting out of sync. Block Save/Final on missing/unsupported required media or unfrozen external dependencies; offer relink/retry. Waveform failure alone does not invalidate playable media, and recording completion errors do not label unfinished takes ready. Alternative: allow approximate placeholder preview with an explicit owner-approved exception.
- **Q39 (X4, not asked until Q38 settles):** Agree on verifiable timing across preview/UI/CLI render and render segments? Recommendation: events line up within one chosen output frame; seeks restore fade/volume/loop state, pause stops every sound, and segment boundaries add no audio jump. This is a proposed measurable target requiring owner acceptance and later runtime verification, not a current capability claim.
- **Q40 (X5):** Keep this release focused on the selected media/audio workflow and free-layout stage? Recommendation: defer colour grading, additional aspect-ratio deliveries, multicam, advanced VFX controls, cloud collaboration, stock marketplaces, automatic ducking, EQ/noise cleanup/normalization/mastering and automatic transcript-driven cutting. Existing authored graphics techniques remain allowed. Folders/tags remain deferred. Recording/free layout remain required later, not removed from scope.
- **Q41 (A4D):** Start with volume from silence to twice the recorded level, manual volume points joined by smooth ramps, and start/end fades constrained to fit the placement? Recommendation: yes. Shorten overlapping fades proportionally so their total fits a very short sound. Show overload warnings and allow render after explicit acknowledgement, without automatic limiting/normalization. Alternative: prevent all amplification or block overload renders. Fade shape and volume range are proposed defaults, not undisclosed constants.

## Round 8 questions

- **Q25 (still open):** Allow picture regions to overlap with front/back ordering? Recommendation: yes, bringing picture-in-picture back into scope. Without a reply, the earlier inset deferral stands.
- **Q31 (A7):** Hear unsaved volume, fades, loops and cuts immediately, with consistent sound after pause/seek and the same mix when rendered? Recommendation: yes, replacing R9's preview exception. Placement mute is an edit affecting render; Solo, if included, is preview-only and visibly marked. Show overload feedback instead of silently changing the mix. Preview approximations require a later explicit choice if research finds them necessary.
- **Q32 (M6):** Transcribe sources when first used as speech, reuse timed words for each placement and omit captions in silent spans? When another main take interrupts a section or word-linked graphic, recommendation: split the section into continuous parts; graphics follow surviving attached words, with broken/discontinuous attachments flagged for explicit split/trim/relink, never silently reduced to the longest stretch. Per-placement caption corrections stay independent; unrelated replacement speech is not an automatic new target. Alternative: allow one topic section to own noncontiguous stretches and automatically split graphics.
- **Q33 (X3L):** Keep old single-source/code-only reels readable and show a clear limitation when an older version lacks preserved media? Recommendation: yes. Do not claim retroactive media preservation or silently substitute changed content; offer exact-original relink when possible. A fresh preserved version can be made from verified available media without editing old history.
- **Q34 (X3E):** Persist new placement/audio/framing/caption edits with undo/redo and restore them after reopening; keep Save blocked during handoff; leave library imports/completed recordings available if placement edits are undone? Recommendation: yes. Discard removes edits, not media files. Save publishes a new version only after full success and then clears its applied edits; failure leaves prior history and pending edits available.
- **Q35 (X3A):** Should images/fonts and other media referenced by authored graphics also be preserved for a saved version? Recommendation: yes for project-local dependencies. Flag external/live dependencies that cannot be preserved rather than promising a frozen result. Preserve the authored timing/element contract and choice of graphics technique.
- **Q36 (undo after replay):** When an agent version arrives and pending edits replay, keep the edits but start a fresh Undo/Redo history, or preserve the old history across that change? Recommendation: fresh history after replay, clearly indicated, matching current behavior. Reopening alone preserves history; replay onto an agent build changes its base.

## Identity/history fact investigation

Read-only static investigation on 2026-10-07:

- `pieces.ts/Piece`, `pieceMap`, `edit-model.ts` word/phrase targets and `carry.ts` comment mapping use source time or list index, not Placement identity. Pins in `types.ts` likewise have no source/placement target. Repeated uses need identity across both the core and Python engine, not only playback.
- `edit-list.ts` replays sequentially, flags failures and clears old Undo/Redo after an agent version. `save.ts` blocks stale lists, flagged edits and handoff. A numerically valid index or matching word time can still target the wrong occurrence under the current model.
- `edit-model.ts` rejects moves splitting a section into disjoint spans. `pieces.ts` and `skill/kinotta/engine/pieces.py` keep only the longest surviving run for a fragmented section/graphic. Python `timeline_words` maps a word to its first matching piece. These current behaviors cannot deliver independent repeated-placement captions or loss-free fragment handling.
- `version-build.ts` preserves plans/transcripts but rebases media paths to existing files. `footage.ts` may read footage from current reel metadata even for an older version. Graphics' referenced assets also need a preservation boundary.
- Footage Save stages in `.save`, writes its readiness marker last, publishes by rename and uses `save-journal.ts` to restore sources or clear committed edits. This is existing recovery for present plan/transcript files, not proof that future media copies/conversions are protected.
- `code-edits.ts` permits only element position/scale and has a separate Save path. Code-only audio must extend that path without replacing the authored-page contract.

No tests, browser playback, capture or render checks were run. These facts expose implementation work and the product choices Q32/Q35/Q36, not a selected schema or approved implementation plan.

## Accepted architectural records

- [ADR 0003](adr/0003-saved-versions-preserve-media.md) records the accepted disk-cost trade-off for preserving saved media. Legacy and external-dependency limitations remain open, so it promises preservation only for versions created with the new model.
- [ADR 0004](adr/0004-placements-have-independent-identity.md) records independent placement identity over source-time-only targeting. Representation and migration are not specified by the ADR.

## Round 7 questions

- **Q21 (still open):** Which speech supplies captions? Recommendation: main talking take by default, manually select voiceover instead where needed; product-insert sound starts muted and can be enabled. Manual volume control is already settled.
- **Q25 (M3O):** May free-layout regions overlap, with controls to put a picture in front or behind? Recommendation: yes, including insets, explicitly superseding AM9's picture-in-picture deferral. Alternative: restrict free layout to non-overlapping regions.
- **Q26 (A5):** Manually change music volume across passages, automatically lower it under selected speech, or both? Recommendation: manual volume changes over time first; defer automatic ducking, EQ, noise reduction, normalization and mastering. Existing manual per-placement level remains supported. Automatic speech detection would be a separate branch if required.
- **Q27 (A6):** Show audio waveforms to locate sounds/pauses, support keyboard trim/move and optional snapping to cuts/playhead? Recommendation: yes, each sound on the timeline with independent selection, clear loading/failure state and snapping that can be disabled. Solo and monitoring choices remain for A7.
- **Q28 (X3):** For missing media, allow exact-content relink; treat different content as replacement; preserve the previous version and pending edits if Save fails? Recommendation: yes. A new version is ready only when its complete media/build is ready. Library removal hides the item but cannot remove saved-version dependencies. Legacy versions lacking media preservation must show limits accurately; migration remains a follow-up.
- **Q29 (M4G):** Allow intentional gaps between main takes? Recommendation: yes, show a blank canvas where no other picture is present, with added music/voiceover continuing by their placement rules. Product regions remain visible over a main-picture gap. Gap insertion/resize is explicit; ordinary snips still close the main sequence.
- **Q30 (X2L):** CONTEXT.md calls both footage and scenes Clip, while current plan edits use Clip for generated graphics. Recommendation: Source = underlying media; Placement = each timed imported/recorded media use; Piece = a video stretch in the main sequence; Clip = a generated graphic. This narrows the old Clip definition and preserves the current editing meaning of Piece. Alternative: retain broad Clip and rename generated graphics; the owner must choose before glossary changes.

## Visual clarification for Q24

Owner requested the ui-preview skill because Q24 was hard to visualize. Loaded the explicitly named skill at `C:/Users/ryand/.claude/skills/ui-preview/SKILL.md` and its classes reference. Live working screen: `docs/mockups/sessions/233-1791366578/content/split-screen-options.html`. It compares side-by-side, stacked and arbitrary layouts. Recommendation remains the first two, with adjustable dividers/framing; no choice is accepted yet. Save the chosen screen under docs/mockups only after the owner answers. The preview is a docs-only mockup, not application implementation.

## Round 6 questions

- **Q20 (A4):** Set level/mute per Placement, fade its start/end, optionally loop music, and stop all sound at reel end? Recommendation: yes; music stops at its own end unless Loop is enabled, fades are shortened to fit very short items, and no sound extends the render duration. Original sources remain untouched. Range automation and source-wide changes remain explicit choices after this baseline.
- **Q21 (M6):** Which speech supplies captions when footage, a product insert and voiceover overlap? Recommendation: original speech continues under a product insert; insert audio defaults muted but can be enabled; select the speech Placement supplying captions for each span, default main take and allow voiceover instead. Transcribe new speech sources once, reuse their words for placements and permit per-placement corrections. Silent spans without a selected speech source show no captions. Generated graphics, sections and transcription timing require follow-up choices.
- **Q22 (M8):** Should saved versions retain the exact media content they used even if a referenced project file is changed or removed? Recommendation: yes, preserve that content despite disk cost; removal from a reel or library never deletes files or breaks saved versions. Disk deletion remains explicit. Missing current references must be relinked without silently substituting different content. This is a proposal extending ADR 0002's reference policy, not current behavior.
- **Q23 (X2):** After reordering/snipping, should pins/word edits follow their particular Placement and original moment, with removed moments preserved as flagged feedback? If an agent removes an edit target, should you resolve or discard the flagged edit before Save? Recommendation: yes; replacement with different media is not the old target; unchanged placements keep identity across versions and replay. Extend E8/E5/E15 rather than allowing time alone to choose a target.
- **Q24 (M3S):** For the later split-screen stage, start with two sources side by side or stacked, an adjustable divider and independent framing, or support arbitrary numbers/layouts? Recommendation: two sources, both layouts, adjustable divider and independent framing. Each source is independently timed, while sound/captions use the shared selection policies once settled. Layout gaps and ending behavior follow this choice.

## Round 5 questions

- **Q15 (A3):** After removing five seconds or reordering a take, should music remain continuous, while an effect, voiceover or product insert can either follow a footage moment or stay at its timeline position? Recommendation: original sound follows its take; music is continuous on reel time; added sounds/pictures offer Follow footage versus Stay at time, defaulting to Stay at time. When a followed moment is removed, preserve and flag its item for resolution rather than silently reattach it. Alternative: all added media always follows footage, or all always stays at time. Removal/replacement policies depend on this choice.
- **Q16 (M5):** Reuse the same three seconds twice: should trimming, muting, moving, caption edits and comments on the second use affect only that use? Recommendation: yes, including independent pin/edit targets. Call the underlying media a Source and each timed use a Placement, avoiding another meaning of Clip. Library-wide source corrections would be explicit. Source-transcript propagation and generated-clip behavior follow this choice.
- **Q17 (M2):** Import by both drop and file selection; reuse identical media content, preserve different same-named files under distinct names, and keep a failed import from appearing ready? Recommendation: yes to all, with retry and a clear failure reason. Alternatives include keeping duplicate bytes or overwriting same-named files. Historical protection remains M8/X3.
- **Q18 (A1R3):** For microphone recording, choose the microphone, offer an optional countdown, keep earlier takes until explicitly discarded, and show permission/interruption failures without marking an incomplete take ready? Recommendation: yes; no system-audio capture in this branch. Earlier completed takes remain available after Retake. Recovery of partial captures needs feasibility evidence before a guarantee.
- **Q19 (M7):** Use one canvas per reel, keep every video at its natural playback speed even when frame rates differ, and choose/trim each still image's duration? Recommendation: yes; retain an existing authored canvas, otherwise initialize it from the first main video. This sets composition behavior, not additional aspect-ratio deliveries. Alternatives: change the canvas for each source, or make every still use a fixed duration. Initial still duration remains a UI default to decide, not an invented numeric target.

## Round 4 questions

- **Q10 (M4):** Support append, insert, replace, trim, reorder and repeated use of the same range? After shortening a main take, should later main takes move earlier while product inserts/split-screen items keep their current times until attachment is decided? Recommendation: all actions and repeated uses; close the main sequence over edits, with overlapping picture placements edited independently. Deliberate empty gaps remain an explicit choice.
- **Q11 (M7/M3P):** Fit an entire source inside its canvas or split-screen region, or fill it by cropping? Also, is a movable picture-in-picture inset required or deferred? Recommendation: fill/crop by default with a fit option and adjustable framing; include split screen but defer the movable inset unless needed. Still-image duration, canvas selection and frame-rate policy follow.
- **Q12 (M2):** Is search by name, media-type filtering and preview enough, or are folders/tags required? Recommendation: those basic controls and reuse across all reels in the project, with folders/tags deferred. Drop and file selection should both import; duplicate/collision policy remains a later independent detail after organization settles.
- **Q13 (A1R2):** When recording to picture, start at the playhead and hear the existing reel audio, or record silently and place afterward? Recommendation: anchor at the playhead, let reel audio be turned on/off for recording, and audition before Keep or Retake. Standalone recordings go into the project library for later placement. Capture controls and recovery remain descendants.
- **Q14 (X1):** Must the first usable release include the entire selected set, including recording and split screen, or can those follow a complete import/edit/render workflow? Recommendation: design everything together and deliver importing/editing/rendering first, then recording and split screen. This is a delivery proposal, not an owner-approved deferral.

## Recording fact investigation

Read-only static investigation on 2026-10-07 found no `MediaRecorder`, `getUserMedia`, `navigator.mediaDevices`, `AudioContext` or independent audio element/transport in the inspected web, server and engine paths. `web/src/DropZone.tsx` and `server/core/_internal/videos.ts` accept videos; `import.ts/importVideo` uses a probe in `runner.ts` that requires a video stream. `web/src/api/_internal/client.ts/importVideo` and `server/http/_internal/handler.ts` centralize the existing video upload. `Player.tsx`, `usePlayback.ts`, `runner.ts/audioGraph` and `joinArgs` currently handle one footage source's playback/audio, not recorded voiceover or independent music/effects mixing. No runtime recording or synchronization check was run.

## Round 3 questions

- **Q6 (A2):** Should you directly add, preview, trim, move, duplicate and remove imported or recorded sounds, with speech, music, voiceover and several effects able to overlap? Alternatives: all these actions with overlap; a smaller action set; one added sound at a time. Recommendation: all actions with overlap, because music and effects must coexist with speech. Original speech's attachment to picture remains for A3.
- **Q7 (M2 ownership):** Should importing media copy it into the project, reference its original file, or offer both? Recommendation: copy files imported from outside the project; reference files already inside it, matching ADR 0002's current video policy. Historical media guarantees remain for M8/X3.
- **Q8 (M3):** Which picture arrangements are required: sequential takes; product video/photo replacing the picture while speech continues; simultaneous pictures such as picture-in-picture or split screen? Recommendation: sequential takes and product inserts with continuing speech. Ask for an explicit disposition of simultaneous pictures.
- **Q9 (A1R):** Should recording work while watching the reel, as standalone recording, or both? Recommendation: both, allowing narration timed to picture and reusable narration captured separately. Retake and capture details follow this choice.

## Round 2 questions

- **Q4 (A1):** Beyond the takes' recorded speech and background music, must this first workflow include sound effects, an imported voiceover, or recording a voiceover inside Kinotta? Alternatives: speech + music only; add effects; add imported voiceover; add in-app recording. Recommendation: speech + music only for the first workflow, because that completes the selected example. Every other role awaits the owner's disposition.
- **Q5 (M1):** Is the product insert a video, a still image, or must either work? Alternatives: video only; still image only; both. Recommendation: both, alongside imported audio, because product material can be a demo recording or a photo. This expands the proposed media types and requires owner agreement.

## Resume check, 2026-10-07

- Loaded the actual `grill-with-docs` router and its `grilling` and `domain-modeling` dependencies, including glossary and ADR formats. The host has no Skill invocation tool, so their installed files were read directly as the brief permits.
- Read PRODUCT.md, CONTEXT.md, ADRs 0001 and 0002, and the existing E-series decisions. Preserved settled Q2 and Q3. No new owner decision is implied by the request to resume.
- Read-only git checks confirm HEAD remains `43d2fb1dd49beb3df52e9fddbf0ad57513588556`. Both this ledger and `docs/briefs/` are untracked. The earlier statement that only the handoff was untracked describes the earlier snapshot.
- Removed the circular prerequisite between M8 and X3. M8 establishes the desired media-history behavior after library import choices; X3 reconciles it with X2. This repairs the interview order without deciding the behavior.
- No application changes or runtime tests were performed. The current frontier remains Q1.
- A read-only fact investigation rechecked E01, E02, E04, E07, E09 and E10 against their named source files. The brief's observations remain accurate: one footage reference, range-only pieces, no first-class audio edits, render-only cut fades, video-specific imports and versions that may retain mutable media references. These are static findings, not runtime verification.
