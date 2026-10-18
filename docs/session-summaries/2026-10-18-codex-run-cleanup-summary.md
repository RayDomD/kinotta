# Codex run cleanup

Work is in progress on `fix/codex-run-cleanup`, branched from `main` at `5f3a23d`. The owner approved the saved cleanup plan on October 18. Merging this branch and `codex/random-audio-seeds` into `main` awaits the owner's final go-ahead.

Continuation instructions are in the [cleanup handoff](../briefs/2026-10-18-codex-run-cleanup-handoff.md).

## Changes and evidence

- The four failures from the source run each pass in isolation: CLI Draft, accepted overload CLI render, picture layer ordering, and beat detection. Logs: `tests/cleanup-{render,overload,layer,beats}-isolated.log`. No timeout changes or speculative fixes were made.
- Draft captures publish their owner PID atomically with the staged inputs. Startup retains captures whose owner is alive and removes unowned or dead-owner captures. Permission errors are treated conservatively as possibly alive. A PID reused by an unrelated process can retain an abandoned capture until that process exits.
- The cross-process regression failed because a second server deleted `index.html`, then passed with the fix. Logs: `tests/cleanup-race-red.log`, `tests/cleanup-race-green.log`. The full Working render file passes all 12 tests, including owner exit, completion, failure and cancellation (`tests/cleanup-working-render.log`).
- Typecheck and production build pass (`tests/cleanup-typecheck.log`, `tests/cleanup-build.log`). The existing 500 kB bundle advisory remains.
- `DESIGN.md` replaces Save-era wording with Working, persistent edits and freezing. Three retrospective summaries separate the original implementation from the later inline-card decision.
- The initial complete core run finished in 1205.12 seconds: 107 files passed, two failed; 808 tests passed, three failed and one was skipped. The skip is the existing opt-in faster-whisper integration. All four inherited failures passed in this run. Full output: `tests/cleanup-full-core.log`.
- All three new failures reproduced alone. The pin selector matched both the new transport and timeline pin; it now explicitly selects the timeline ruler. Undo must finish and editing become ready before that pin is clicked, so it uses its restored time. The split check now awaits the successful edit response before counting clips. The trim test scrolls the actual handle into the tracks viewport before reading drag coordinates; diagnostics showed its old coordinates hit the surrounding editor. No timeouts, behavior assertions or application UI code changed. The movable-shot scenario and the pin carry scenario pass after these corrections; logs: `tests/cleanup-movable-green.log`, `tests/cleanup-pins-green.log`.
- All four requested browser configurations pass: Working 2, parts 6, alternates 5, existing behavior 33 (46 total, one worker). These verify actual Working/frozen navigation and author labels; assembled seeking, playback and named-element pins; alternate choice, dismissal, undo and Review's chosen revision; keyboard pinning, comment persistence and existing playback. The alternates shell check covers dark/light at the required widths. Logs: `tests/cleanup-e2e-{working,parts,alternates,existing}.log`.
- Final typecheck passes after the test corrections (`tests/cleanup-typecheck-final.log`). The test corrections are committed in `04e8e60`.
- The second complete invocation exposed a further attachment-repair check that passed in the first run. It reproduced alone: the test inspected the insert position before Follow footage completed, then inspected the removed-moment warning before Undo completed. Waiting for each successful response and restored editing readiness makes the full scenario pass (`tests/cleanup-attachment-isolated.log`, `tests/cleanup-attachment-green.log`). Commit: `aea5b3a`; typecheck passes again. The second run's attachment case executed before this correction.
- That second invocation completed in 1077.57 seconds: 108 files passed and one failed; 810 tests passed, one failed and one was skipped (`tests/cleanup-full-core-final.log`). It is failed full-run evidence, not a green verification.
- The fresh complete invocation from `aea5b3a` passes: **109 files passed; 811 tests passed, one existing opt-in faster-whisper test skipped; exit 0**, in 1029.22 seconds. Command: `npx vitest run tests/core --maxWorkers=1 --reporter=verbose --bail=1`. Full output: `tests/cleanup-full-core-verified.log`. No failure triggered Bail; every core file ran. All four inherited failures and all corrected preview/gesture scenarios pass in this single run.

## Remaining work

The authorized code, test, documentation and UI review work is recorded. The plan remains In Progress pending owner-approved integration:

1. Owner approval to merge `codex/random-audio-seeds` and `fix/codex-run-cleanup` into `main`. `main` remains at `5f3a23d`; the seeds fix is `367c95e`. Nothing was pushed or merged.
2. After approval, integrate and verify the merged result, then mark the plan Done and regenerate the dashboard.

The original Intent still requires the seeds fix on main before the cleanup plan can be marked Done.

## UI review result

The owner approved two GPT-6.1-sol reviewers at high reasoning effort, then continuation with the proposed Playwright fallback. Independent assessments by `/root/ui_design_assessment` and `/root/ui_technical_assessment` used source, existing same-code captures and the detector because CUA had no connected browser. The technical reviewer saved its full report before a quota interruption. The parent completed fresh headless Chromium checks on isolated commit `78db54a`; these were not two independent live browser reviews.

- [Combined critique](../../.impeccable/critique/2026-10-18T15-38-26Z__web-src-storyboard-tsx.md): **25/40**. Priority findings: P1 continuous Working identity; P2 sheet submission discovery, local Undo and alternate labels on comments.
- [Technical audit](../../.impeccable/review/2026-10-18-codex-run-cleanup/assessment-b.md): **14/20, provisional**, supplemented by the [live completion record](../../.impeccable/review/2026-10-18-codex-run-cleanup/completion.md). Five P2 findings and one P3: desktop sheet height, typography roles, tab behavior, source-only nested audio controls, timeline pin styling and literal warning colors.
- [Font-size decision](../../.impeccable/review/2026-10-18-codex-run-cleanup/font-disposition.md): all 55 current occurrences are adjudicated; 39 shared CSS advisories match the inherited count, plus 16 in Review CSS. Preserve documented dense editor/numeral sizes; record specific body/library role drift for a focused follow-up. No blanket 16px change or detector ignores.
- Fresh checks prove viewing B leaves Working at `r1`, choosing B changes it to `r2`, Enter saves a pin with alternate `r2`, and Review advances B's local time and transform. They confirm no local sheet Undo, unchanged B after sheet Ctrl+Z, absent alternate label on the comment card, and unchanged Edits tab selection/focus after ArrowRight.
- At 1600×1000 the desktop sheet measured 900×999.05, extending to y=1036.05; its scrim scrolls. Light Storyboard has no horizontal overflow at 1600/390px, and the 390px sheet fits this fixture. Representative captures and raw results are committed beside the completion record.
- Frozen v1 loaded `r1`; a fresh return-to-Working wait timed out. The earlier regression passed that path. This remains an unresolved discrepancy, not a diagnosed defect or a fresh pass. Screen-reader, zoom, induced errors, performance tracing and the nested audio fixture were not tested.
- Browser detector injection ran on all three surfaces, logging 1/3/1 browser advisories. The saved CLI scan has 58 advisories: 55 typography and three color. No owner-visible overlay remains. Review browsers/fixture servers closed and the diagnostic server stopped. The isolated production build passed; no application code changed and the full core/browser suites were not repeated for review-only records.

Findings are follow-ups only. Questions skipped because this cleanup authorizes recording the review, not implementing its suggestions.

## Scope

No engine changes, real-reel edits, external sends or merges to `main`. The untracked inline-card plan/mockup and local media belong to other work and remain untouched. The inherited failed full runs remain recorded as failures in the source brief.

The viewer regression rewrites historical screenshots and measurements under the October 15 summary. This run's generated copies are preserved under `tests/artifacts/codex-run-cleanup-review/render-viewer/`; the historical tracked files were restored. The temporary review fixture server was stopped.

Impeccable setup reports `.impeccable/design.json` older than `DESIGN.md`. Refreshing the sidecar with `$impeccable document` is a separate follow-up; this cleanup does not repair Impeccable metadata.

A source-only follow-up remains in `web/src/review/_internal/MediaEditor.tsx`: the legacy-media hint still says "Save freezes the media used by the new version." The cleanup corrects `DESIGN.md`; it does not change editor copy. This hint has not been verified on a running legacy surface in the UI review.
