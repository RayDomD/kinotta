# Codex: simple mode Phases 2 and 3

Repo worktree: `.worktrees/sm-codex` on branch `feat/simple-mode-codex` (from `feat/simple-mode`). Work only there.
Plan: `docs/plans/2026-10-20-simple-mode-flow.md` (read Intent, Steps 5-9). Mockups: `docs/mockups/2026-10-20-simple-mode.html`, `docs/mockups/2026-10-20-simple-mode-single-pass.html`. Read `AGENTS.md`, `DESIGN.md`, `CONTEXT.md` first.

## Phase 0: test baseline (long-running runs are yours)
- Before editing, run `npx vitest run --maxWorkers=2` on the unchanged branch and record every failing file and test in `codex-result.md`. The last full run had 18 failures in 13 files, mostly from parallel load; `tests/core/render-media-elements.test.ts` "A2" is known-flaky. Your later full runs are judged against this baseline.
- You own all full-suite runs (vitest, Playwright) for this run; agy runs only targeted tests.

## Phase 2: remove approval and version gating (commit when green, then start Phase 3)
- Remove `server/core/_internal/approval.ts`, the `/versions/:n/approval` route in `server/http/_internal/handler.ts`, the "approved" badge and `approval-changed` handling in `web/src/App.tsx`, and related client calls. Move `requireVersionDir` (used by `render.ts`) somewhere it still makes sense.
- Hide version history in the UI behind "current" plus undo. Version folders stay on disk; do not change storage.
- Delete or rewrite approval tests (`tests/core/approval.test.ts`, `render-gate.test.ts`, e2e that click approve).
- Must keep: Review loads the chosen Working revision; animated revisions.

## Phase 3: simple mode surface
- One-time "About you" profile (name, handle, what you make, language, where it goes, how you finish, music), stored per machine. Simple mode is the default; "Open in editor" goes to the current detailed editor for the same reel.
- Drop (reuse `web/src/DropZone.tsx`) → Make → vertical preview with a timeline. Clicking the timeline drops a pin; a note is required. Pin list panel: timestamp, note, status; click jumps the playhead; prev/next and `[` `]`.
- Pins reuse the existing pinned comments model (`FramePin` in `server/core/_internal/types.ts`). Regenerate (N pins) copies the existing comment-batch request for now (agent launch is Phase 5, not yours).

## Rules
- Conventional commits, no AI signature lines, never commit to main, do not push or merge.
- Validate: `npx tsc --noEmit`, `npx vitest run`, relevant `npx playwright test`; add an e2e for the simple-mode pin flow.
- When done, write `docs/briefs/2026-10-20-simple-mode/codex-result.md`: what shipped, checks run with results, what is unfinished.
