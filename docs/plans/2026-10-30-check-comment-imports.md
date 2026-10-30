---
title: Check unresolved script references before Copy (X3)
date: 2026-10-30
status: Done
summary: Report unresolved imports, including from-quoted paths in comments, before freeze fails.
spec: .herdr/briefs/2026-10-30-app-fixes-codex.md
---

## Intent

- Problem: The freezer reads from-quoted text in script comments as a dependency, but check silently ignores missing scripts.
- Why: Copy can fail while saving a reel that check accepted.
- Proposed outcome: kinotta check rejects that input with a useful script reference diagnostic.
- Affected: server/core/_internal/contract.ts and tests/core/check.test.ts.
- Constraints: Match the current freezer dependency interpretation; do not change authored scripts or execute code.
- Out of scope: Parser replacement, skill edits, published assets, other fixes.
- Open questions: None.

## Goal

Unresolvable local script dependencies, including from "x" inside comments, produce a contract issue and a nonzero CLI exit instead of being silently skipped.

## Approach

The scanVersionPage script graph already follows the same import pattern as graphic-preservation.ts. Collect a script-import issue when a local script cannot be read, and include those issues alongside the existing page checks. Preserve project containment and cycle protection.

## Steps

1. Save plan, then add a CLI regression with inline and external script comments.
2. Observe failure, add the diagnostic, rerun CLI and contract tests.
3. Read agy's findings, commit and open this item's PR.

## Risks

Do not read outside the project or change the page-owned sound prohibition. Valid imports must continue to pass.

## Checks to run

CLI regression before/after; check and contract unit suites; typecheck and mojibake.

## Changelog

### 2026-10-30
- Traced contract.ts:108-131: missing files return silently; graphic-preservation.ts:20 uses the same from/import matcher.

- Two CLI tests failed with exit 0 before the fix and pass with exit 1 afterward. All 34 check/contract tests, typecheck and mojibake pass.
