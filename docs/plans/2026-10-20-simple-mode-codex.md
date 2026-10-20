---
title: Simple mode phases 2 and 3 execution
date: 2026-10-20
status: Done
summary: Remove approval and expose the current reel through Simple mode with timeline feedback
spec: docs/briefs/2026-10-20-simple-mode/codex-phase-2-3.md
---

## Intent

- Problem: Approval and version navigation obscure the creator's drop, preview and feedback loop.
- Why: Execute the approved simple-mode flow, steps 5–9.
- Proposed outcome: Default Simple mode, a persistent local profile, Make, preview, required-note timeline pins and copy-request Regenerate.
- Affected: Approval API, detailed editor navigation, simple surface and interaction tests.
- Constraints: Work only in sm-codex. Preserve version storage, animated revisions and chosen Working playback. No push or merge.
- Out of scope: Agent launch, automatic cutting, alternate generation and export changes.
- Open questions: None for these phases.

## Goal

Complete phases 2 and 3 with separate commits and recorded validation against the unchanged baseline.

## Approach

Reuse Working, DropZone, pinned comments, the existing player and comment-batch services. Keep machine preferences in browser local storage, matching the approved mockup.

## Steps

1. Capture the unchanged Vitest baseline and inspect the running editor against the saved mockups.
2. Remove approval service, route and UI; relocate version-directory validation. Show Current and existing Undo instead of numbered history. Validate and commit Phase 2.
3. Add the About you profile, default Simple mode and same-reel editor switch. Reuse DropZone and reel creation for Make.
4. Add vertical preview, timeline pin composer with required notes, persistent pin list, jump controls and bracket navigation. Regenerate copies existing batches.
5. Typecheck, run full Vitest and relevant Playwright including the exact new flow; inspect screenshots. Record failures and unfinished work, then commit Phase 3.

## Risks

Full render tests depend on browser and FFmpeg process access and can fail under load. Baseline evidence must distinguish these failures from regressions.

## Checks to run

`npx tsc --noEmit`; `npx vitest run --maxWorkers=2`; relevant Playwright flows and a new Simple pin flow.

## Changelog

### 2026-10-20
- Saved execution plan before code edits, based on the explicitly assigned brief.
- Completed phases 2 and 3. Phase 2 committed separately after targeted checks passed. Captured the unchanged full baseline, ran the post-change full suite, resolved the additional failures through targeted reruns, and recorded the two remaining baseline failures in codex-result.md. Verified 24 distinct focused browser scenarios and inspected desktop/mobile captures.
