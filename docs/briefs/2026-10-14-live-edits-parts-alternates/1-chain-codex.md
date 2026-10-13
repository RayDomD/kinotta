---
agent: codex
lane: chain
manifest: ./manifest.md
date: 2026-10-14
plan: ../../plans/2026-10-12-live-edits-freeze-at-render.md, ../../plans/2026-10-12-shots-as-parts.md, ../../plans/2026-10-13-alternates.md
---

# Brief: live-edits-parts-alternates — lane chain

Follow this brief exactly. Standing rules are in `~/.codex/AGENTS.md`; this repo has no `AGENTS.md` of its own, so its rules are in Context below.

## Goal to set

Paste this as the goal, from the lane's worktree root:

> In this Kinotta worktree, follow `docs/briefs/2026-10-14-live-edits-parts-alternates/1-chain-codex.md` exactly. Build Part 1 (live edits), then Part 2 (shots as parts), then Part 3 (alternates), in that order, never starting a part before the one before it is complete and green. Tick each checklist box in the brief as you finish it. Make no git writes of any kind. The goal is met when every box in the brief is ticked, the checks under "Done when" pass, and the stop report is written in the brief. If the Part 2 stop gate fails, or a part cannot be completed, the goal ends there: write the stop report and stop.

## Scope

Build three plans in order, in this one worktree, as one continuous run. Each part stands on the one before it. Do not start a part until every box of the part before it is ticked and its checks are green.

1. **Part 1, live edits:** `docs/plans/2026-10-12-live-edits-freeze-at-render.md`.
2. **Part 2, shots as parts:** `docs/plans/2026-10-12-shots-as-parts.md`.
3. **Part 3, alternates:** `docs/plans/2026-10-13-alternates.md`.

Read all three plans in full before writing any code. Each plan's Goal, acceptance criteria, Approach, Steps and Risks are part of this brief. Where a plan and this brief disagree, this brief wins and you record the difference under Deviations.

Out of scope:

- `docs/plans/2026-10-13-viewer-transport-clips.md`, `2026-10-13-version-compare.md` and `2026-10-14-span-pins.md`. Do not build any of them, even where they would be convenient.
- Footage reels and existing single-page reels. They must keep working, unchanged.
- `/impeccable critique`, `/impeccable audit`, session summaries, and `docs/plans/index.html`. The reviewer does these.
- Installing or syncing the Kinotta skill outside this worktree. Edit the skill's files here only. Never run `npm run install-skill`.

No other lane runs in parallel.

Files you may edit: `server/core/**`, `server/http/**`, `server/cli.ts`, `server/editor-client.ts`, `bin/kinotta.mjs`, `web/src/**`, `tests/**`, `skill/kinotta/SKILL.md`, `skill/kinotta/reference/**`, `CONTEXT.md`, `docs/adr/**`, and this brief (to tick boxes and fill in Test evidence and Deviations). Nothing else.

## Execution checklist

Tick each box in this file as you finish it, so a partial run is readable.

### Part 1: live edits

Plan steps 1 to 6. Step 7's critique, audit and summary are the reviewer's.

- [ ] 1.1 Durable working-state identity and history (plan step 1). Before changing behaviour, write the stored representation that tells the working reel from the last frozen version as a comment block at the top of `server/core/_internal/edit-list.ts`, with a round-trip test and a crash-recovery test. Cover a legacy pending edit list reopened without applying its operations twice, undo and redo across a freeze, and an agent rebuild without double application. Files: `server/core/_internal/edit-list.ts`, `state.ts`, `types.ts`, `tests/core`.
- [ ] 1.2 The freeze boundary, extracted from Save (plan step 2). Unchanged content reuses the frozen version; undoing back to frozen content reuses it; missing media, concurrent edits and an interrupted publish leave no half-built version. Files: `save.ts`, `version-build.ts`, `code-edits.ts`, `tests/core`.
- [ ] 1.3 Final and Overlay renders freeze through the boundary; a Draft captures the working reel into temporary job storage without adding a version, and its inputs are removed on completion, failure and cancel (plan step 3). A render of an explicit older version is unchanged. Files: `render.ts`, `render-queue.ts`, `runner.ts`, `tests/core`.
- [ ] 1.4 A comment hand-off freezes, maps comments onto the frozen version, then writes the batch (plan step 4). Later edits keep applying and replay onto the agent's next version; conflicts show through the existing flagged-operation flow. Files: `batch.ts`, `carry.ts`, `comments.ts`, `tests/core`.
- [ ] 1.5 Every operation records who made it. An operation added through the CLI or HTTP by an agent carries the agent's name; one made in the editor carries `you`. Add `kinotta edit <reel> --by <name> <operation json>` so an agent can add one operation to the working reel. Files: `edit-model.ts`, `edit-list.ts`, `server/cli.ts`, `server/http/_internal/handler.ts`, `tests/core`.
- [ ] 1.6 The Review screen, built to `docs/mockups/2026-10-14-working-reel.html` option A (plan step 5): Working is the top row of the Versions list and is lit when open, with a line such as "3 edits since v16"; each frozen version below says what froze it (Final render, Comments to the agent, Built by the agent's name); Save and Discard are removed; the render menu reads "Draft of Working" and "Final, freezes as v<n>"; a frozen version shows one line, "You are viewing v<n>, a frozen version." with a "Back to Working" button, and its editing tools are off. The Edits list shows who made each edit. Files: `web/src/App.tsx`, `web/src/review/_internal/**`, `web/src/Renders.tsx`, `web/src/api/**`, `web/src/styles.css`, `web/src/review/review.css`, `tests/web`, `tests/e2e`.
- [ ] 1.7 Docs (plan step 6): `server/core/README.md`, `CONTEXT.md` (Version, Save, Edit list, and a Working reel term), ADR 0003 revised, `skill/kinotta/SKILL.md`, `skill/kinotta/reference/sound.md` and `native-media.md` no longer telling the agent that every change is a new version.
- [ ] 1.8 Every acceptance criterion in the plan's Goal has a test that names it, and the plan's "Checks to run" are green.

### Part 2: shots as parts

Plan steps 1 to 9, as written.

- [ ] 2.1 Contract 2 manifest reading and validation, with computed starts. Single-page fixtures stay green.
- [ ] 2.2 The assembler: a pure function from a manifest and revision folders to one HTML string. Tests: same input gives the same bytes; the output passes `scanPage` and `checkShotsAgainstPage`; a `shot.css` rule not scoped under its own `[data-scene]` is refused. **Stop gate:** build a three-shot fixture reel and prove in a browser test that the assembled page seeks, plays and pins before going further. If it cannot keep contract 1, stop Part 2 and Part 3 here and report under Deviations.
- [ ] 2.3 Publishing a parts version through stage-and-rename, and `kinotta build <reel>`.
- [ ] 2.4 `kinotta check` and the render gate on a parts version, including a manifest that names a missing revision.
- [ ] 2.5 Change detection from manifests, including a change to the shared folder reported as changing every shot.
- [ ] 2.6 `shotName` on pins, and carry by name across an added, a removed and a reordered shot.
- [ ] 2.7 Batches grouped by shot, opening with a `Rebuild:` line naming the shots that have comments.
- [ ] 2.8 A Draft render of a parts fixture, proving `skill/kinotta/engine/render.js` needs no change. Do not edit that file.
- [ ] 2.9 Docs: a new ADR `docs/adr/0006-shots-are-parts.md`, `CONTEXT.md` (Revision; Shot and Version updated), `server/core/README.md`, `skill/kinotta/SKILL.md`, `skill/kinotta/reference/contract.md`.
- [ ] 2.10 Every acceptance criterion in the plan's Goal has a test that names it, and the plan's "Checks to run" are green.

### Part 3: alternates

Plan steps 1 to 9. Step 10's critique, audit and summary are the reviewer's.

- [ ] 3.1 `alternates` in the manifest: reading, validation and `kinotta check` messages.
- [ ] 3.2 The assembler's revision override, and a served page for one alternate keyed by version, shot name and revision.
- [ ] 3.3 `options` on a comment (2, 3 or 4, default 3), the one-asking-shot-per-version rule, and the batch heading `Shot 04 · 3 alternates`.
- [ ] 3.4 `shot-alternate` and `shot-alternate-dismiss` operations, with undo, and a length change that moves later shots.
- [ ] 3.5 `alternate` on frame pins, the display rule, and carry.
- [ ] 3.6 Batch lines for the alternate in the reel, each dismissed alternate with its reason, and pins on alternates.
- [ ] 3.7 `kinotta build` carries undismissed alternates forward when the agent's manifest leaves that shot's alternates out.
- [ ] 3.8 The Storyboard, built to `docs/mockups/2026-10-13-alternates-in-storyboard.html` steps 2 and 3: one card per shot with the alternates strip; the enlarged shot with its strip, "Use", "Not this" with an optional reason, Up and Down to step alternates; the top-bar count of shots that need a choice. The span pin in the mockup's step 1 is out of scope. Unchosen, undismissed alternates travel forward, which is newer than the mockup's caption saying they stay in the version; follow this brief.
- [ ] 3.9 Docs: `CONTEXT.md` (Alternate), `server/core/README.md`, the skill's guidance for answering an options request.
- [ ] 3.10 Every acceptance criterion in the plan's Goal has a test that names it, and the plan's "Checks to run" are green.

## Context

**What Kinotta is.** A local review editor for motion graphics and footage edits. A reel has versions. Each version is a folder `reels/<reel>/v<n>/` holding `index.html` and `shots.json` under the timing contract (`docs/adr/0001-timing-contract.md`): timed scenes (`data-scene`, `data-start`, `data-duration`), named elements (`data-el`), and a global `seek(seconds)`. Read `CONTEXT.md` for the vocabulary and `server/core/README.md` for the core's public interface before starting.

**Repo rules.**

- All behaviour lives in `server/core` with no HTTP imports. Code outside it imports from `server/core/index.ts` only. The web editor talks to the server through the one client in `web/src/api`.
- A new kind of edit is one member of the `Operation` union and one apply function in `server/core/_internal/edit-model.ts`.
- Components in `web/src/review/_internal` each have a `.verify.ts` neighbour. Follow that pattern for new ones.
- UI copy uses the words in `CONTEXT.md`. The word is "alternate". Never "take".
- `DESIGN.md` governs the editor's look: its colour tokens, zero radius, Outfit for text and Doto for numbers and timecodes. The ice blue marks state only and never fills a surface. No em dashes in interface copy.
- WCAG 2.1 AA: every new control is reachable and operable by keyboard and has an accessible name.
- Name a value when its meaning is not obvious where it is used. Match the surrounding style, naming and comment density. No unrelated refactors.
- The owner intends to open source this repo. Add no dependency, and commit nothing that cannot be redistributed.
- AIMovieStudiov2 is AGPL-3.0. Do not look for it or copy from it. Everything here is built from Kinotta's own code.

**Decisions already made. Do not reopen them.**

- A version is frozen only by a Final or Overlay render or a comment hand-off, and only if the working content differs from the last frozen content. A Draft never freezes one. There is no manual checkpoint.
- A parts version is a manifest naming one revision per shot plus a shared revision. An unchanged shot is not copied. A shot has a fixed name; its number is its position.
- Each version still holds one assembled `index.html`. Do not use an iframe per shot: renders load pages from `file://`, where a host page cannot call a frame's `seek`, and element pinning reads one document.
- When a shot changes length, later shots move. Sound moves only if attached to a shot that moved.
- One comment batch per hand-off, grouped by shot.
- Code-built reels only. No transition that needs two shots on screen at once.
- One shot per version may ask for options: 2, 3 or 4 alternates, default 3. Alternates may differ in length. Unchosen alternates travel into the next version until dismissed. A shot with no choice made is a reminder and blocks nothing.

**Environment.**

- Windows 11, Node 20 or later. `node_modules` is linked into this worktree.
- `reels/`, `footage/` and `.kinotta-server.json` do not exist here. They are untracked in the main checkout on purpose. Use `tests/fixtures` and build new fixture reels under it.
- Commands: `npm run typecheck`, `npm run build`, `npx vitest run <files> --maxWorkers=1`, `npx playwright test <files> --workers=1` (it builds the UI first). The full Vitest suite has shown three timing failures that pass in isolation; rerun a failing file alone before treating it as a regression, and report both results.
- Some tests need ffmpeg, Python 3 and Playwright's Chromium. If a tool is missing, say so under Test evidence and do not skip or weaken the test.

**Type changes this lane makes and must carry through.** All consumers are yours, tests included.

- `Operation`: every operation gains who made it; new `shot-alternate` and `shot-alternate-dismiss`.
- `Shot`: gains optional `name`, `revision`, `alternates`. Optional because contract 1 versions do not have them, not to avoid a companion edit.
- `FramePin` and `NewFramePin`: gain optional `shotName` and `alternate`, optional because saved pins from before lack them.
- `Comment` and `NewComment`: gain optional `options`.
- Save becomes a freeze: `server/core/index.ts`, the HTTP handler, the API client and their callers change together.

## Contract

- Work ONLY this brief. No scope creep, no drive-by refactors.
- Edit ONLY the files listed above. Files outside this list remain out of scope, whether another lane owns them or not.
- If a type change requires an out-of-scope edit, stop the affected item and report it under Deviations: type or signature, affected paths, required edits, and the blocked acceptance criteria. Continue only independent in-scope items. Do not make required fields optional, add fallback values, use casts, or suppress errors merely to stay inside the list. Preserve the intended contract.
- If Part 1 is not complete and green, do not start Part 2. If the Part 2 stop gate (2.2) fails, do not continue Part 2 or start Part 3. Report and stop.
- TDD: failing test first, then the minimal implementation, matching existing style.
- Run typecheck and the relevant tests. Get them green for completed work. Paste commands and output under Test evidence, per part. Do not mark an acceptance box complete or claim a part passes when it does not.
- NEVER commit, push, branch, or run any git write. Leave the tree dirty.
- Record anything done differently, and why, under Deviations.

## Done when

- Every checklist box above is ticked, or the run has stopped at a gate and says so in the stop report.
- `npm run typecheck` and `npm run build` pass.
- Each part's "Checks to run" from its plan pass, run with one worker, with the commands and output pasted under Test evidence.
- Every existing single-page fixture reel still opens, checks and renders as it did before the run.
- `git status` shows changes only inside the files this brief allows, and `git log` shows no new commit.

## Stop report

Write this at the end of the run, whether it finished or stopped early, as the last section of this file:

1. Which part and checklist item the run reached, and whether it finished or stopped at a gate.
2. Per part: what was built, and which acceptance criteria are met, with the test that proves each.
3. Anything that passes its tests but that you doubt is correct, and why.
4. Every deviation from the brief or the plans.
5. What a reviewer should look at first.

## Test evidence

(The executor fills this in, one subsection per part.)

## Deviations

(The executor fills this in.)
