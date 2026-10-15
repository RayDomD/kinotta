---
title: movable-shots-save-fixes
date: 2026-10-12
status: Done
summary: Saving a moved shot keeps each storyboard still where it was in its shot and changes only timing in the page.
spec:
---

## Intent

- Problem: Saving a shot move on a code-built reel moves every storyboard still to its scene's first frame, and rewrites the whole page through an HTML parser to change a few attributes.
- Why: The showcase draws each still 0.35s before its scene ends. One timing Save would turn all twelve stills into frames where nothing has animated in. A reserialised page can differ from what the agent wrote.
- Proposed outcome: After Save, a still sits at the same moment of its shot as before, and the saved page differs from the one before only in the timing that changed.
- Affected: `server/core/_internal/save.ts`, `server/core/_internal/code-edits.ts`, `tests/core/movable-shots.test.ts`.
- Constraints: Saved versions stay frozen. The duration marker a Save adds must still be read by the renderer. Existing Save and render tests keep passing.
- Out of scope: Reel length after a shot moves later and back (F3). It follows decision D3 of `2026-10-12-movable-shots.md`. The pause at cuts in the showcase page.
- Open questions: none.

## Goal

A timing Save keeps each still's offset inside its shot and leaves every byte of the page alone except
the changed `data-start`, `data-duration` and reel duration.

## Approach

D1: A still keeps its distance from its scene's start. When a trim leaves that moment outside the
shot, it keeps its distance from the scene's end instead, and never falls before the shot's start.

D2: The parser only locates each scene's opening tag in the source. The two attribute values are
replaced in the source text. The duration script is added or replaced only when the length changed.

## Steps

A1: Add failing tests for a still that is not at its scene's start and for an untouched page.
A2: Fix the still time in `save.ts`.
A3: Rewrite `writeSceneTiming` to edit the source text in place.

## Risks

R1: A scene tag whose attribute value holds `>` would end the tag early for the text edit. The scan
skips quoted values to avoid it.

## Checks to run

- `npm run typecheck`
- `npm test -- tests/core/movable-shots.test.ts tests/core/code-only-edits.test.ts tests/web/edited.test.ts`
- `npm test -- tests/core/render-movable-shots.test.ts tests/core/render-save.test.ts`

## Changelog

### 2026-10-12
- Plan created from review findings F1 and F2, approved by the owner.
- Completed. A still keeps its offset inside its shot, and Save rewrites only the changed timing values in the page source.
- Checks: typecheck passed. 40 tests in 5 files passed (movable-shots, code-only-edits, edited, render-movable-shots, render-save). The rewrite applied to a scratch copy of the showcase v15 page changed three lines: two scene tags and the added duration script.
