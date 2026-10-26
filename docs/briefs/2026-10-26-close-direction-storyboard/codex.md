# Brief: close the Direction and Storyboard plan (codex)

## Status

<!-- Keep this block current. Claude reads only this block and the diff. -->
- State: done
- Done: both #69 nits reproduced and fixed; request-only Phase 6 check passes for footage and brief reels from one saved project style; Changelog updated; all required checks pass (113 unit files, 986 tests passed).
- Failed or skipped: no failures; full unit suite reports 6 skipped tests. Real agent builds, render and Playwright excluded by scope.
- Waiting on owner: none

## Goal

Close the last open items of `docs/plans/2026-10-25-direction-and-storyboard.md`: run its Phase 6 check (§ Checks to run, last line) as a request-only check, and fix the two #69 review nits recorded in its Changelog (2026-10-26). Claude closes the plan itself afterwards; do not change its `status`.

Lane split: sole lane. Work in the worktree `C:/FIles/Projects/Apps/Kinotta/.worktrees/close-direction-storyboard`, branch `chore/close-direction-storyboard` (stacked on `feat/storyboard-pinned-effects`, PR #77). `node_modules` there is a junction; leave it alone.

Owner decision (2026-10-26): the Phase 6 check is request-only. Start one footage reel and one code-built (brief) reel from a saved style that has a rule, and prove the agent request carries the style lines and the rule. No real agent build.

## Inputs

- Rules: `Style.rules` at `server/core/_internal/style.ts:24`; `agentTold` emits one `Rule: "<rule>".` line per rule at `server/core/_internal/direction.ts:116`.
- Nit 1: `server/core/_internal/direction.ts:99` reads `FRAMES.find(...)!.label`; an unknown `context.frame` throws. `FRAMES` is at `direction.ts:10`, `ToldContext.frame` at `direction.ts:81`.
- Nit 2: `server/core/_internal/direction.ts:101` prints `SETTING_NAMES[key]`, which is `undefined` for a key not in `SETTING_NAMES` (`direction.ts:85`). `validateStyle` limits keys to `SETTING_KEYS` (`style.ts:58`), so this only shows when the two lists drift.
- Footage request: `POST /api/reels` with `style`, then `GET /api/reels/<slug>/agent/copy`, as in `tests/core/reel-style.test.ts:35`. The b-roll job request carries `told` from `makeBrollJobRequest` (`server/core/_internal/requests.ts:61`).
- Code-built request: `POST /api/reels/brief` with `style`, as in `tests/core/reel-style.test.ts:86`; built by `briefRequest` (`server/core/_internal/start.ts:165`).
- Saved style with a rule: save a project style through the existing style routes or `server.project` API used in `tests/core/style.test.ts`, then start each reel from it by id.

## Scope

- Touch:
  - `server/core/_internal/direction.ts`
  - `tests/core/reel-style.test.ts`
  - `tests/core/direction.test.ts` (only if a direction unit test file already fits better; otherwise keep tests in `reel-style.test.ts`)
  - `docs/plans/2026-10-25-direction-and-storyboard.md` (Changelog entries only)
  - `docs/briefs/2026-10-26-close-direction-storyboard/codex.md`
- Do not touch: the plan's frontmatter `status`, Storyboard and pinned-effects code, `web/`, `skill/kinotta/`. The deferred Library items ("Your music", "Add to this reel") stay deferred.
- Nit fixes: an unknown frame leaves out the Frame line rather than throwing; an unknown setting key prints the key itself. Keep the change to those two lines plus tests.
- Stop and report on anything this brief does not cover. Do not guess.
- Keep this file UTF-8 when you edit it.
- Commits on `chore/close-direction-storyboard` only, author `Ryan Dela CRyz <sourcrempie@gmail.com>`, Conventional prefix (`fix:` for the nits, `test:` for the check, `docs:` for the Changelog). No `Co-Authored-By` or `Claude-Session` trailers. Do not push or open a PR.
- Tests: `npx vitest run --project unit <files>`; no full Playwright (nothing in `web/` changes) and no `render` project. Write logs to files and check the exit code.

## Done when

- [x] A test fails before and passes after each nit fix: `agentTold` with an unknown frame does not throw and has no `Frame:` line; an unknown setting key prints the key, never `undefined`. `npx vitest run --project unit tests/core/reel-style.test.ts` (or the direction test file) passes.
- [x] A test starts a footage reel and a brief reel from one saved project style that has a rule, and asserts each request contains every `agentTold` line for that reel's copy, including `Rule: "<the rule>".`. Same command passes.
- [x] The plan Changelog has a dated entry: Phase 6 check run as request-only (owner decision), with the test name and a short excerpt of each request's style lines and rule; and the two #69 nits fixed.
- [x] `npm run typecheck`, `npm run check:docs`, `npm run check:commits -- origin/main` and `npx vitest run --project unit` pass.

Mojibake: the pre-commit hook enforces it.

Tick an item only after its check passes. State is `done` only when every box is ticked.

## Results

<Append a short summary of changes here. Newest heading last.>

### Saved execution plan (2026-10-26)

1. Reproduce each #69 nit through agentTold in reel-style.test.ts, then apply its minimal fallback and verify green.
2. Save one project style with a rule; start footage and brief reels by its id and verify every agentTold line in both requests without running an agent.
3. Record request excerpts in the plan Changelog only; run the scoped suite and all four required checks with file logs, then commit the scoped changes.

The supplied brief is the approved plan. Its scope overrides the general plan-summary/dashboard workflow: no new planning files, status changes or dashboard edits.

### Verification (2026-10-26)

- Frame regression: exit 1 before the fix (undefined label access); exit 0 after it.
- Setting regression: exit 1 before the fix (missing key fallback); exit 0 after it. Both nits together: 2 passed.
- Scoped suite: 8 passed, exit 0. Phase 6 uses one saved project style, summit-style, with Keep captions low as its rule. Footage verifies persisted told lines and the copied prompt; brief verifies its returned request. Copy provider and copy-ready status keep the check request-only.
- Typecheck, docs and commit checks: exit 0. Full unit suite: exit 0, 113 files passed, 986 tests passed and 6 skipped (251.24 seconds).
- Logs: tests/artifacts/close-direction-storyboard/ (ignored local files): frame-red.log, frame-green.log, setting-red.log, nits-green.log, reel-style.log, typecheck.log, docs.log, commits.log, unit.log.
- Commits so far: a75833c (fix), a1a2a4f (test), both authored by Ryan Dela CRyz <sourcrempie@gmail.com>.
- Plan frontmatter status unchanged. No push or PR.
