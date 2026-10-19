# Merge queue review fixes — 2026-10-19

Implemented the approved F1/F2 scope on `fix/merge-queue-review`, based on `main` at `25bb5e9`, in `.worktrees/merge-queue-review`. No merge or push.

## Shipped vs. planned

- F1: Storyboard clears the opening revision after the shot sheet consumes it. A Working update can remount the sheet without restoring its obsolete opening alternate. Opening a non-reel card preview still shows that preview.
- F2: saved-version video resolution checks the legacy path-named playback copy before probing or transcoding. Content-keyed shared copies retain precedence, and source integrity validation still runs before reuse.
- Saved the approved plan and regenerated the dashboard. Both outcomes match the plan's Intent; no scope deviations.

## Evidence

- Red F1: both new Playwright cases failed because B's `aria-pressed` was false after Use, despite Working selecting r2.
- Green F1: both cases pass. In the real Storyboard, opening on A or previewed C, then choosing B, leaves B selected, shows its r2 frame, disables Use, and reopens on B.
- Red F2: the public `mediaFile()` interface returned a new `sha256-…mp4` instead of the pre-existing path-named copy.
- Green F2: it returns the legacy copy, creates no extra copy, and refuses the source after bytes are changed.
- `npx playwright test -c tests/e2e/alternates.config.ts --workers=1`: 11 passed, including inline animation, reduced motion, pins, undo, and Review/frozen-history coverage.
- `npx vitest run tests/core/playback-copy.test.ts tests/core/version-media.test.ts`: 11 passed, including concurrent deduplication, cross-version sharing, library reuse, and playback encoding properties.
- `npm run typecheck`, `npm run build`, and `git diff --check`: passed. Build emits its existing large-chunk warning.
- Initial sandbox runs could not spawn build/test processes (`EPERM`); approved elevated runs completed. One added assertion incorrectly used an internal-only third argument through the public interface; it was removed, then typecheck and the core suites passed.

## Remaining

F3–F6, spec gaps, baseline failure diagnosis, cleanup decisions, and pushing main remain outside this approved scope. The full repository suite was not run; verification covered the affected interactions and media paths.
