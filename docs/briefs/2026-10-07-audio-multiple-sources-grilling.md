# Handoff: grill F1 audio controls and F2 multiple-source editing

Prepared: 2026-10-07, Asia/Manila.
Workspace: `C:\FIles\Projects\Apps\Kinotta`.
Code inspected at: `43d2fb1dd49beb3df52e9fddbf0ad57513588556`. Working tree was clean before this handoff was added.

## Contract

Run a **design interview with documentation**, using `grill-with-docs`. The owner requested a comprehensive, grounded handoff so another model can execute that skill faithfully. This document supplies evidence, dependencies and coverage. It does not supply the owner's answers.

Only F1 and F2 from the preceding comparison are in scope:

- **A: Audio controls (comparison F1).** Music, sound effects, volume, fades, waveforms and possibly lowering music under speech.
- **M: Multiple source videos and an asset library (comparison F2).** Assemble takes, insert a screen recording, and use imported pictures or product footage alongside generated graphics.

These are candidate capabilities to interrogate, not an approved bundle. The owner has chosen the subjects to grill, not a release scope, track model, architecture or implementation order. The earlier suggestion to start with audio was the assistant's recommendation only.

The old grilling log already has unrelated decisions called F1 and F2. Use A and M for branches here, and AM1, AM2, etc. for decisions in this session's own log. Never overwrite or reinterpret the old F-series decisions.

This is a **docs-only brief**, narrowing the implementation-brief contract in the owner's global instructions. Local session notes, settled glossary entries and warranted ADRs are permitted. No application implementation, dependency installation, implementation tickets, external sends or git writes. Reading git state is permitted. Tests are not required merely to write documents. Any runtime investigation must be reported accurately, including checks not run.

## 1. Load the actual skills and repository rules

Read applicable AGENTS.md instructions, then invoke `grill-with-docs` through the host's Skill tool if available. Its installed source is:

`C:\Users\ryand\.agents\skills\grill-with-docs\SKILL.md`

The entire router instruction is: `Call the Skill tool twice, for "grilling" and "domain-modeling".` Load both. If the host has no Skill tool, read and apply these files directly:

- `C:\Users\ryand\.agents\skills\grilling\SKILL.md`
- `C:\Users\ryand\.agents\skills\domain-modeling\SKILL.md`
- `C:\Users\ryand\.agents\skills\domain-modeling\GLOSSARY-FORMAT.md`
- `C:\Users\ryand\.agents\skills\domain-modeling\ADR-FORMAT.md`

Resolve a moved path through the installed skill catalog or a targeted local search. If the actual skills cannot be recovered, report that limitation instead of claiming to have executed them.

The process is a dependency-driven interview:

1. Map the design as a tree of decisions and prerequisites.
2. Ask the **whole current frontier** in one round. A question belongs on the frontier only when its prerequisites are settled.
3. Give each question a stable Q number, concrete alternatives, your recommendation and its reason. Follow the owner's plain style without emojis.
4. Wait for the owner's answers. An unanswered question remains open. Silence is not approval of your recommendation.
5. Recompute the tree, including branches exposed by unexpected answers. Persist newly settled terms and decisions, then ask the next frontier.
6. Finish only when the frontier is empty and the owner confirms shared understanding. Confirmation closes this design session. It does not authorize implementation.

The grilling skill explicitly calls for subagents to discover facts. During the interview, dispatch narrowly scoped, read-only fact investigations when needed and continue with independent frontier questions. A pending investigation blocks only its descendants. If delegation is unavailable, do the lookup directly and mark its dependent questions as blocked until the evidence is available. Ask the owner for preferences and intent, never file contents or behavior you can inspect yourself.

Completion of this step: skills loaded, instructions understood, and the evidence snapshot below checked for changes relevant to the first round.

## 2. Keep the product's roots visible

Read `PRODUCT.md`, `CONTEXT.md`, the two ADRs and the E-series decisions in `docs/2026-09-30-grilling-decisions.md`. Apply their current intent, with the stale-document cautions below.

| ID | Existing commitment | Implication for this session |
|---|---|---|
| P1 | The owner can make mechanical edits without an agent. E1, E4, E20. | Ask what the owner must accomplish directly. AI assistance is optional. |
| P2 | Precise review lands on a moment and, for generated graphics, a named element. D2, ADR 0001. | New media and audio must have understandable comment targets. Preserve existing element pinning. |
| P3 | Save builds a new frozen version. An edit list persists, supports undo/redo, and replays after an agent handoff. E4, E5, E14, E17. | Discuss how every proposed edit survives Save, reopening, older-version playback and handoff. |
| P4 | Projects own their media and reels. Kinotta runs locally inside the project. ADR 0002. | Asset organization must fit project ownership. Copy, reference, relink and removal policies need explicit meaning. |
| P5 | HTML pages, stable element names and deterministic `seek(t)` preserve the author's creative freedom. ADR 0001. | A richer media model must coexist with this contract. Replacing authored scenes with a closed template system would require an explicit architectural decision. |
| P6 | One core serves UI and CLI rendering. R1, R12, R14. | Specify one audible and visible result regardless of who renders. Account for preview differences rather than assuming parity. |
| P7 | One owner, full-screen desktop use, brand-aware graphics and quiet editor chrome. PRODUCT.md, D15–D22. | Recommend the smallest useful interaction model. Multiuser cloud workflows and a stock marketplace have no established requirement. |

These are existing commitments, not a reason to veto a new owner decision. If a requested behavior changes one, explain the consequence, obtain an explicit choice, and record what it supersedes.

## 3. Evidence map: current behavior and where to verify it

All repository paths below are relative to the workspace. Inspect the named symbols rather than relying on line numbers. These are static observations as of the commit above, not fresh runtime test results.

| ID | Observed fact | Evidence and design consequence |
|---|---|---|
| E01 | A reel currently names one footage path. | `server/core/_internal/footage.ts`, `readReelFootage`, reads `reel.json.footage` as a string. A project video picker is not the same thing as placing several sources in one reel. |
| E02 | A Piece is only `{ in, out }`, measured within that source. It has no source or occurrence identity. | `server/core/_internal/pieces.ts`, `Piece`, `pieceMap`, `toSource`, `toTimeline`. Overlapping source ranges are rejected. Reusing the same source interval twice is not currently representable through this model. |
| E03 | Source-time mapping participates in comments and editing, not only playback. | `server/core/_internal/carry.ts`, `remapMoment`; `edit-model.ts`, word operations, caption phrase anchors and `MovePieceOperation`. Two sources both at second 10, or two uses of one source interval, make time alone ambiguous. |
| E04 | Direct operations cover snip, cut, piece order, word/phrase edits, caption positions, clip trim/slide and element offsets. | `server/core/_internal/edit-model.ts`, `Operation`, `applyOperation`. There are no first-class music placement or gain/fade edit operations in this union. This does not assert that arbitrary authored HTML can never use audio. |
| E05 | Review uses one footage video element's clock and seeks over removed ranges. Code-only playback uses a clock. | `web/src/review/_internal/usePlayback.ts`, `usePlayback`; `Player.tsx` and `timeline.ts` in the same folder. Concurrent sound and switching sources need an examined playback design. |
| E06 | Footage rendering trims one source's audio and joins it with Smooth or Hard cuts. Smooth uses 20 ms fades on either side of a join. | `server/core/_internal/runner.ts`, `FootageComposite`, `audioGraph`, `compositeArgs`, `joinArgs`. These are short fades around concatenated pieces, not a general crossfade mixer or music track. |
| E07 | Review does not apply those render fades. | R9 in the decision log and the current playback path. Existing audio preview/render parity is incomplete. New audio behavior must have an explicit preview promise. |
| E08 | A segmented footage render joins video segments and encodes the audio across the whole edit once. Overlay output has no audio. | `server/core/_internal/render.ts`, `runRender` and `renderSegments`; `runner.ts`, `joinArgs`; `server/core/README.md`. Audio changes must cover both single and segmented rendering. |
| E09 | Drops are copied into project `footage/`, hashed and deduplicated. Name collisions receive suffixes. Picked videos remain in place. HEVC/ProRes receive H.264 playback copies. | `server/core/_internal/import.ts`, `importVideo`, `playbackPath`; ADR 0002; `start.ts`. This is existing import infrastructure, not a general library for video, images and audio. |
| E10 | Versions retain their plan and transcript. Existing media paths may still reference project files. | `version-build.ts`, `sources.ts`, `footage.ts`. A snapshot of references does not itself preserve media bytes if a source file is replaced. Resolve the desired historical behavior explicitly. |
| E11 | Save is blocked during handoff. Edits can collect and replay when an agent's version lands. Missing targets are flagged. | `edit-list.ts`, `handoff.ts`, `save.ts`. New source/placement targets must have a defined replay outcome. |
| E12 | Approval is now optional for rendering, and render controls are in Review. | R19, `render.ts` `gateReasons`, `web/src/App.tsx`, `web/src/Renders.tsx`, `docs/plans/2026-10-06-review-picker-merge.md`. A new Picker phase or approval gate would reverse later decisions. |

Read on demand when a branch reaches the frontier:

- **Audio:** `runner.ts`, `render.ts`, `render-settings.ts`, `usePlayback.ts`, `Player.tsx`, `tests/core/render-footage.test.ts`, `tests/core/render-segments.test.ts`.
- **Sources and imports:** `import.ts`, `videos.ts`, `start.ts`, `footage.ts`, `types.ts`, `server/http/_internal/handler.ts`, `tests/core/import-video.test.ts`, `tests/e2e/drop-video.spec.ts`.
- **Identity and persistence:** `pieces.ts`, `edit-model.ts`, `edit-list.ts`, `carry.ts`, `save.ts`, `version-build.ts`, `tests/core/pieces.test.ts`, `tests/core/version-pieces.test.ts`, `tests/core/handoff.test.ts`, `tests/core/snip-save.test.ts`.
- **Generated graphics and UI:** `skill/kinotta/engine/pieces.py`, `build.py`, `skill/kinotta/reference/engine-api.md`, `web/src/review/_internal/Lanes.tsx`, `web/src/stage/_internal/FootageLayer.tsx`, `DESIGN.md`.

### Stale sources and conflicts

README's opening status and missing-features list predate playback and rendering. PRODUCT.md still contains some deferred items that shipped. Older specs still describe a separate Picker and approval-gated rendering. The skill still contains obsolete "no MP4 render" wording. Do not treat any of these as evidence that the current app cannot play or render.

For current behavior, inspect code and relevant tests. For intended behavior, consult dated owner decisions and later completed plans. Code demonstrates what exists, not what the owner wants next. If evidence conflicts, record both, resolve chronology where possible, and ask about intent only if it remains ambiguous. This session does not include general documentation cleanup.

## 4. Build the tree before choosing a solution

Create a compact session ledger at `docs/2026-10-07-audio-multiple-sources-grilling-decisions.md` when the interview starts. Use the actual session date if it starts later. Record each node's prerequisite, state and evidence:

`ID | Decision | Depends on | State | Answer or evidence`

States are `open`, `researching`, `settled`, `deferred by owner`, and `out of scope by owner`. A recommendation is not a settled answer. A deferred node must state what is deferred and whether that prevents finalizing the proposed first slice. Reopen dependent decisions when an upstream answer changes.

Start with these root subjects. Ask them together only while they remain independent:

- **Q1, first complete job:** Which concrete reel should these capabilities let you finish, and where do you currently leave Kinotta? Recommend using one real workflow, such as two talking takes plus a product insert and background music, as the running example. The example is a proposal, not evidence of the owner's actual workflow.
- **Q2, range of reels:** Must the first audio release work for footage reels, code-only reels, or both? Recommend both as the product direction because the existing product values both, while making the first shipping slice an explicit later choice.
- **Q3, role of the library:** Is the immediate need to select and reuse media inside a project, organize media within a reel, or curate assets across projects? Recommend project-owned media with reuse across that project's reels, consistent with ADR 0002.

Adapt these questions after reading any newer session answers. Do not ask the owner to repeat an already settled answer. Decide the actual feature subset and ordering only after the first job is understood.

For every subsequent question, explain the visible consequence before technical terminology. Example: "After you remove five seconds of speech, should the music keep playing continuously or lose the same five seconds?" Investigate the implementation options yourself. Do not ask the owner to design a JSON schema to answer that question.

## 5. Branch coverage reference

This is a coverage map to reveal the next frontier, not a questionnaire to dump in one turn. New answers can add branches. Every applicable row needs a settled answer or an explicit scope decision.

### A: Audio controls

| Node | Reach after | Decisions to resolve |
|---|---|---|
| A1 | First job | Required audio roles: original speech, music, effects, imported voiceover. Which are necessary in the first slice? Recording inside Kinotta is a separate choice. |
| A2 | A1, supported reel types | Add, preview, trim, move, duplicate and remove sound. Decide what the owner must do directly and whether several sounds may overlap. |
| A3 | A2, M placement behavior | Audio attached to a footage occurrence versus audio placed on the reel's timeline. Behavior after snip, reorder, source replacement, and duration changes. Decide sound before/after picture cuts only if needed. |
| A4 | A1–A3 | Gain and mute scope: whole source, one use, or a range. Fade controls and limits on short items. Music looping or stopping. What happens beyond the reel's end? |
| A5 | A4 | Whether ducking is needed, whether it is manual or automatic, what counts as speech, and how the owner overrides it. EQ, noise reduction, normalization and mastering are separate scope choices. |
| A6 | A2–A4 | Waveform purpose and location, selection, snapping, keyboard controls, loading feedback, mute versus monitoring controls. Scope UI design only after the editing behavior is understood. |
| A7 | A3–A5 | Audible preview after unsaved edits, pause/seek behavior, mute/solo export semantics if present, synchronization, overload/clipping feedback and any allowed preview approximation. |
| A8 | A7, shared version decisions | Draft/Final/Overlay audio behavior, code-only output where included, segmented-render parity, cancellation, missing or unsupported audio, and old-version reproduction. |

### M: Multiple sources and media organization

| Node | Reach after | Decisions to resolve |
|---|---|---|
| M1 | First job, library role | Required media types: video, still images, audio. Generated scenes already exist and need a clear relationship to imported items. Pick only what the job requires. |
| M2 | M1 | Import by drop or selection, copy/reference rules, duplicate content and name collisions, reuse across reels, basic find/preview behavior. Folders, tags and stock services each need a demonstrated need. |
| M3 | M1, first job | Sequential takes, picture inserts that replace only the image while speech continues, or simultaneous visible sources. Determine necessary overlap and stacking before deciding the number or form of tracks. |
| M4 | M3 | Insert, replace, append, trim, reorder and reuse the same source range. Determine whether gaps or overlaps are valid and how downstream material moves. |
| M5 | M3–M4, identity research | Stable meaning of source versus each use of it. What do an edit, a word, a caption or a pin target when a source appears twice? Resolve behavior before proposing a representation. |
| M6 | M3–M5 | Which source supplies speech and captions, when transcription runs, and what happens to sections or generated clips when their speech is moved, replaced or removed. Silent inserts must have an explicit outcome. |
| M7 | M1–M3 | Mixed dimensions, orientation and frame rates, still-image duration and fit/crop behavior. Basic fit in the current canvas is within this discussion. Full multi-aspect delivery was comparison F3 and requires a separate scope expansion. |
| M8 | M2, shared version decisions | Missing or relocated files, replacement with different content, removal from the library versus removal from a reel versus deletion on disk, and historical-version dependencies. |
| M9 | M3–M8 | Playback across source boundaries, loading/conversion states, original versus playback copy, deterministic render composition, backward compatibility and agent-produced versions. |

### Shared decisions

- **X1, first slice:** after A1 and M1–M3, decide which complete workflow ships first and whether audio and multiple sources are designed together but delivered separately. Shared dependencies may change the earlier recommendation to build audio first.
- **X2, timing and identity:** after A3 and M5, account for source time, timeline time, repeated uses, captions, generated clips, comments and edit replay together. Extending E8 is a trade-off, not an automatic rename.
- **X3, versions and ownership:** after X2 and M8, state what frozen means for asset references and media content, and how old reels remain readable. Specify recoverable failure behavior for interrupted Save.
- **X4, preview and render:** after A7 and M9, define a verifiable agreement between what the owner hears/sees and the exported file. If an approximation is accepted, name it and its UI consequence.
- **X5, scope boundary:** explicitly place full colour grading, aspect-ratio variants, multicam, advanced VFX, cloud collaboration, marketplaces and transcript-driven cutting outside this release unless the owner brings them into scope. Record the owner's disposition, not an invented approval.

## 6. Use concrete scenarios to expose contradictions

Run applicable scenarios as their prerequisites settle. Ask for the desired outcome and compare it with the proposed decisions. These are acceptance candidates, not claims of existing tests.

| ID | Scenario | Question it must settle |
|---|---|---|
| S1 | Start with take A, insert take B, return to A. Both contain speech at source second 10. | Which words, pins and edits belong to which take and occurrence? |
| S2 | Reuse the same three seconds of A twice. Move or comment on only the second use. | Can repeated content be targeted independently? If reuse is excluded, how is that restriction explained? |
| S3 | Put a product video over the speaker while their sentence continues. The product video also has sound. | Which picture and audio play? Which words appear as captions? |
| S4 | Add music, then snip five seconds of speech and reorder two pieces. | Does music follow time, content or its attachment? What happens to a sound effect attached to a removed moment? |
| S5 | Add a silent image or a video with no audio between talking takes. | Duration, caption visibility, silence and background music all remain defined. |
| S6 | Save v2 with changed audio, then reopen and render v1. Rename or replace a referenced source file. | What history is guaranteed, what is detected, and how does the owner recover? |
| S7 | Send a section batch, make unsaved audio edits, then receive an agent version that removes their target. | Which edits replay, which are flagged, and what blocks Save? |
| S8 | Seek into a fade or ducked passage, pause, resume, then export using one and several render segments. | Is the heard result consistent? How are segment boundaries and repeated seeks checked? |
| S9 | Combine portrait and landscape videos at different frame rates. | Canvas, fit, timing and audio sync have an explicit policy. |
| S10 | Open an old single-source reel and a code-only reel. | Existing workflows continue, and any intentionally unsupported new action has a clear reason. |
| S11 | A copy, conversion or Save fails halfway, or a render is cancelled. | No completed version or file falsely appears ready. Pending edits and recoverable media stay accounted for. |
| S12 | Preview two loud overlapping sounds or place a fade on a very short sound. | Limits, feedback and export behavior follow an explicit audio policy. |

Do not invent numeric sync tolerances or performance budgets. Propose measurable targets when the selected workflow requires them, explain the trade-off and obtain a decision or investigate feasibility first.

## 7. Write docs as understanding develops

**Session ledger:** record each settled AM decision with the owner's answer, rationale, affected prior decision, evidence pointers, dependent nodes and acceptance examples. Keep facts, recommendations and accepted decisions visibly distinct. After each round, persist the frontier so a resumed session can continue without re-interviewing the owner.

**Glossary:** Kinotta's established glossary is `CONTEXT.md`, named as authoritative by PRODUCT.md and the decision log. Apply domain-modeling's glossary format there, preserving the existing location instead of creating a second competing glossary. This is a repository-specific adaptation of its default GLOSSARY.md filename. Update a term when it is settled, not at the end of the interview. Definitions remain one or two sentences with no schema, API or implementation detail.

Terminology needing scrutiny includes asset/source, piece/clip, occurrence or placement, lane/track, original sound, music, gain, fade and ducking. These are candidates, not approved terms. In particular, CONTEXT.md uses Clip broadly while the edit model uses PlanClip for generated b-roll. Ask what meaning is intended before introducing another use of "clip". Respect existing Reel, Version, Save, Render, Snip and Comment batch meanings unless explicitly changed.

**ADRs:** offer one only when the decision is hard to reverse, surprising without context and the result of a real trade-off. Stable source/occurrence identity, preservation of referenced media and the preview/render contract may qualify after alternatives are evaluated. A button label or slider range normally does not. Follow the skill's short ADR format, scan existing numbers before allocating one, and record accepted reasoning rather than speculation.

**Plans:** this handoff is not a feature plan. If the owner requests a plan during the session, create it from `docs/plans/_template.md`, use the session date, and distinguish draft from confirmed scope. After any plan change run `powershell -NoProfile -File docs/plans/build-plans-index.ps1`. Never edit the dashboard HTML by hand.

Documentation writes during the interview capture understanding. They do not bypass the grilling skill's final shared-understanding confirmation or grant permission to start implementation.

## 8. Completion and handoff back to the owner

Before declaring the frontier empty, verify:

- **C1:** The first complete user workflow and initial release boundary are stated in the owner's terms.
- **C2:** Every applicable A, M and X branch has an answer or an explicit owner-approved deferral. No unresolved dependency affects the chosen first slice.
- **C3:** Applicable scenarios S1–S12 have consistent outcomes. Any new branch exposed by them is resolved too.
- **C4:** The identity/timing choice accounts for words, captions, graphics, pins, repeated uses and handoff replay, not just video playback.
- **C5:** Save, undo/redo, old versions, media ownership, missing assets, failures and UI/CLI render behavior are specified for the selected capabilities.
- **C6:** Facts have source pointers. Research still needed is named. A factual uncertainty essential to the chosen design prevents closing that design.
- **C7:** Settled vocabulary is in CONTEXT.md. Significant trade-offs have ADRs where warranted. Recommendations have not been silently promoted to decisions.
- **C8:** The owner has received a concise recap of decisions, deliberate exclusions, trade-offs and acceptance examples, and explicitly confirmed shared understanding.

If the owner pauses early, save the answers, unresolved prerequisites and next frontier, then report an incomplete session. Do not label the design complete to fit a turn or token budget.

The finished handoff from the session should link the decision ledger, updated glossary and any ADRs, name the approved first slice and the agreed way to verify it, and list any deliberately deferred later work. Remain in docs-only scope until a separate implementation request.

## Suggested launch prompt

> Use grill-with-docs to interview me about F1 audio controls and F2 multiple-source editing for Kinotta. Read docs/briefs/2026-10-07-audio-multiple-sources-grilling.md first, then load the actual skill and its two dependencies. Ground recommendations in the current code and Kinotta's product commitments. Begin with the current independent frontier, wait for my answers, and update settled terms and decisions as we go. This is a docs-only design session. The handoff's examples and recommendations are not my decisions.
