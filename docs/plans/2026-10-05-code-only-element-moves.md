---
title: Move and scale elements on code-only reels (T40)
date: 2026-10-05
status: Done
summary: T40. The T39 drag works on reels built from code; Save copies v<n> to v<n+1> plus a kinotta-edits.css of translate and scale rules scoped by data-scene and data-el; timing tools are off with the reason shown.
spec: docs/tickets-review-edit.md T40 (#42); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: A reel built from code (no footage, no plan) cannot be nudged or resized in Kinotta; every placement fix goes back to the agent.
- Why: Placement fixes are most of what review finds, and E16 says code-only reels get element moves and scale, nothing else.
- Proposed outcome: Drag or scale an element on a code-only reel, Save, and the next version shows it moved. Timing tools say why they are off.
- Affected: `server/core` (code-edits, edit list, Save, version read, change detection), `web/src/review`, `playwright.config.ts`.
- Constraints: The agent's page code is untouched (ADR 0001: data-scene and data-el are the contract). The new version is a copy of `v<n>` plus one stylesheet, built in a stage and renamed in, `shots.json` last, like T32.
- Out of scope: Timing edits, the skill's rules for `kinotta-edits.css` (T46), keyboard nudging (T47).
- Open questions: How a scene root is expressed (decided below).

## Goal

On a code-only reel the `element-offset` operation applies, and Save writes `v<n+1>` = `v<n>` plus `kinotta-edits.css`, linked from the page. Every other operation is refused with a reason.

## Approach

- Operation: reuse `element-offset { clip, element, x, y, scale }`; `clip` is the scene's `data-scene`. Each scene of the newest page stands in as a clip (with the offsets its stylesheet holds), so `applyOperation` is unchanged and the editor's preview code is reused.
- Scene root: `@clip`, as on footage reels. Its rule is the scene's own selector with no element part, `[data-scene="x"] { ... }`, which is what the engine writes for a clip root.
- File: one rule per line in `kinotta-edits.css`, `translate: Xpx Ypx; scale: k;` (only what is off home). Rules this file did not write are not kept; the file is Kinotta's.
- Accumulation: the new file holds the offsets `v<n>`'s file had, with the list applied over them (an operation replaces its element's offset; home removes it). A page that already links the file is not linked twice; if every offset is home the file stays, empty, so the link does not dangle.
- Save: copy `v<n>` into `.save/` without `shots.json`, write the css and link, `edits.json`, then `shots.json` (copied, with `changedSections` and `builtBy: you`) last, then one rename. Carry-forward (T35) runs on first touch as for any version. `changedSections` are the sections a scene with changed offsets plays in; change detection now reads the css rules for a scene as part of the scene, so the claim and the comparison agree.
- Editor: `Version.code` ({ scenes, offsets }) makes the Review tab treat the reel as element-editable: the drag and the Edits panel work, Blade and Snip are disabled with "Built from code" shown beside them, the S and B keys do nothing.
- Fix on the way: Review crashed on any reel without footage (two empty piece lists were mapped as pieces of no length); one shared empty list.

## Steps

1. Core test, `code-edits.ts`, edit list, Save, `Version.code`, change detection.
2. Web: scenes as clips, tools reason, Edits panel wording.
3. Playwright `code-only.spec.ts` (port 4383).
4. Checks.

## Risks

- A page that sets `translate` or `scale` on an element itself clashes with the rule.
- A scene name with a quote cannot be selected; scene names come from the page.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, e2e through a scoped scratch config (code-only, clips, snip-save, review, smoke, lanes, storyboard).

## Changelog

### 2026-10-05
- Plan created.
- Done. See the session summary.
