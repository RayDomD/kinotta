# Brief: Storyboard pinned effects and "Keep this note" (codex)

## Status

<!-- Keep this block current. Claude reads only this block and the diff. -->
- State: not started
- Done: none
- Failed or skipped: none
- Waiting on owner: none

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
- Instant pins: their own server path that fills the template with `fill` and the reel style's `--fx-font`, `--fx-ink`, `--fx-accent`, then runs `skill/kinotta/engine/build.py`. It must not import the agent runner.
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
