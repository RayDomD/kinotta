# AGY: simple mode Phase 4, dead-air pass

Repo worktree: `.worktrees/sm-agy` on branch `feat/simple-mode-agy` (from `feat/simple-mode`). Work only there.
Plan: `docs/plans/2026-10-20-simple-mode-flow.md` (Step 10). Read `AGENTS.md`, `CONTEXT.md` first.

## How to run it
Use `/orchestrate` and spawn several Gemini 3.8 (medium effort) sub-agents in parallel to go faster, for example: one for the gap/pad cutting and strengths, one for breath detection, one for wiring into `startReel`/Make, one for tests. You own the merge of their work into this worktree. Save Argon for review: use it only for a final review pass over the merged diff, not for implementation.

## Task
On Make (and available to the first version built from a transcript, see `server/core/_internal/start.ts` `startReel`), cut dead air automatically from the transcript's word timings:
- Remove gaps between words longer than a threshold, leaving a short pad so cuts land just after a word ends.
- Trim audible breaths where the transcript shows a gap with low-level audio (no word); keep it simple and deterministic.
- One strength setting: `gentle` / `normal` / `tight` (name the thresholds as constants with a one-line reason each). Default `normal`.
- Output is the plan's `pieces` (in/out ranges), the same structure snips already use; do not invent a new edit format. Look at `server/core/_internal/edit-model.ts`, `pieces.ts`, `transcription.ts`.

## Rules
- Test first (`tests/core/`): word timings in, pieces out, for each strength; a talk with no long gaps stays one piece.
- Conventional commits, no AI signature lines, do not push or merge, never commit to main.
- Validate: `npx tsc --noEmit` and only the test files you touched or added (`npx vitest run <files>`). Do not run the full vitest or Playwright suites; Codex owns long-running runs.
- When done, write `docs/briefs/2026-10-20-simple-mode/agy-result.md`: what shipped, checks with results, what is unfinished.
