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

- [x] 1.1 Durable working-state identity and history (plan step 1). Before changing behaviour, write the stored representation that tells the working reel from the last frozen version as a comment block at the top of `server/core/_internal/edit-list.ts`, with a round-trip test and a crash-recovery test. Cover a legacy pending edit list reopened without applying its operations twice, undo and redo across a freeze, and an agent rebuild without double application. Files: `server/core/_internal/edit-list.ts`, `state.ts`, `types.ts`, `tests/core`.
- [x] 1.2 The freeze boundary, extracted from Save (plan step 2). Unchanged content reuses the frozen version; undoing back to frozen content reuses it; missing media, concurrent edits and an interrupted publish leave no half-built version. Files: `save.ts`, `version-build.ts`, `code-edits.ts`, `tests/core`.
- [x] 1.3 Final and Overlay renders freeze through the boundary; a Draft captures the working reel into temporary job storage without adding a version, and its inputs are removed on completion, failure and cancel (plan step 3). A render of an explicit older version is unchanged. Files: `render.ts`, `render-queue.ts`, `runner.ts`, `tests/core`.
- [x] 1.4 A comment hand-off freezes, maps comments onto the frozen version, then writes the batch (plan step 4). Later edits keep applying and replay onto the agent's next version; conflicts show through the existing flagged-operation flow. Files: `batch.ts`, `carry.ts`, `comments.ts`, `tests/core`.
- [x] 1.5 Every operation records who made it. An operation added through the CLI or HTTP by an agent carries the agent's name; one made in the editor carries `you`. Add `kinotta edit <reel> --by <name> <operation json>` so an agent can add one operation to the working reel. Files: `edit-model.ts`, `edit-list.ts`, `server/cli.ts`, `server/http/_internal/handler.ts`, `tests/core`.
- [x] 1.6 The Review screen, built to `docs/mockups/2026-10-14-working-reel.html` option A (plan step 5): Working is the top row of the Versions list and is lit when open, with a line such as "3 edits since v16"; each frozen version below says what froze it (Final render, Comments to the agent, Built by the agent's name); Save and Discard are removed; the render menu reads "Draft of Working" and "Final, freezes as v<n>"; a frozen version shows one line, "You are viewing v<n>, a frozen version." with a "Back to Working" button, and its editing tools are off. The Edits list shows who made each edit. Files: `web/src/App.tsx`, `web/src/review/_internal/**`, `web/src/Renders.tsx`, `web/src/api/**`, `web/src/styles.css`, `web/src/review/review.css`, `tests/web`, `tests/e2e`.
- [x] 1.7 Docs (plan step 6): `server/core/README.md`, `CONTEXT.md` (Version, Save, Edit list, and a Working reel term), ADR 0003 revised, `skill/kinotta/SKILL.md`, `skill/kinotta/reference/sound.md` and `native-media.md` no longer telling the agent that every change is a new version.
- [x] 1.8 Every acceptance criterion in the plan's Goal has a test that names it, and the plan's "Checks to run" are green.

### Part 2: shots as parts

Plan steps 1 to 9, as written.

- [x] 2.1 Contract 2 manifest reading and validation, with computed starts. Single-page fixtures stay green.
- [x] 2.2 The assembler: a pure function from a manifest and revision folders to one HTML string. Tests: same input gives the same bytes; the output passes `scanPage` and `checkShotsAgainstPage`; a `shot.css` rule not scoped under its own `[data-scene]` is refused. **Stop gate:** build a three-shot fixture reel and prove in a browser test that the assembled page seeks, plays and pins before going further. If it cannot keep contract 1, stop Part 2 and Part 3 here and report under Deviations.
- [x] 2.3 Publishing a parts version through stage-and-rename, and `kinotta build <reel>`.
- [x] 2.4 `kinotta check` and the render gate on a parts version, including a manifest that names a missing revision.
- [x] 2.5 Change detection from manifests, including a change to the shared folder reported as changing every shot.
- [x] 2.6 `shotName` on pins, and carry by name across an added, a removed and a reordered shot.
- [x] 2.7 Batches grouped by shot, opening with a `Rebuild:` line naming the shots that have comments.
- [x] 2.8 A Draft render of a parts fixture, proving `skill/kinotta/engine/render.js` needs no change. Do not edit that file.
- [x] 2.9 Docs: a new ADR `docs/adr/0006-shots-are-parts.md`, `CONTEXT.md` (Revision; Shot and Version updated), `server/core/README.md`, `skill/kinotta/SKILL.md`, `skill/kinotta/reference/contract.md`.
- [x] 2.10 Every acceptance criterion in the plan's Goal has a test that names it, and the plan's "Checks to run" are green.

### Part 3: alternates

Plan steps 1 to 9. Step 10's critique, audit and summary are the reviewer's.

- [x] 3.1 `alternates` in the manifest: reading, validation and `kinotta check` messages.
- [x] 3.2 The assembler's revision override, and a served page for one alternate keyed by version, shot name and revision.
- [x] 3.3 `options` on a comment (2, 3 or 4, default 3), the one-asking-shot-per-version rule, and the batch heading `Shot 04 · 3 alternates`.
- [x] 3.4 `shot-alternate` and `shot-alternate-dismiss` operations, with undo, and a length change that moves later shots.
- [x] 3.5 `alternate` on frame pins, the display rule, and carry.
- [x] 3.6 Batch lines for the alternate in the reel, each dismissed alternate with its reason, and pins on alternates.
- [x] 3.7 `kinotta build` carries undismissed alternates forward when the agent's manifest leaves that shot's alternates out.
- [x] 3.8 The Storyboard, built to `docs/mockups/2026-10-13-alternates-in-storyboard.html` steps 2 and 3: one card per shot with the alternates strip; the enlarged shot with its strip, "Use", "Not this" with an optional reason, Up and Down to step alternates; the top-bar count of shots that need a choice. The span pin in the mockup's step 1 is out of scope. Unchosen, undismissed alternates travel forward, which is newer than the mockup's caption saying they stay in the version; follow this brief.
- [x] 3.9 Docs: `CONTEXT.md` (Alternate), `server/core/README.md`, the skill's guidance for answering an options request.
- [x] 3.10 Every acceptance criterion in the plan's Goal has a test that names it, and the plan's "Checks to run" are green.

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

### Part 1 (complete)

TDD red runs: `npx vitest run tests/core/working-state.test.ts --maxWorkers=1` initially failed all four identity/history tests because `freezeEdits` did not exist. The boundary cases then failed reuse, concurrent-freeze reuse, missing dependencies, interrupted-stage cleanup and missing footage before their implementations. `npx vitest run tests/core/working-render.test.ts --maxWorkers=1` initially failed all five tests because `renderWorking` did not exist. `working-handoff.test.ts` initially failed all four hand-off cases. `operation-authors.test.ts` initially failed all three author/CLI cases.

```text
npm run typecheck
> kinotta@0.1.0 typecheck
> tsc --noEmit
(exit 0)

npx vitest run tests/core/working-state.test.ts tests/core/working-render.test.ts tests/core/working-handoff.test.ts tests/core/batch.test.ts tests/core/section-batches.test.ts --maxWorkers=1
Test Files 1 failed | 4 passed (5)
Tests 1 failed | 53 passed (54)
The failure was the repeated section hand-off, which exposed a missing stored content identity for legacy footage. Fixed before the next run.

npx vitest run tests/core/operation-authors.test.ts tests/core/working-state.test.ts tests/core/working-handoff.test.ts tests/core/section-batches.test.ts --maxWorkers=1
Test Files 4 passed (4)
Tests 45 passed (45)
Duration 27.32s

npx vitest run tests/core/working-render.test.ts --maxWorkers=1
Test Files 1 passed (1)
Tests 5 passed (5)
Duration 15.53s

npx vitest run tests/core/code-only-edits.test.ts tests/core/save-review-fixes.test.ts tests/core/contract.test.ts --maxWorkers=1
Test Files 3 passed (3)
Tests 40 passed (40)
Duration 14.95s

npx vitest run tests/core/working-state.test.ts tests/core/code-only-edits.test.ts tests/core/graphic-media-save.test.ts --maxWorkers=1
Test Files 3 passed (3)
Tests 19 passed (19)
Duration 8.07s
```

Additional checks:

```text
npx vitest run tests/core/media-speech.test.ts tests/core/working-handoff.test.ts --maxWorkers=1
Test Files 2 passed (2)
Tests 11 passed (11)
Duration 15.75s
The cached-speech pin test failed with no matching transcript word before live validation filled available cached words. Its hand-off then exposed an unchanged-initial-version reuse incorrectly swallowing newly captured speech, also fixed.

npx playwright test -c tests/e2e/part1.config.ts --workers=1
21 passed, 4 failed (3.0m)
The four remaining assertions expected cleared history or Save-era metadata. After fixing those expectations:
$env:KINOTTA_PART1_PORTS='4385'
npx playwright test -c tests/e2e/part1.config.ts snip-save -g 'snip a stretch|Undo removes|a word is fixed|dragging a caption' --workers=1
4 passed (25.7s)
Full outputs: tests/part1-e2e.log and tests/part1-e2e-snips.log.

node C:/Users/ryand/.codex/skills/impeccable/scripts/detect.mjs --json web/src/App.tsx web/src/Renders.tsx web/src/review/_internal/Review.tsx web/src/review/_internal/MediaEditor.tsx web/src/review/_internal/EditsPanel.tsx web/src/styles.css
Only advisory font-size findings in unchanged stylesheet lines (70–536). No findings in the added Working styles or components. No critique or audit was run.
```


```text
npx vitest run tests/core/working-handoff.test.ts tests/core/working-state.test.ts tests/core/working-render.test.ts tests/core/operation-authors.test.ts tests/core/snip-save.test.ts tests/core/code-media-save.test.ts tests/core/graphic-media-save.test.ts --maxWorkers=1
Test Files 7 passed (7)
Tests 62 passed (62)
Duration 72.39s

npm run typecheck
> tsc --noEmit
(exit 0)

npm run build
99 modules transformed, built in 509ms
(exit 0, existing chunk-size warning)

npx playwright test -c tests/e2e/working.config.ts --workers=1
2 passed (5.0s)
Includes live author events, reopen, immutable native view, verification invariants and intentionally failing fixture mutations.
```

The existing browser suite initially found stale Save controls and closed-caption selectors. Its Working-time pin regression failed with 1.75 instead of 3.75 before the UI captured current time and source anchors. Part 1 verification is complete. All 109 Vitest files have passing coverage across the full run and focused reruns. The full run had 802 passes, seven failures and one existing skip. The seven failing files were rerun independently before fixes: the beats scenario passed unchanged in 22.20s. The other six failures were old UI/history assertions or the Overlay fixture missing its required `alpha` class. Their focused rerun passed 19 of 20 tests, then the remaining replay selector was corrected to its actual accessible name and passed alone. No production behavior changed after the comprehensive run except the tested mobile layout correction.

```text
npx vitest run --maxWorkers=1
Test Files 7 failed | 102 passed (109)
Tests 7 failed | 802 passed | 1 skipped (810)
Duration 1126.55s
Full output: tests/part1-vitest.log

Individual failing-file runs: tests/part1-isolated-*.log
render-media-beats-editor.test.ts: 1 passed, Duration 22.20s (unchanged timing rerun)

npx vitest run tests/core/brief-reel.test.ts tests/core/working-render.test.ts tests/core/render-editor-keys-drag.test.ts tests/core/render-media-elements.test.ts tests/core/render-media-replay.test.ts tests/core/render-overload.test.ts --maxWorkers=1
Test Files 1 failed | 5 passed (6)
Tests 1 failed | 19 passed (20)
Duration 92.64s
The sole remaining failure was the test's Remove selector, whose accessible name is Remove edit 1. Corrected before the next command.

npx vitest run tests/core/render-media-replay.test.ts --maxWorkers=1
Test Files 1 passed (1)
Tests 1 passed (1)
Duration 4.28s

npx playwright test -c tests/e2e/working.config.ts --workers=1
2 passed (6.0s)
Includes author names, live agent edits, reopen, frozen tools, exact native capture, verification invariants with deliberate invalid fixtures, no horizontal overflow at 1440/768/390px, visible Working navigation and an Edits panel after rather than over the timeline on narrow screens.
Screenshots inspected: tests/artifacts/working/working-1440.png, working-768.png, working-390.png, frozen-desktop.png.
The new overlap test failed with the panel 469px above the timeline end before the mobile wrapper sizing fix. The navigation visibility test also failed before preserving the expanded mobile rail's height.

npm run typecheck
> tsc --noEmit
(exit 0)

npm run build
99 modules transformed, built in 451ms
(exit 0, existing chunk-size warning)

Final mechanical design detector
31 advisory design-system-font-size findings in unchanged CSS, no other finding types.
Full output: tests/part1-design-findings.json

git log -1 --oneline
bd31368 docs: prepare the Codex goal run and approve its plans
```

Acceptance coverage: Working state/history/restart/legacy migration and unchanged content are named in working-state.test.ts. Draft isolation and cleanup, Final/Overlay boundaries and explicit old renders are named in working-render.test.ts. Frozen hand-off, later edits, conflicts and pin mapping are named in working-handoff.test.ts and media-speech.test.ts. Named authors, default you, CLI and HTTP behavior are named in operation-authors.test.ts. The Working browser cases prove the chosen UI, frozen tools and responsive behavior. Existing single-page/footage/core/engine/render suites passed in the comprehensive run or the focused reruns above.

### Part 2 (in progress)

Manifest reading was tested red first: parts-manifest.test.ts failed eight of ten cases because contract 2 was read as contract 1. After implementation:

```text
npx vitest run tests/core/parts-manifest.test.ts tests/core/contract.test.ts tests/core/version.test.ts --maxWorkers=1
Test Files 3 passed (3)
Tests 40 passed (40)
Duration 3.94s

npm run typecheck
> tsc --noEmit
(exit 0)
```

The assembler had nine failing tests before implementation. Inline modules isolate each shot's local variables, and relative asset references retain their immutable revision bases. The portable-name and fractional-time tests then failed before case-collision/reserved-name checks and exact running-sum timing were added.

```text
npx vitest run tests/core/parts-manifest.test.ts tests/core/parts-assembler.test.ts tests/core/contract.test.ts tests/core/version.test.ts --maxWorkers=1
Test Files 4 passed (4)
Tests 52 passed (52)
Duration 4.67s

npm run typecheck
> tsc --noEmit
(exit 0)

npx playwright test -c tests/e2e/parts.config.ts --workers=1
stop gate: the three-shot assembled page seeks from file, plays in Review and accepts a named element pin
1 passed (8.4s)
Full output: tests/part2-stop-gate.log
```

The item 2.2 stop gate passed: direct file:// seeks activate each of the three scenes at local 0.25s, the existing Review transport plays across a shot boundary, and the Storyboard sheet saves a pin on the proof shot's named label. No page errors occurred. This proves the single-document module design before publication, change detection or alternates are built.


Resumed publication verification on 2026-10-14:

```text
npx vitest run tests/core/parts-build.test.ts tests/core/parts-manifest.test.ts tests/core/parts-assembler.test.ts tests/core/contract.test.ts tests/core/version.test.ts tests/core/operation-authors.test.ts --maxWorkers=1
Test Files 6 passed (6)
Tests 63 passed (63)
Duration 9.41s

npm run typecheck
> tsc --noEmit
(exit 0)
```

Item 2.3 proves twelve-shot selective revision publication, first publication, failed-stage preservation of Working history, CLI and HTTP build entry points, revision asset serving, and frozen offsets and sound inheritance.

Further Part 2 TDD evidence: missing revision and asset tests failed before revision dependency validation. Published-revision tamper failed before publication fingerprints. Shared-change detection failed for byte-identical shared revisions before manifest comparison. Both named-pin tests failed before shotName carry. The grouped batch failed before Rebuild headings. Timing freeze failed with three parts-start issues before parts-aware reassembly. The sound timing test failed before sequence normalization. Working Storyboard metadata and the browser still failed before the generated Working page. The owner-offset browser test failed when the fixture animation wrote individual translate; it passes with transform animation, as documented.

```text
npx vitest run tests/core/parts-build.test.ts tests/core/parts-manifest.test.ts tests/core/parts-assembler.test.ts tests/core/parts-changes.test.ts tests/core/parts-carry.test.ts tests/core/parts-batch.test.ts tests/core/parts-sound.test.ts tests/core/contract.test.ts tests/core/version.test.ts tests/core/batch.test.ts tests/core/section-batches.test.ts tests/core/code-only-edits.test.ts tests/core/working-state.test.ts tests/core/working-handoff.test.ts tests/core/render-queue.test.ts --maxWorkers=1
Test Files 15 passed (15)
Tests 139 passed (139)
Duration 110.80s
Full output: tests/part2-focused.log

Earlier combined run: section-batches had one 5000ms timeout, 52 other tests passed. Isolated rerun:
npx vitest run tests/core/section-batches.test.ts --maxWorkers=1
Test Files 1 passed (1), Tests 28 passed (28), Duration 41.54s

npx vitest run tests/core/parts-render.test.ts --maxWorkers=1
Test Files 1 passed (1), Tests 1 passed (1), Duration 10.50s
An actual three-shot Working Draft completed, left no v2 or capture, and render.js stayed byte-identical.

npx vitest run tests/core/parts-build.test.ts --maxWorkers=1
Test Files 1 passed (1), Tests 12 passed (12), Duration 4.99s
Includes exact Working-page serving added after the 139-test run.

npx playwright test -c tests/e2e/parts.config.ts --workers=1
3 passed (6.6s)
Full output: tests/part2-browser.log
Includes the original gate, visual animation/offset composition, and trimmed Working Storyboard still timing with executed invariants and a deliberately incorrect count rejected.

npm run typecheck
> tsc --noEmit
(exit 0)

npm run build
99 modules transformed, built in 484ms
(exit 0, existing chunk-size warning)

Mechanical UI detector: no findings.
Full output: tests/part2-design-findings.json

git log -1 --oneline
bd31368 docs: prepare the Codex goal run and approve its plans
```

Item 2.10 remains open pending the existing-fixture browser checks, final relevant regressions after Working integration, and remaining edge-case validation. Part 3 has not started.

```text
npx playwright test -c tests/e2e/part2-existing.config.ts --workers=1
24 passed, 1 failed (1.0m)
Full output: tests/part2-existing-browser.log
The one failure was the snipped-playback fixture asking native editor assertions while viewing a frozen legacy page, with an incomplete per-version plan. The isolated test reproduced it before fixing the fixture and opening Working.

npx playwright test -c tests/e2e/part2-existing.config.ts review -g 'playback follows' --workers=1
1 passed (14.2s)
Full output: tests/part2-review-rerun.log
Together these cover the existing storyboard, pins, review and renders specs.

npx vitest run tests/core/parts-build.test.ts tests/core/working-state.test.ts tests/core/working-handoff.test.ts --maxWorkers=1
Test Files 3 passed (3), Tests 31 passed (31), Duration 18.89s
The new Undo-after-freeze offset case first failed by restoring 10px after an agent build, then passed after replay retained its reversal.

npm run typecheck
> tsc --noEmit
(exit 0)
```

Part 2 acceptance is complete. The named new tests cover selective twelve-shot publication, deterministic generated pages, immutable revision validation, name carry across addition/removal/reorder, sequence timing and attached versus fixed sound, shared changes, grouped batches, CLI build/check and unchanged single-page reading. The actual Draft and browser gates cover render compatibility, stills, playback, pins, offsets and Working timing. Existing contract/version, save/media, replay, batches and render queue coverage passed in the runs recorded here. Existing storyboard/pins/review/renders browser coverage passed across the full run and the corrected isolated rerun, not one all-green combined browser invocation.

```text
npx vitest run tests/core/parts-render.test.ts tests/core/code-media-save.test.ts tests/core/graphic-media-save.test.ts tests/core/save-review-fixes.test.ts tests/core/snip-save.test.ts tests/core/media-model.test.ts tests/core/media-attachments.test.ts tests/core/edit-list.test.ts tests/core/edit-model.test.ts --maxWorkers=1
Test Files 8 passed (8), Tests 220 passed (220), Duration 56.93s
Full output: tests/part2-final-core.log
The nonexistent edit-list.test.ts selector matched no file. Working-state tests provide journal coverage separately.

npx vitest run tests/core/parts-carry.test.ts tests/core/parts-build.test.ts tests/core/media-pins.test.ts --maxWorkers=1
Test Files 3 passed (3), Tests 16 passed (16), Duration 7.05s

npm run typecheck
> tsc --noEmit
(exit 0)
```

### Part 3 (complete)

Alternate-manifest tests failed all eight cases before reading and validation. Alternate-page tests failed before the core/HTTP page existed. A further unchosen-CSS test failed before publication validated every offered alternate. Options tests failed all three cases before storing and enforcing requests. Both choosing/dismissing tests failed before the new operations were implemented.

```text
npx vitest run tests/core/alternates-manifest.test.ts tests/core/parts-manifest.test.ts tests/core/parts-build.test.ts --maxWorkers=1
Test Files 3 passed (3), Tests 34 passed (34), Duration 5.96s

npx vitest run tests/core/alternates-page.test.ts tests/core/alternates-manifest.test.ts tests/core/parts-build.test.ts tests/core/parts-assembler.test.ts --maxWorkers=1
Test Files 4 passed (4), Tests 33 passed (33), Duration 6.29s

npx vitest run tests/core/alternates-comments.test.ts tests/core/parts-batch.test.ts tests/core/working-handoff.test.ts tests/core/batch.test.ts --maxWorkers=1
Test Files 4 passed (4), Tests 18 passed (18), Duration 15.20s

npx vitest run tests/core/alternates-edits.test.ts tests/core/parts-sound.test.ts tests/core/parts-build.test.ts tests/core/edit-model.test.ts --maxWorkers=1
Test Files 4 passed (4), Tests 50 passed (50), Duration 6.21s
```
Additional Part 3 TDD: both alternate-pin cases, batch feedback, and both travelling-alternate cases failed before implementation. A fifth travelling option initially produced a generic Error instead of an invalid-manifest error. The regression now passes without publishing. The initial UI interaction tests failed before controls existed. Stronger removed-shot feedback checks exposed misplaced pins and omitted orphan batch text, both fixed. The transparent-parts Overlay test failed before alpha support.

```text
npx vitest run tests/core/alternates-manifest.test.ts tests/core/alternates-page.test.ts tests/core/alternates-comments.test.ts tests/core/alternates-edits.test.ts tests/core/alternates-pins.test.ts tests/core/alternates-batch.test.ts tests/core/alternates-build.test.ts tests/core/contract.test.ts tests/core/comments.test.ts tests/core/parts-carry.test.ts tests/core/batch.test.ts tests/core/section-batches.test.ts tests/core/working-state.test.ts tests/core/working-handoff.test.ts tests/core/edit-model.test.ts tests/core/parts-build.test.ts tests/core/parts-assembler.test.ts tests/core/parts-manifest.test.ts tests/core/parts-changes.test.ts --maxWorkers=1
Test Files 19 passed (19), Tests 178 passed (178), Duration 59.82s
Full output: tests/part3-final-core.log

npx playwright test -c tests/e2e/alternates.config.ts --workers=1
4 passed (18.9s)
Full output: tests/part3-browser-final.log
Includes live choice/dismissal/Undo, alternate pin display and identity, options default and one-shot explanation, and dark/light shells at 390, 768, 1024, 1272 and 1600px. Real DOM invariants run and deliberately invalid attributes fail them.

npx playwright test -c tests/e2e/alternates.config.ts -g 'fit dark and light' --workers=1
1 passed (14.0s)
Full output: tests/part3-capture-validity.log
Full enlarged sheets recaptured where the initial viewport clipped the screenshot. Screenshots inspected under tests/artifacts/alternates.

npx playwright test -c tests/e2e/part3-existing.config.ts --workers=1
33 passed (1.1m)
Full output: tests/part3-existing-browser.log
Existing storyboard, pins, review and editing specs.

npx playwright test -c tests/e2e/alternates.config.ts -g 'offers alternates|pins are visible|asks for options' --workers=1
3 passed (8.3s)
Full output: tests/part3-alternates-regression.log

npx vitest run tests/core/parts-assembler.test.ts tests/core/alternates-page.test.ts tests/core/parts-batch.test.ts tests/core/alternates-batch.test.ts tests/core/alternates-pins.test.ts tests/core/parts-carry.test.ts tests/core/batch.test.ts tests/core/parts-render.test.ts --maxWorkers=1
Test Files 8 passed (8), Tests 28 passed (28), Duration 60.74s
Full output: tests/part3-final-regression.log

npx playwright test -c tests/e2e/parts.config.ts --workers=1
5 passed (9.2s)
Full output: tests/part3-parts-regression-final.log
Final assembled file/browser gate, asynchronous seek, animation/offset composition, Working trim and removed-shot pin isolation.

npm run typecheck
> tsc --noEmit
(exit 0)

npm run build
99 modules transformed, built in 555ms
(exit 0, existing chunk-size warning)
```

The async-seek browser test first failed because the global seek discarded the shot's Promise. Returning inside the scene loop was an incomplete fix. It now updates every scene and returns the active result after the loop. Playback's short fixture also exposed a test timing assumption: waiting on the host playhead and then pausing could pass the proof shot. The final gate observes proof active during playback, then verifies the paused frame against its actual paused time. Initial full and isolated failures are retained in tests/part3-gate-isolated.log and tests/part3-async-seek-red.log. The final five-test run is green.

The first shell matrix reported overflow at 390 and 768px in both themes. The parts-only shell and sheet sizes were corrected before the passing matrix. Two visual rounds were used, followed by capture-validity recaptures. The mechanical detector reported 39 advisory font-size findings, and no other finding type, in tests/part3-design-findings.json. These include existing sizes and accessible new 14/16px controls. No critique or audit was performed.

Final verification:

```text
npx vitest run tests/core/parts-assembler.test.ts tests/core/parts-render.test.ts --maxWorkers=1
Test Files 2 passed (2), Tests 11 passed (11), Duration 49.45s
Full output: tests/part3-assembler-render-final.log
Final runtime regression and actual Draft/Overlay renders after the async-seek correction. Both render tests compare the engine bytes and retain the unchanged engine.

Read-only scope check of git diff --name-only and git ls-files --others --exclude-standard:
Scope check: all changed and untracked files are allowed.
git diff --exit-code -- skill/kinotta/engine/render.js
(exit 0)
git log -1 --oneline
bd31368 docs: prepare the Codex goal run and approve its plans
```

## Deviations

- The existing `saveEdits` path remained temporarily available during migration, and has now been removed from the public core, HTTP and UI. The new freeze boundary retains history and does not write edits back into the authored sources.
- Capture helper plumbing was added ahead of the failing `renderWorking` behavior tests. All five externally observable render behaviors were tested failing before implementing that public path.
- The active app goal was already created from the user's `/goal` message, with the handoff path as its objective. A second `create_goal` was refused because an unfinished goal exists. This run follows the brief's "Goal to set" text under that existing goal.



- The frozen-offsets/sound-preservation publication case was added after its implementation. The six initial publication cases were red before buildParts existed. The authored input manifest lives at the reel root as shots.json, while each frozen version keeps its own manifest. The Part 2 documentation will distinguish those paths.

- Parts publication adds generated revisionHashes inside the manifest to detect immutable-revision tampering without copying unchanged folders. Existing manifests without fingerprints still open. The shared media model retains its attachment field and gains generated shotAnchors for resolving named shot-local moments. Parts Working Storyboard pages are assembled on demand without publishing a version.

- Undo of a consumed frozen offset now replays its desired value onto an agent build. Other consumed reversals with changed source semantics are explicitly flagged for review rather than silently discarded. The undo-after-freeze doubt was confirmed for offsets and fixed with a red-first test. This conservative conflict behavior is a limitation reviewers should inspect.

- The lane has no reels/kinotta-showcase by design. Existing showreel/footage fixtures and the requested single-page browser specs provide compatibility verification. No real reel was edited or created in the main checkout. No stop report has been written yet because the continuous run is continuing into Part 3.

- D1: The parts manifest additionally supports optional alpha for the existing Overlay page contract. This was needed to verify transparent parts renders without changing the engine. Revision hashes, choiceMade, dismissal metadata and stateReason are generated support fields for immutability, choice reminders and flagged carry.
- D2: Alternate sound movement was given an explicit test after the shared parts sequence implementation. Earlier trim and choice regressions covered that implementation before this additional acceptance case. Documentation and visual verification did not use red-first tests. UI test selectors and legacy fixture expectations were corrected where they contradicted the new Working contract.
- D3: The async shot Promise audit extended the assembler regression coverage within the existing contract. The first return implementation skipped later scene updates and was corrected. The playback gate now observes the playing scene before pausing and checks the scene at the actual paused time, instead of assuming a pause cannot cross a short shot boundary.
- D4: The parts-only shell adapts at the requested widths. The visual detector's 39 advisory font-size findings remain for reviewer judgement. No critique, audit, session summary, dashboard edit, dependency install, installed skill sync or real-reel edit was performed.

## Stop report

1. R1: Finished through Part 3, item 3.10. Every execution box is ticked. Part 2's browser stop gate passed before publication work and Part 3, and passes again at the final checkpoint. No gate stopped the run. Typecheck and build passed. All changed and untracked files are within the allowed paths. The last commit is still bd31368. The tree is intentionally uncommitted.

2. R2: Acceptance evidence by part follows. Counts and command output are recorded above. The earlier comprehensive runs had failures that were resolved or passed in isolation. This report does not claim one all-green comprehensive invocation.

| Part | Acceptance criteria built and met | Proof |
| --- | --- | --- |
| 1 | Durable Working picture, sound and undo/redo after restart. Frozen content stays exact. Legacy migration and crash recovery avoid double application. | working-state.test.ts, including round-trip, non-idempotent footage restart, migration and interrupted publication |
| 1 | Unchanged Final, Overlay and hand-off reuse content, including Undo back to frozen content. Draft captures requested inputs and cleans up on completion, failure and cancellation. Older renders stay exact. | working-state.test.ts, working-render.test.ts, working-handoff.test.ts and existing render/replay suites |
| 1 | Hand-off names frozen content, later edits replay or flag conflicts. CLI/HTTP authors and Edits UI record you or the agent. Working Versions row, frozen editing guard and render labels replace Save/Discard. | working-handoff.test.ts, operation-authors.test.ts, working.spec.ts and Part 1 browser regressions |
| 2 | Selective twelve-shot rebuild writes one revision and one version without copying unchanged shots. Generated deterministic pages pass contract checks. | parts-build.test.ts, parts-assembler.test.ts |
| 2 | Name identity follows addition, removal and reorder. Duration changes move later shots and attached sound only. Shared revisions mark all sections changed. | parts-carry.test.ts, parts-sound.test.ts, parts-changes.test.ts, edit-model.test.ts |
| 2 | Grouped batches name rebuild shots. Build/check and render gates validate dependencies, missing revisions and immutable revisions. Working stills and owner offsets remain accurate. | parts-batch.test.ts, parts-build.test.ts, parts-gate.spec.ts |
| 2 | Existing single-page fixtures retain opening/check/render behavior, with files unchanged. Parts Draft renders through the unchanged engine. | contract/version/save/media/render suites recorded above, existing browser specs, parts-render.test.ts |
| 3 | Default three options with 2/3/4 counts, one asking shot, batch request heading and clearing on authored carry. | alternates-comments.test.ts and options browser case |
| 3 | Alternate count, labels, revisions and selected duration validate. Override pages show the requested revision and keep frozen content exact. | alternates-manifest.test.ts, alternates-page.test.ts |
| 3 | One card and alternate strip, top-bar reminder, lazy live previews, shot/alternate keyboard navigation. Pins display and carry their viewed revision. | alternates.spec.ts, alternates-pins.test.ts, executed Storyboard/ShotSheet/TopBar invariants |
| 3 | Use is undoable, changes duration and later timing, moves attached sound, and freezes. Not this is undoable with optional reason and cannot dismiss the selected revision. | alternates-edits.test.ts, alternates.spec.ts |
| 3 | Batches include selected/dismissed labels, reasons and alternate pin labels. Builds retain undismissed options, exclude dismissed revisions and refuse a fifth without publishing. | alternates-batch.test.ts, alternates-build.test.ts |
| 3 | Reels without alternates and existing single-page browser flows remain compatible. Dark/light shells pass at all five widths. Draft/Overlay rendering uses the unchanged engine. | 33 existing browser tests, five parts browser tests, four alternate browser tests, parts-render.test.ts |

The requested core README, glossary, ADR and local skill/reference updates are complete for all three parts. No external skill was installed.

3. R3: Reviewer doubts and limits. Consumed frozen offsets can be undone across an agent rebuild. Other consumed reversals whose source semantics changed use the existing flagged-operation path. This conservative behavior deserves review against real agent responses. Legacy published parts manifests without revision hashes still open, so their initial immutability cannot be proven retrospectively. The font-size detector has 39 advisory findings, not a clean report. No outstanding failing required check remains.

4. R4: Deviations are recorded in the preceding section. They comprise capture plumbing before public render red tests, the earlier existing-goal setup, additional post-implementation offset/sound acceptance tests, root authored shots.json, generated revision fingerprints and shot anchors, on-demand Working pages, conservative consumed-reversal flags, absent kinotta-showcase replaced with fixture compatibility coverage, optional parts alpha and alternate support metadata, corrected legacy UI fixtures, bounded shell/capture adjustments and the async seek correction. Review-only critique/audit/session summaries, installed skill sync, dashboard changes and real-reel changes were excluded as the brief requires. No forbidden git write or engine change occurred.

5. R5: Review the durable journal and freeze/replay boundary first, especially Undo after consumed edits and hand-off concurrency. Then review parts publication, immutable hashes, alternate carry and override pages. Finally inspect the responsive Storyboard/ShotSheet screenshots and keyboard controls, including the advisory font sizes. Evidence logs and screenshots remain under tests/ for independent review.

## Review fixes

Implemented in the chain worktree only, on the existing uncommitted bd31368 tree. No git writes, dependencies, engine changes, installed skill synchronization or real-reel changes.

### Changes and regression evidence

- F1: Build now retains an authored-shots.json input snapshot beside the published manifest. It compares authored revision identities with that snapshot before deciding whether Working's choice wins. Unchanged explicit or omitted lists retain the choice, choiceMade and timing. Rebuilt answers win. Dismissal reasons persist in generated dismissedRevisions metadata after the dismissed revision leaves the offered list, so an explicit later list cannot revive it. Selecting a dismissed revision is refused and requires a new revision.
- F2: All 30 operation kinds can replay an undo after freeze. Replay reconstructs the frozen and desired states from the durable journal, then records reversals that change only the fields the undone edit changed. Named arrays follow shot, revision, track, source and placement identities. Other arrays, such as footage piece ranges and transcript phrases, reverse only when their current content still matches the frozen or desired content. Changed targets or ambiguous order changes remain flagged. Flags and reversal descriptions use describeOperation's owner-facing words. Preserved source hashes distinguish file relocation from agent changes when Undo removes newly added media. Generated reversal payloads are refused as incoming edits. The pure model preserves its inputs.
- F3: Server initialization removes abandoned .draft-* directories under its reels before accepting requests. Cleanup runs once per project per process, with a first-render fallback for direct core consumers. Read-only openProject calls never delete captures, including when used by another CLI process.
- F4: freezeSources was added to freeze graphic fragments and their dependencies against later authored-plan edits. That graphic preservation stays. Its newly added legacy-video preservation branch is removed. Legacy video paths reference the project source, with an explicit availability check. Native Draft captures also reference video without copying it and verify its content hash. Frozen native media retains its pre-existing preservation behavior under ADR 0003.
- F5: The assembled seek runtime uses the manifest's duration tolerance for the last scene, including a 0.7 + 0.1 floating-point sum at seek(0.8).
- F6: The dismissal reason cap and alternate label alphabet have names. Draft cleanup reuses the existing render cleanup retry constants. These are behavior-preserving extractions, so there is no meaningful failing behavioral test for F6.

All 30 reversal kinds have individual cases in working-reversals.test.ts: snip, cut, move-piece, word-text, word-timing, phrase-text, caption-position, caption-phrase-position, clip-trim, clip-slide, element-offset, source-beats, track-add, track-change, track-move, track-remove, placement-detach, placement-add, placement-change, placement-duck, placement-remove, placement-move, placement-layer, placement-replace, placement-split, placement-snip, clip-attachment, clip-split, shot-alternate and shot-alternate-dismiss. The first 28 use persisted freeze checkpoints to isolate replay without rendering 28 fixture versions. Both alternate cases perform actual build, freeze, Undo, build and freeze. A further real native freeze checks removal of an added source after preservation rebases its path. Additional cases cover a genuine agent conflict and multiple consumed undos followed by another live edit.

```text
npx vitest run tests/core/alternates-build.test.ts --maxWorkers=1
Before: 3 failed | 3 passed (6), tests/review-f1-red.log
After: 6 passed (6), tests/review-f1-green.log

npx vitest run tests/core/working-reversals.test.ts --maxWorkers=1
Before: 29 failed | 1 passed (30), tests/review-f2-red.log
After: 30 passed (30), tests/review-f2-green.log
The existing element-offset case already passed. Two additional replay cases were then added.

npx vitest run tests/core/working-render.test.ts --maxWorkers=1 -t 'stale Draft|without copying'
Before: 2 failed | 7 skipped (9), tests/review-f3-f4-red.log
Native video extension before its fix: 1 failed | 1 passed | 8 skipped (10), tests/review-f4-native-red.log
After: 3 passed | 7 skipped (10), tests/review-f3-f4-green.log

npx playwright test -c tests/e2e/parts.config.ts --workers=1 -g 'reel end'
Before: 1 failed, tests/review-f5-red.log
After: 1 passed, tests/review-f5-green.log

npx vitest run tests/core/working-reversals.test.ts tests/core/alternates-build.test.ts tests/core/working-state.test.ts --maxWorkers=1
1 failed | 48 passed (49), tests/review-f1-f2-green.log
The missing-footage check failed after removal of the video-copy branch. It was restored using a file availability check.

npx vitest run tests/core/working-state.test.ts --maxWorkers=1 -t 'missing footage'
1 passed | 10 skipped (11), tests/review-f4-missing-green.log
```

### Deviations and limits

- D1: Native media still copies at frozen Final/Overlay/hand-off boundaries because that behavior predates this chain and preserves exact originals under ADR 0003. Draft video is referenced, with hash validation at capture, as the handoff requires. Graphic dependencies and audio still copy to preserve the captured render inputs. Legacy project footage no longer copies at any freeze or Draft.
- D2: F6 is a behavior-preserving naming change. It is verified by the behavioral suites and typecheck, without an artificial red test that merely mirrors the implementation.
- D3: The 28 non-alternate reversal tests plant a complete durable frozen checkpoint and an agent response rather than staging actual video versions. This isolates the defective replay boundary. The two alternate regressions run the real freeze/build path.
- D4: DESIGN.md still describes the removed Save choice at line 204. It is outside the edit fence and remains unchanged. The reviewer-owned Impeccable critique/audit is not performed.
- D5: Broad verification exposed four outdated directory/path assertions in parts-build.test.ts and snip-save.test.ts, plus two repeatable browser-test synchronization faults. The expected directory contents now include authored-shots.json for parts and omit copied media for legacy footage. The layer test waits for editing to become enabled before sending Enter, and the library test polls for the new picture row after the server records its edit. The behavior assertions remain intact. No frontend implementation was changed for these test fixes.

Additional native media regression:

```text
npx vitest run tests/core/working-reversals.test.ts --maxWorkers=1 -t 'newly added source'
Before: 1 failed | 32 skipped (33), tests/review-f2-media-red.log

npx vitest run tests/core/working-reversals.test.ts --maxWorkers=1
After: 33 passed (33), tests/review-f2-final.log
```

The broad runs in tests/review-full-core.log and tests/review-full-core-final.log were interrupted while checking the startup and source-relocation cases. They are partial evidence, not completed suite results. Final verification is in tests/review-full-core-verified.log.

### Final verification

```text
npm run typecheck
> tsc --noEmit
(exit 0), tests/review-final-typecheck.log

npm run build
100 modules transformed, built in 400ms
(exit 0, existing chunk-size warning), tests/review-final-build.log

npx vitest run tests/core --maxWorkers=1 --reporter=verbose
Test Files 6 failed | 100 passed (106)
Tests 8 failed | 794 passed | 1 skipped (803)
Duration 1047.61s
Full output: tests/review-full-core-verified.log

npx vitest run tests/core/parts-build.test.ts tests/core/snip-save.test.ts tests/core/working-reversals.test.ts tests/core/working-render.test.ts tests/core/alternates-build.test.ts --maxWorkers=1
Test Files 5 passed (5), Tests 89 passed (89), Duration 65.79s
Full output: tests/review-final-focused.log

npx vitest run tests/core/render-editor-keys-drag.test.ts --maxWorkers=1
1 passed, Duration 4.33s, tests/review-isolated-drag.log

npx vitest run tests/core/render-media-beats-editor.test.ts --maxWorkers=1
1 passed, Duration 16.44s, tests/review-isolated-beats.log

npx vitest run tests/core/render-media-layer.test.ts --maxWorkers=1
Before readiness fix: 1 failed, Duration 32.95s, tests/review-isolated-layer.log
After readiness fix: 1 passed, Duration 18.57s, tests/review-layer-ready.log

npx vitest run tests/core/render-media-library.test.ts --maxWorkers=1
Before DOM wait fix: 1 failed, Duration 5.34s, tests/review-isolated-library.log
After DOM wait fix: 1 passed, Duration 6.42s, tests/review-library-ready.log

npx playwright test -c tests/e2e/part3-existing.config.ts --workers=1
33 passed (57.4s), tests/review-existing-browser.log

npx playwright test -c tests/e2e/alternates.config.ts --workers=1
4 passed (21.2s), tests/review-alternates-browser.log

npx playwright test -c tests/e2e/parts.config.ts --workers=1
6 passed (8.2s), tests/review-parts-browser.log

npx playwright test -c tests/e2e/working.config.ts --workers=1
2 passed (5.5s), tests/review-working-browser.log
```

The full core invocation did not pass as one run. Its four directory/path assertion failures passed in the corrected focused run. Drag and beat detection passed when isolated. Layer selection and library-row display failed again in isolation, then passed after the synchronization corrections in D5. All eight failed cases were rechecked successfully. The one skip is the existing opt-in real faster-whisper integration (`KINOTTA_REAL_WHISPER=1` was not enabled). No test was newly skipped or weakened.

Compared with the earlier checkpoint of 19 files and 178 tests, that same group now contains 181 tests, including three new alternate-build cases. Its broad-run results were 179 passed and two expected-directory failures in parts-build.test.ts. That entire file passes in the final focused run. The separate new reversal file adds 33 cases and is also green. The full core run covers 106 files and 803 cases, rather than only the checkpoint group.

Actual parts renders passed in the full core run: transparent Overlay (34116ms) and three-shot Working Draft (6718ms), both through the unchanged engine. Additional footage and single-page Draft/Final/Overlay tests also ran. The 45 targeted browser tests cover existing behavior, alternates, parts including the end-frame regression, and Working history.

All ten tracked engine files match HEAD after normalizing checkout line endings. Their raw SHA-256 hashes recorded in tests/review-engine-hashes.json are unchanged after verification. A read-only scope check found no changed or untracked file outside the brief's edit fence. HEAD remains bd31368. No git write was performed.



### Review stop report

| Finding | Failing-then-passing regression | Changed implementation |
| --- | --- | --- |
| F1 | `keeps the frozen owner choice when the authored entry is unchanged (omitted/explicit)` and `uses a rebuilt explicit answer and never reoffers an explicitly listed dismissed revision` | `server/core/_internal/parts-build.ts:25`, `server/core/_internal/parts.ts:77`, `server/core/_internal/types.ts:42` |
| F2 | The 30 per-kind `replays Undo of frozen ...` cases. Element offset was already green. The added-source real freeze failed on preserved paths, then passed. Conflict and multiple-undo cases also pass. | `server/core/_internal/edit-list.ts:175`, `server/core/_internal/edit-model.ts:1015`, `server/core/_internal/edit-reversal.ts:14` |
| F3 | `removes stale Draft captures at server startup without letting read-only project access delete captures` | `server/core/_internal/render-queue.ts:109`, `server/http/_internal/handler.ts:335`, `server/core/index.ts:128` |
| F4 | `captures a legacy/native footage Draft without copying the footage`, plus the restored missing-footage guard | `server/core/_internal/version-build.ts:44`, `server/core/_internal/media-preservation.ts:12`, `server/core/_internal/save.ts:197` |
| F5 | `seek at the reel end retains the last shot within the manifest duration tolerance` | `server/core/_internal/parts-assembler.ts:141`, shared tolerance at `server/core/_internal/parts.ts:7` |
| F6 | No behavioral red phase for a constant extraction. D2 records this exception. Cleanup and alternate suites verify unchanged behavior. | `server/core/_internal/edit-model.ts:13`, `server/core/_internal/parts.ts:4`, `server/core/index.ts:209`, `server/core/_internal/render.ts:25` |

All six findings are implemented. D1 to D5 above explain the retained native preservation, constant-extraction test exception, journal fixtures and out-of-scope documentation/design work. No implementation item is intentionally left unfixed. Genuine agent conflicts remain flagged rather than overwriting new content. Verification totals and the broad-run limitations are recorded above.

### Clean verification

2026-10-14 verification handoff: stopped at Step 1. The full core run failed outside the two permitted load-sensitive exceptions. No implementation or test changes, isolated reruns, or git writes were performed. Branch remains `agent-loop/live-edits-parts-alternates/chain`, HEAD `bd31368`. The standing AGENTS.md also prohibits git writes for this brief and says the brief cannot override that prohibition.

```text
npx vitest run tests/core --maxWorkers=1 --reporter=verbose
Test Files 4 failed | 102 passed (106)
Tests 4 failed | 798 passed | 1 skipped (803)
Duration 1146.39s (tests 97%, import 3%)
Exit 1
Full output: tests/review-full-core-clean.log

npm run typecheck
> tsc --noEmit
Exit 0
Full output: tests/review-clean-typecheck.log

npm run build
100 modules transformed, built in 1.61s
Exit 0, existing chunk-size warning
Full output: tests/review-clean-build.log
```

The suite ran with one worker. A process inventory before starting found no other test or render process. The one skip is the existing opt-in real faster-whisper integration. All ten raw SHA-256 engine hashes match `tests/review-engine-hashes.json`.

| Finding | Failing test | Error output |
| --- | --- | --- |
| F1 | `render-media-beats-editor.test.ts:82`, `shows trimmed loop beats, toggles their display and snapping, and freezes detected timing on Save` | `page.waitForResponse: Timeout 30000ms exceeded while waiting for event "response"` |
| F2 | `render-media-layer.test.ts:39`, `brings an insert picture to front, sends it back, undoes it and saves the same drawing order` | `locator.click: Timeout 30000ms exceeded`, waiting for `Clip settings` > `Bring to front` |
| F3 | `render-overload.test.ts:102`, `kinotta render refuses an overloaded mix with where it overloads, and renders it with --accept-overload` | `AssertionError: expected 3221226505 to be +0`, at `expect(accepted.status).toBe(0)` |
| F4 | `render.test.ts:159`, `renders a Draft in its own process, printing progress and the output path, then exits` | `AssertionError: expected 3221226505 to be +0`, at `expect(run.status).toBe(0)` |

No isolated rerun was performed because the handoff requires stopping if anything outside `render-editor-keys-drag.test.ts` and `render-media-beats-editor.test.ts` fails. The keyboard/drag test passed in this invocation. This was not an all-green run. Nothing was committed, and the existing source/test/docs changes and run evidence remain in the working tree.

Known limitation from the handoff's F3: `removeStaleDrafts` in `server/core/_internal/render-queue.ts:109` can delete a live Draft's inputs if a second server starts on the same project mid-capture. This remains unchanged and out of scope.
