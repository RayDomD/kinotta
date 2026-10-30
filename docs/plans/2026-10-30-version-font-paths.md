---
title: Keep brand fonts resolvable in version plans (X6)
date: 2026-10-30
status: Done
summary: Rebase brand font paths on build and retain font bytes on freeze.
spec: .herdr/briefs/2026-10-30-app-fixes-codex.md
---

## Intent

- Problem: Moving a plan into a version changes the path base for brand.fonts[].file, but versionPlan only rewrites video, transcript and graphics.
- Why: Build and freeze fail with a missing font even though the authored path is valid.
- Proposed outcome: Versions build with the intended font and frozen plans keep usable font references.
- Affected: server/core/_internal/version-build.ts and focused build/freeze tests.
- Constraints: Preserve font metadata and the original plan; use the existing dependency preservation mechanism.
- Out of scope: Font selection, typography changes, engine/skill edits, existing published versions.
- Open questions: None.

## Goal

A relative brand font path resolves to the same font from a staged version. A frozen version retains its font bytes independently of later source edits.

## Approach

Rewrite brand.fonts[].file alongside existing plan paths. Rebase for ordinary legacy builds; preserve through the existing graphicPreserver when sources are frozen or the native media snapshot already preserves graphics. Clone the brand and font records instead of mutating inputs.

## Steps

1. Save the plan, add real staging tests for build and freeze, observe missing-font failures.
2. Rewrite font paths with the same stage path base as other dependencies.
3. Verify embedded bytes, saved plan references and input immutability; review; commit; PR.

## Risks

Use the same preserver instance as clip dependencies to avoid filename collisions. Keep absolute paths supported by existing path handling.

## Checks to run

Staging test red/green; brand-font tests; relevant save tests; typecheck/mojibake.

## Changelog

### 2026-10-30
- Traced versionPlan at version-build.ts:45; brand_assets reads plan_dir/font.file at skill/kinotta/engine/brand.py:18-21. No skill modification needed.

- Both staging tests failed with missing-font errors before the fix. All 11 font/build/graphic preservation checks pass afterward; embedded and preserved bytes match, inputs remain unchanged. Typecheck, mojibake and diff checks pass. Agy: no findings.
