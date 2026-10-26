# Brief: Storyboard pinned effects and "Keep this note" (codex)

## Status

<!-- Keep this block current. Claude reads only this block and the diff. -->
- State: blocked
- Done: implemented comment-backed Working pin edits, isolated instant template builds with Style fonts and Brand colours, batch routing, frame-only drops, alternate identity, note/Delete/Undo cards, Insert shot, phone controls, Build counts and built-note decisions. Focused Playwright: 4 passed. Pin/batch integration: 12 passed. Typecheck, build and check:docs passed before the final scoped note-flush/footprint changes; typecheck passed after them.
- Failed or skipped: full unit project: 973 passed, 6 skipped, 1 failed (runner architecture guard, confirmed alone). Logs: C:/Users/ryand/AppData/Local/Temp/kinotta-pinned-unit.log and kinotta-pinned-runner-guard.log. Final browser rerun after note-flush/footprint changes, alternates suites, full Playwright and commit checks not run because the brief requires stopping on this uncovered boundary conflict. The reference mockup's instant/note/keep flow was clicked through with Playwright; its Insert shot click-through was not completed.
- Waiting on owner: The existing guard in tests/core/start-reel.test.ts:130 requires runner.ts to be the only module that names engine scripts or starts Python. The new instant-effect.ts violates that guard, but runner.ts also contains launchAgent, and the brief forbids importing the agent runner. May this branch extract the local build invocation into an agent-free build-runner.ts shared by runner.ts and instant-effect.ts, and update the architecture guard to allow that single build service? This preserves one process boundary and keeps instant pins independent of the agent launcher. Alternatively, explicitly permit importing runner.ts's existing buildPage from the instant path. The guard has not been weakened.


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

## Done when

- [ ] Step 13, desktop: a new Playwright spec drags Title card onto a frame (made at once, in Working, Undo removes it), drags Big word onto a frame (waits for Build), writes a note on an instant pin (moves to the agent) and clears it (moves back), deletes a pin by Delete key and by its card, and undoes both. It also proves the gap and the alternates strip are not drop targets.
- [ ] Step 13, Insert shot: the spec clicks Insert shot in a gap, describes the shot, and shows the comment goes in the next batch and no "Keep this note" prompt follows.
- [ ] Step 13, alternates: on a shot with alternates, previewing r2 and dropping an effect pins it to r2; the alternate in the reel is unchanged. `alternates-*` suites still pass.
- [ ] Step 13, phone width (390px): pins and cards show, Delete and Undo work, and no way to add a pin is offered.
- [ ] Step 14: a test fails if an instant pin creates an agent job; an agent pin or any pin with a note is saved as a comment with an `effect` id and goes in the next batch (`tests/core/batch.test.ts` passes); the build button shows the waiting count and "1 agent run".
- [ ] Step 16: after a built pin note, the prompt shows the plan's heading, quoted note and explanation; "Always for this reel" adds a rule to that reel's style only; "Only this version", or ignoring it through the next Build, adds nothing and does not ask again.
- [ ] `npm run typecheck`, `npm run check:docs`, `npm run check:commits -- origin/main` pass.
- [ ] `npm run build`, then `npx vitest run --project unit` pass.
- [ ] Full `npx playwright test --workers=2` passes. `main` has no known failures since #74; rerun any failure alone before calling it real, and report it under "Failed or skipped" with the log path if it is not yours.
- [ ] Plan Changelog has a dated entry per step.

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
