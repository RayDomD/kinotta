---
title: Pieces in the engine (T29)
date: 2026-10-05
status: Done
summary: T29. A footage plan may list pieces of the source video; build.py and shots.py put everything on the reel's timeline, and one core module maps source time to timeline time and back.
spec: docs/tickets-review-edit.md T29 (#31); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: A footage plan has no way to say which stretches of the video the reel keeps, so a snipped or reordered edit cannot be built.
- Why: Snip and Save (T32), the editor and carry-forward all need one answer to "where does this source moment land on the reel".
- Proposed outcome: A plan with pieces builds a page and shot list at timeline times; a plan without pieces builds exactly what it does today; core has one mapping module.
- Affected: `skill/kinotta/engine/build.py`, `skill/kinotta/engine/pieces.py` (new), `skill/kinotta/scripts/shots.py`, `server/core/_internal/pieces.ts` (new), `server/core/index.ts`, tests.
- Constraints: Plan times stay in source time. A plan without `pieces` is unchanged (drift test untouched). Python and TypeScript mappings agree.
- Out of scope: the editor, Save, offsets, caption positions, per-version plan copies, a spoken line for shots when pieces are present (core still matches shot lines to source-time words; T31/T32 read the plan's pieces).
- Open questions: none; decisions below.

## Goal

T29's five criteria met.

## Approach

- `engine/pieces.py`: `layout`, `span`, `timeline_words`, `timeline_plan`. build.py and shots.py call it first, so everything downstream sees timeline times.
- Decisions: a range crossing a snip is trimmed and closed up; if reordering splits it, the longest stretch wins. A word is kept when its start is inside a piece, its end cut at the piece's out. A caption phrase never runs across a piece boundary. A clip's stills keep clip-local times (those past a trimmed clip's end are dropped). Sections map to the span of what remains and vanish when wholly snipped. Page `duration` becomes the pieces' total. Pieces must not overlap in the source.
- `pieces.ts`: `pieceMap(pieces, videoLength)`, `toTimeline`, `toSource`, `toTimelineSpan`, `toSourceSpans`, exported from `server/core/index.ts`.

## Steps

1. Failing tests: core mapping, engine build and shot list with pieces.
2. pieces.py, build.py, shots.py; pieces.ts and export.
3. Full checks.

## Risks

- Python and TypeScript mappings drifting; both are covered by tests over the same snip and reorder shapes.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, `rtk proxy npm run test:e2e`.

## Changelog

### 2026-10-05
- Plan created and built under the Review and Edit run. Typecheck clean, 174 unit tests, 80 e2e passed. Done.
