# Merge queue

Executed on `main` in `.worktrees/codex-run-cleanup` from base `a330bdc`.
Plan: `docs/plans/2026-10-19-merge-queue.md`.

## Shipped vs. planned

1. **Plan & setup (`dd8c133`, `d7caca4`, `15cb43b`):**
   - Merged `docs/merge-queue` (`a038cdf`) into `main` (`--no-ff` -> `dd8c133`).
   - Marked `docs/plans/2026-10-19-merge-queue.md` `Approved` (`d7caca4`) and `In Progress` (`15cb43b`), regenerating `docs/plans/index.html` with the worktree path fix (`0` `.worktrees` references).
2. **Merge 1 — `fix/render-hidden-stage` (`056dd05` -> `a2e6f60`):**
   - Clean `--no-ff` merge (`skill/kinotta/engine/render.js`, `tests/engine/render.test.ts`).
   - Answer to the handoff question: **`fix/render-hidden-stage` did NOT fix `alternates.spec.ts:14`**. Running `npx playwright test tests/e2e/alternates.spec.ts:14 --workers=1` still timed out waiting for `[data-graphic="proof"] .native-shot-still iframe -> [data-scene="proof"]` to have `data-revision="r2"`.
3. **Merge 2 — `fix/playback-copy-dedupe` (`bbe21bb` -> `cecd67a`) + E2E locator fix (`a6400ef`):**
   - Merged `--no-ff` (`cecd67a`); only `docs/plans/index.html` conflicted and was resolved by regenerating and stripping `.worktrees/codex-run-cleanup/`. Auto-merges in `skill/kinotta/engine/render.js` and `tests/core/render-media-preview.test.ts` were clean and orthogonal.
   - **Deviation / Regression caught & fixed (`a6400ef`):** On the serial rerun of `tests/e2e/review.spec.ts:136` (`playback follows the pieces and skips a snipped stretch`), Playwright threw a strict-mode error (`getByRole('main', { name: 'Review' }).locator('video') resolved to 2 elements`). Commit `b244743` (`feat: load the next picture before its cut`) mounts pictures starting within 3 s inside `[data-verify-unit="UpcomingPictureLayer"]` alongside the visible `[data-verify-unit="PictureLayer"]`; it updated the unit test selectors to `[data-verify-unit="PictureLayer"] > .mv-picture`, but missed `tests/e2e/review.spec.ts:22`. Scoping `video` in `tests/e2e/review.spec.ts:22` to `review(page).locator('[data-verify-unit="PictureLayer"] > video')` (`a6400ef`) resolved the failure (`3/3` passed serially in `review.spec.ts`, and `review.spec.ts:136` also passed in the subsequent full parallel run).
4. **Merge 3 — `feat/inline-alternates-card` (`1be6fca` -> `f369e2e`):**
   - Merged `--no-ff` (`f369e2e`); only `docs/plans/index.html` conflicted and was resolved by regenerating and stripping `.worktrees/codex-run-cleanup/`.

## Run report

| Step / Ticket | Branch / Commit | Subagent Model | Escalations | Review Outcome | `main` Commit |
|---|---|---|---|---|---|
| Step 1: Plan merge & status | `docs/merge-queue` (`a038cdf`) | Orchestrator (Argon 4) | 0 | Pass | `dd8c133`, `d7caca4`, `15cb43b` |
| Merge 1: Hidden stage sizing | `fix/render-hidden-stage` (`056dd05`) | 3.8 Medium (`flash`) | 0 | Pass (`alternates:14` still fails as baseline) | `a2e6f60` |
| Merge 2: Playback copy dedupe & gentle renders | `fix/playback-copy-dedupe` (`bbe21bb`) | 3.8 High (`pro`) | 0 | Pass after `a6400ef` fix in `review.spec.ts:22` | `cecd67a`, `a6400ef` |
| Merge 3: Inline alternates card | `feat/inline-alternates-card` (`1be6fca`) | 3.8 High (`pro`) | 0 | Pass (all 4 new card E2E tests green) | `f369e2e` |

## Checks run

- **After Merge 1 (`a2e6f60`):**
  - `npx tsc --noEmit` and `npm run build` passed.
  - `npx vitest run tests/engine/render.test.ts`: 6/6 passed.
  - `npx playwright test tests/e2e/alternates.spec.ts:14 --workers=1`: failed (same baseline error).
  - Full `npx playwright test`: 113 passed; parallel timeouts (`clips:41`, `code-only:19`, `snip-save:54`, `transcription:24`) all passed when rerun with `--workers=1`. Only baseline `alternates:14` and `section-batches:62` failed serially.
  - Full `npx vitest run`: all load-timed-out files passed when rerun outside full-suite load; only baseline `tests/web/editor-settings.test.ts` failed (`expects 'rail', gets 'marker'`).
- **After Merge 2 (`cecd67a` + `a6400ef`):**
  - `npx tsc --noEmit` and `npm run build` passed.
  - Targeted unit & render suite (`playback-copy`, `gentle-render`, `render`, `render-media-preview`, `render-media-regions`, `render-media-sync`): 6/6 files, 35/35 tests passed.
  - Full `npx playwright test` + `--workers=1` reruns: `clips:41`, `parts-gate:10`, `renders:27` passed serially; `review:136` failed strict mode until `a6400ef` scoped `review.spec.ts:22` to `[data-verify-unit="PictureLayer"] > video`, after which `review.spec.ts` passed 3/3 serially. Only baseline `alternates:14` and `section-batches:62` failed serially.
  - Full `npx vitest run` + batch rerun of 8 load-timed-out files: 62/62 passed on rerun; only baseline `tests/web/editor-settings.test.ts` failed.
- **After Merge 3 (`f369e2e`):**
  - `npx tsc --noEmit` and `npm run build` passed.
  - `npx playwright test tests/e2e/alternates.spec.ts --workers=1`: 8/9 passed (all 4 new inline card tests `:169`, `:244`, `:310`, `:330` and existing `:53`, `:87`, `:113`, `:145` passed; only baseline `:14` failed).
  - Full `npx playwright test` + `--workers=1` reruns: 118 passed in parallel (including `review:136`); parallel contention timeouts (`clips:41`, `handoff:18`, `working:12`) passed 6/6 with `--workers=1`. Only baseline `alternates:14` and `section-batches:62` failed serially.
  - Full `npx vitest run` + batch rerun of load-timed-out files: 97/98 passed on rerun; only baseline `tests/web/editor-settings.test.ts` failed.
- **Dashboard & git hygiene:**
  - `Select-String -Path docs/plans/index.html -Pattern "\.worktrees"` returned `0` after every regeneration.
  - `docs/session-summaries/2026-10-15-viewer-transport-clips/` restored after each test run.

## Notes for the owner

1. **`fix/render-hidden-stage` and `alternates:14`:** `alternates.spec.ts:14` still fails on `main` after merging `fix/render-hidden-stage`. The three baseline failures (`alternates.spec.ts:14`, `section-batches.spec.ts:62`, and unit `tests/web/editor-settings.test.ts`) remain unchanged from `a330bdc`.
2. **Untracked files in the shared checkout (`C:/FIles/Projects/Apps/Kinotta`):** The shared checkout has untracked copies of `docs/plans/2026-10-18-inline-alternates-card.md`, `docs/mockups/2026-10-18-inline-alternates-card.html`, `docs/briefs/2026-10-18-inline-alternates-card/`, `docs/session-summaries/2026-10-18-inline-alternates-card-summary.md`, and `docs/tickets-inline-alternates.md` (which match the pre-review-fix blobs from `7744743`). Because `main` now tracks those paths via `feat/inline-alternates-card`, `git checkout main` in `C:/FIles/Projects/Apps/Kinotta` will refuse to overwrite them until you move or remove those untracked copies. They were left untouched.