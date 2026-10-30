---
title: Copy retains clipboard permission (X2)
date: 2026-10-30
status: Done
summary: Start clipboard writes during the click while the saved batch supplies their text.
spec: .herdr/briefs/2026-10-30-app-fixes-codex.md
---

## Intent

- Problem: Copy waits for network saves before requesting clipboard access.
- Why: Browsers can expire click permission during that wait.
- Proposed outcome: Editor Copy and Simple regenerate copy the saved request despite slow saves.
- Affected: web/src/CopyButton.tsx, web/src/SimpleMode.tsx, a shared clipboard helper, tests/e2e.
- Constraints: Save notes first; copy exactly the server response; retain save and clipboard failure messages. No Working semantics change.
- Out of scope: Pin unlocking (X16), other request buttons, alternatives, skill documentation.
- Open questions: None; use the requested browser interaction seam.

## Goal

Clicking Copy immediately requests clipboard access, supplies the text after saving, and confirms only after both succeed. Simple regenerate follows the same behavior for its combined section requests.

## Approach

Pass promised text to ClipboardItem and invoke clipboard.write synchronously during the click. Share this narrow browser operation across the two batch-copy controls. Keep a writeText fallback where ClipboardItem is unavailable. Observe rejected clipboard promises immediately so save failures cannot cause unhandled rejections.

## Steps

1. Reproduce with a browser boundary that refuses clipboard requests after the click task and delays the save.
2. Add the smallest shared clipboard operation and wire both existing flows.
3. Verify save failure, clipboard refusal, and copied text; review agy's findings; commit and open an individual PR.

## Risks

ClipboardItem support varies; retain the existing fallback. A failed save must never mark the batch copied or write empty text.

## Checks to run

Scoped Playwright with one worker and the shared browser lock; typecheck; relevant architecture guards; full lane verification subject to the brief's one-worker limit.

## Changelog

### 2026-10-30
- Traced CopyButton.copy and SimpleMode.regenerate; plan saved before code edits.

- Both corrected browser regressions failed on original sources and passed with the fix. Existing multi-section clipboard-refusal test passed (3 total). Typecheck, build and mojibake checks passed. Agy encoding finding fixed.
