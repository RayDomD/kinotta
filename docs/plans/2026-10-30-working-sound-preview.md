---
title: Preview Working sound before freezing (X4)
date: 2026-10-30
status: Done
summary: Resolve Working media against pending sources instead of the saved version.
spec: .herdr/briefs/2026-10-30-app-fixes-codex.md
---

## Intent

- Problem: Newly added Working sound requests use the base saved version, whose plan does not contain that source, causing 404s until freeze.
- Why: Sound must play while editing.
- Proposed outcome: Working sound is available immediately; saved versions retain their own media.
- Affected: media URL helpers, MediaEditor, HTTP context parsing, core media lookup, tests.
- Constraints: Preserve project containment, hashes, explicit saved-version identity and proxy fallback.
- Out of scope: Sound generation, mix changes, published files and other fixes.
- Open questions: None.

## Goal

Working preview and its extracted audio/waveforms resolve sources from pending media before freeze, without making those sources available through an older saved-version URL.

## Approach

Carry an explicit optional working flag through the existing media context and URL helpers. Resolve that context using readPendingMedia and its planDir in the media service. Keep saved lookups unchanged. Test HTTP before and after freeze and browser playback URL context.

## Steps

1. Save this plan and reproduce Working source 404 through HTTP.
2. Add explicit Working context to media lookup and editor URL construction.
3. Verify Working bytes, extracted audio, waveform and saved-version isolation; types; review; commit and PR.

## Risks

Working and saved requests must never share the same URL cache key. Avoid nested reel locks: readPendingMedia acquires its own lock before media resolution.

## Checks to run

HTTP regression red/green; media service tests; URL tests; typecheck; targeted browser interaction with shared lock.

## Changelog

### 2026-10-30
- Traced MediaEditor.tsx:140 and :413 to media-library.ts:77 and :138: saved-only lookups do not see pending placement-add sources. readPendingMedia at edit-list.ts:162 already exposes the correct paths.

- HTTP regression failed at 404 before the fix; passes including waveform/audio and saved-version isolation. Browser regression exposed the pending-source predicate gap; fixed per agy and passes. Media suites 13/13; proxy/audio/path guards plus URL regression 13/13. Typecheck, build, mojibake and diff checks pass.
