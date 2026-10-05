---
title: Review and Edit phase (direct edits)
date: 2026-10-04
status: Blocked
summary: Kinotta becomes an AI-agnostic editor. Drop a video, cut, fix and re-time words, move captions and elements, and Save a new version with no agent; an agent stays optional for building motion graphics. Intent grilled (E1 to E20); spec published as #30.
spec: docs/specs/2026-10-05-review-edit-phase.md (https://github.com/RayDomD/kinotta/issues/30)
---

## Intent

- Problem: Every change goes through a comment and an agent round, even one the owner could do in seconds:
  a misheard caption word, a stumble to cut, a clip that should start half a second later, a badge 40 px
  lower. Kinotta can't start a reel either: an agent has to create every one. Kinotta is a reviewer by design
  (product principle 5, K12), and the planned Review phase only adds playback and scrubbing.
- Why: The owner asked for it on 2026-10-04 after the sample loop. The aim is no AI in the loop for changes:
  Kinotta is usable for plain editing on its own, with an agent as an option for building.
- Proposed outcome: The owner drops a video into Kinotta, cuts it, fixes and re-times the words, moves
  captions and elements, and saves a new frozen version, with no agent. When they want motion graphics, an
  agent builds them from the same sources, and the comment loop works as today.
- Affected: the editor (a Review and Edit surface: player, timeline, edit list, new-reel flow), core (edit
  list, pieces and source-time mapping, Save, carry-forward remapping, per-version transcript and plan), the
  skill's scripts (run by Kinotta to build; plan fields for pieces, offsets and caption position), the timing
  contract, CONTEXT.md, PRODUCT.md, ADR 0002.
- Constraints: Versions stay frozen; a Save makes the next version. The sources in `motion/` stay the single
  truth: Save writes to them and rebuilds, so an agent's next build keeps every edit. The project's video is
  never altered. Kinotta calls no AI service; transcription is local. Formats and wording name no agent.
- Out of scope: colour grading and the footage track of takes (split off from Review), MP4 render, editing
  scene timing on code-only reels, packaging and testing agents other than Claude, re-breaking caption phrases.
- Open questions: none. Resolved in a grilling round on 2026-10-05, decisions E1 to E20 in
  `docs/2026-09-30-grilling-decisions.md`. Look: `docs/mockups/2026-10-05-review-edit.html`.

Spec: `docs/specs/2026-10-05-review-edit-phase.md`, issue #30. Next: Goal and Approach here, then `/to-tickets`.

## Goal

The owner starts a reel from a video in Kinotta, plays it, cuts and snips it, fixes and re-times words, moves
captions and elements, trims and slides clips, and saves the next frozen version with no agent. An agent's next build
keeps every saved edit, comments carry forward by remapped time, and a hand-off blocks Save without losing edits.
This answers the Intent: plain edits need no AI round, and an agent stays optional.

## Approach

Build spec #30 as tickets T29 to T47 (`docs/tickets-review-edit.md`, issues #31 to #49), working the frontier one
ticket per fresh context with `/implement`. Sub-agents run Sonnet 5.5 at medium effort (owner's choice,
2026-10-05). Pieces and the source-to-timeline mapping land first in the engine and core (T29), so every later
reader shares one mapping. Edits are operations on named targets in a reel-level edit list; Save writes them into
`plan.json` and `transcript.json` and runs the skill's own `build.py` and `shots.py`, exactly as an agent does.
The Review tab is built to `docs/mockups/2026-10-05-review-edit.html`. Each ticket gets its own plan and session
summary, as T18 to T27 did.

## Steps

1. First slice: T29 pieces in the engine, T30 start from a picked video, T31 Review tab plays, T32 snip and Save.
   T44 startup check runs alongside.
2. Edit kinds on top of the slice: T33 undo and redo, T34 blade and reorder, T36 words, T37 captions, T38 clips,
   T39 element offsets, then T40 code-only offsets.
3. Flow around the edits: T35 carry-forward by remapping, T41 hand-off blocks Save, T42 drop a video, T43 real
   transcription, T45 brief reels, empty Storyboard and last-used tab.
4. T46 skill learns the new plan fields; T47 Lane B finish pass on the Review tab.
5. `/code-review` on the whole branch against spec #30.

## Risks

- Source-time mapping touches build, shots, carry-forward and the editor; a mismatch shows as captions or pins off
  by a snip's length. One shared mapping module and engine tests over reordered pieces guard it.
- Engine changes alter every composed page: rebuild the committed footage sample or its drift test fails.
- Save runs Python subprocesses; a half-written `v<n+1>` would read as a new version. `shots.json` is written last
  and any failure removes the folder.
- Playing clips live over footage in the browser may stutter on long reels; T31 checks it on the 2:00 sample.
- Real transcription is slow and machine-dependent, so only one opt-in test runs faster-whisper.

## Checks to run

- `npm run typecheck`
- `rtk proxy npm test` (core, engine, scripts)
- `rtk proxy npm run test:e2e`
- `kinotta check` on the footage sample after engine changes; drift test green
- Manual pass on `C:\Users\ryand\Downloads\kinotta-test` by the owner at the end

## Changelog

### 2026-10-04
- Intent recorded at the owner's request; T25 goes first.

### 2026-10-05
- Grilled: Kinotta becomes an AI-agnostic editor and this work becomes the Review phase (Review and Edit).
  Decisions E1 to E20; look chosen in a `ui-preview` round. Intent rewritten and approved; status Approved.
- Spec written from the grilling and published as issue #30 (`ready-for-agent`). Test seams confirmed: the core
  `Project`, the engine scripts, and a few browser flows, with an injectable transcriber.
- Tickets T29 to T47 written (`docs/tickets-review-edit.md`) and published as issues #31 to #49. Goal, Approach,
  Steps, Risks and Checks filled; status In Progress. Branch `feat/review-edit-phase`.
- Unattended run: T29 to T41, T43, T46 and T47 Done; T42, T44, T45 built on worktree branches and Parked (owner) because
  merging them was not permitted. Branch code review run and its findings fixed. Status Blocked on the owner: merge the
  three branches, stop two orphaned e2e servers (ports 4398/4399) so the full e2e suite can run. Summary:
  `docs/session-summaries/2026-10-04-direct-edits-summary.md`.
