---
title: Merge queue review fixes
date: 2026-10-19
status: Done
summary: Keep the chosen alternate visible in the shot sheet and reuse legacy saved-version playback copies.
spec:
---

## Intent

- Problem: F1 resets the enlarged Storyboard shot to its opening alternate after Use; F2 ignores existing path-named playback copies for saved versions.
- Why: Choosing an alternate gives misleading feedback, and existing HEVC projects can unnecessarily transcode again.
- Proposed outcome: The sheet displays the chosen alternate as in the reel, and saved-version playback reuses existing copies.
- Affected: Storyboard opening state, saved-version media resolution, and regression tests.
- Constraints: Preserve inline animated alternatives and Review's chosen Working revision. Work off main. No push.
- Out of scope: F3–F6, spec gaps, baseline failure diagnosis, and other merge-queue owner decisions.
- Open questions: None. Owner approved the scope and test boundaries on 2026-10-19.

## Goal

Choosing B in the Storyboard shot sheet updates Working and keeps B visible with Use disabled. Opening a previewed non-reel alternate still displays that preview. Saved-version media requests reuse an existing legacy playback copy while continuing to reject changed originals.

## Approach

1. Test F1 through the running Storyboard UI, including opening a card preview and using its alternate. Observe a failing regression before changing opening state.
2. Test F2 through openProject().mediaFile() with an existing legacy playback copy. Observe failure before restoring compatibility in saved-version resolution.
3. Preserve content-keyed deduplication and integrity checks.

## Steps

1. Save this approved plan and regenerate the dashboard.
2. Reproduce F1, make the minimal fix, and rerun the UI regression.
3. Reproduce F2, make the minimal fix, and rerun saved-version playback tests.
4. Run relevant UI/core checks, typecheck and build; review the diff and commit at logical stops.
5. Record results and deviations in the session summary and regenerate the dashboard.

## Risks

- An explicit card preview must not become a stale opening revision when the sheet remounts after a Working edit.
- Legacy playback reuse must stay behind source validation and preserve shared-copy reuse.

## Checks to run

- Playwright alternates suite, including visible sheet revision and Use state after selection.
- Playback-copy and version-media core tests.
- Typecheck and production build.

## Changelog

### 2026-10-19
- Owner approved F1/F2 and both public test boundaries. Created branch fix/merge-queue-review from main at 25bb5e9 in an isolated worktree.
- F1: both browser regressions failed before the fix (B was not pressed after Use). Clear the opening revision after the sheet consumes it so subsequent Working remounts follow the selected alternate. Verified opening on A and previewed C, choosing B, the displayed B frame, disabled Use, and reopening on B.
- F2: the regression returned a newly transcoded sha256 copy despite a valid path-named copy. Restore the legacy-copy lookup after content-copy lookup and source validation. The test now verifies reuse, no extra playback file, and refusal after source mutation.
- Checks passed: alternates Playwright suite (11 tests), playback-copy and version-media core suites (11 tests), typecheck, build, and git diff --check. Build retains the existing chunk-size warning.
- Both goals answer the original Intent. No scope changes; F3–F6 and spec gaps remain follow-up work. Summary: docs/session-summaries/2026-10-19-merge-queue-review-fixes-summary.md.
