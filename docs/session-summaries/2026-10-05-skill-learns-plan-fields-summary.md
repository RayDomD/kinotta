# Skill learns the new plan fields (T46, #48): run summary

Date: 2026-10-05. Branch: `feat/review-edit-phase` (local, not pushed). Plan: `docs/plans/2026-10-05-skill-learns-plan-fields.md`.

## What shipped

- `skill/kinotta/SKILL.md`: a hard rule that `edit-list.json`, `handoff.json` and `.save/` are Kinotta's; section 4 (code-only) copies `v<n>` without `edits.json` and carries `kinotta-edits.css` and its link; section 5 and 6 copy the transcript and plan into the version folder (E14; the "no copies" rule is gone); a new "The plan" part in section 6 says to keep `pieces`, `offsets` (incl. `@clip`), `captions.position` and `captions.phrases`, to clear `slid` only on a clip it re-syncs to its words, and which plan file to edit; "Who built it" says to write `builtBy` with the agent's own name. Project-folder wording and the misheard-word example no longer name an agent.
- `reference/contract.md`: the files a version can hold (`transcript.json`, `plan.json`, `kinotta-edits.css`, `edits.json`), Kinotta-owned reel files, and `builtBy`.
- `scripts/shots.py`: `--built-by <name>` writes `builtBy` (placed before the section ids). Test added in `tests/engine/scripts.test.ts`.
- App wording (E20): "Ask Claude for a storyboard", "Sent to Claude", "Copied N comments for Claude" and "Ask Claude to read that file" now say "your agent"; code comments in `web/src` and `server` are neutral. Specs asserting them updated. `tests/web/agent-neutral.test.ts` fails if web or server source names Claude, Codex, Gemini, ChatGPT or Copilot.

## Decisions

- `builtBy` is written through `--built-by` rather than by hand-editing `shots.json`, so `shots.json` is still written once, last.
- The engine-compose fixture clip title "Folder → Claude Code" is data and stays.

## Checks

- `npm run typecheck`: clean.
- `rtk proxy npm test`: 32 files, 318 passed, 1 skipped.
- Scoped e2e (scratch config outside the repo, ports 4397 and 4392 only, servers stopped): `batch.spec.ts` and `section-batches.spec.ts`, 7 passed. Full `npm run test:e2e` not run (ports 4398/4399 held by orphaned servers).
