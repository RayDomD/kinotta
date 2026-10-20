# Handoff: simple mode, after Phase 1

Branch `feat/simple-mode`, worktree `C:\FIles\Projects\Apps\Kinotta\.worktrees\simple-mode`. Plan: `docs/plans/2026-10-20-simple-mode-flow.md` (status In Progress). Mockups: `docs/mockups/2026-10-20-simple-mode.html`, `docs/mockups/2026-10-20-simple-mode-single-pass.html`.

## Decisions (owner, 2026-10-20)
- Two modes on one project: Simple (default) and the current detailed editor. Remove approval and version gating; keep alternates.
- Pins with required typed notes, a pin list with jump and `[` `]`, one Regenerate pass for all new/changed pins (no per-pin chat), old cut keeps playing.
- Kinotta launches the user's own agent headless; the user chooses Claude Code or Codex in a setting; copy-request stays as fallback.
- Borrowed from the 24/7 Editor course (clean-room): dead-air pass, notes become rules, b-roll over reading glances (later). Style comes from DESIGN.md, no quiz.
- Delegation: codex/agy use configured defaults; agy uses `/orchestrate` with Gemini 3.8 high sub-agents.

## Phase 1 shipped (commits 921c3d0, e28d14c, 37c9759)
- Drop returns once the file is in footage/; playback copy runs in background, max 2 at once; startReel still waits for it.
- Playback copy preset `ultrafast` (5.6 s vs 8.1 s on a 20 s iPhone HEVC clip, ~3.5x larger file).
- Multi-file drop, folder drop and "Choose a folder…", one progress row per file.
- Verified: typecheck clean; `tests/core/import-video.test.ts` 9/9 (new non-blocking test red on old code); `tests/e2e/drop-video.spec.ts` 3/3.
- Not verified: dragging a folder onto the zone (Playwright can't simulate it; try by hand). Full `npx vitest run` was started but its result was not captured; rerun it before dispatch.

## Test status (2026-10-20, second session)
- Full `npx vitest run` at 9118d90: 18 failed / 918 passed across 13 files, 1050 s. Only 9 failing files were named in the captured output; the other 4 are unidentified.
- Rerun alone (`--no-file-parallelism`): 8 of 9 pass (alternates-build, alternates-edits, alternates-pins, code-media-save, editing, handoff, legacy-media-editing, parts-batch). Those failures were caused by parallel load.
- `tests/core/render-media-elements.test.ts` > "reattaches a graphic to the pass of a looping voice under the playhead (A2)" is flaky: fail, pass, fail in three solo runs on this branch; passes in the main checkout. Phase 1 didn't touch rendering, so it's likely timing-sensitive, not a regression (unconfirmed).
- Open question for the owner: dispatch now and log A2 as known-flaky, or first rerun the suite with fewer workers (e.g. `npx vitest run --maxWorkers=2`) to name and clear the remaining 4 files.

## Next: dispatch (not done yet)
1. Resolve the open question above; dispatch only once the owner says go.
2. Briefs are committed (8f3b94c).
3. Create worktrees:
   ```
   git -C C:/FIles/Projects/Apps/Kinotta/.worktrees/simple-mode worktree add -b feat/simple-mode-codex ../sm-codex feat/simple-mode
   git -C C:/FIles/Projects/Apps/Kinotta/.worktrees/simple-mode worktree add -b feat/simple-mode-agy ../sm-agy feat/simple-mode
   ```
4. Send prompts (agents `codex-4` and `agy-4` in herdr workspace w8; check with `herdr agent list`):
   ```
   herdr agent prompt codex-4 "Read and execute C:\FIles\Projects\Apps\Kinotta\.worktrees\sm-codex\docs\briefs\2026-10-20-simple-mode\codex-phase-2-3.md. Work only in C:\FIles\Projects\Apps\Kinotta\.worktrees\sm-codex." --wait --until working --timeout 15000
   herdr agent prompt agy-4 "Read and execute C:\FIles\Projects\Apps\Kinotta\.worktrees\sm-agy\docs\briefs\2026-10-20-simple-mode\agy-phase-4.md. Work only in C:\FIles\Projects\Apps\Kinotta\.worktrees\sm-agy." --wait --until working --timeout 15000
   ```
5. Review each `*-result.md` and diff when they finish. Owner merges; never push or merge without the go-ahead.

## Later phases (not briefed)
5 agent launch + single pass + alternates per pin; 6 notes become rules; 7 b-roll over reading glances.

## Loose ends
- In the main checkout, a stash entry holds an older edit of `docs/plans/index.html` from `feat/remove-leaves-gap` (generated file; safe to drop after a look).
- `.worktrees/simple-mode` mockup session folder was cleaned by the mockup skill.
