# Brief: close the Direction and Storyboard plan (codex)

## Status

<!-- Keep this block current. Claude reads only this block and the diff. -->
- State: not started
- Done:
- Failed or skipped:
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

- [ ] A test fails before and passes after each nit fix: `agentTold` with an unknown frame does not throw and has no `Frame:` line; an unknown setting key prints the key, never `undefined`. `npx vitest run --project unit tests/core/reel-style.test.ts` (or the direction test file) passes.
- [ ] A test starts a footage reel and a brief reel from one saved project style that has a rule, and asserts each request contains every `agentTold` line for that reel's copy, including `Rule: "<the rule>".`. Same command passes.
- [ ] The plan Changelog has a dated entry: Phase 6 check run as request-only (owner decision), with the test name and a short excerpt of each request's style lines and rule; and the two #69 nits fixed.
- [ ] `npm run typecheck`, `npm run check:docs`, `npm run check:commits -- origin/main` and `npx vitest run --project unit` pass.

Mojibake: the pre-commit hook enforces it.

Tick an item only after its check passes. State is `done` only when every box is ticked.

## Results

<Append a short summary of changes here. Newest heading last.>
