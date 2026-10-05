# Pieces in the engine (T29, #31): run summary

Date: 2026-10-05. Branch: `feat/review-edit-phase` (local, not pushed). Plan:
`docs/plans/2026-10-05-pieces-in-the-engine.md`. Ticket: T29 in `docs/tickets-review-edit.md`.

## What shipped

- `skill/kinotta/engine/pieces.py` (new): maps a plan's source times onto the reel's timeline through `pieces`.
  `build.py --plan` and `shots.py` both call it first, so scenes, caption scenes, the shot list, sections, the
  Captions overlay and the page length sit at timeline times. A clip wholly in a snip is dropped; one crossing a
  snip is trimmed to what remains and closed up; words that start in a snip are gone, and a caption phrase never
  runs across a piece boundary. A plan without `pieces` takes the old path untouched.
- `server/core/_internal/pieces.ts` (new), exported from `server/core/index.ts`: `pieceMap`, `toTimeline`,
  `toSource`, `toTimelineSpan`, `toSourceSpans` and the `Piece`/`PieceMap` types. No pieces means one piece over
  the whole video.
- Tests: `tests/core/pieces.test.ts` (9, including reordered pieces and round trips) and
  `tests/engine/pieces.test.ts` (6, real Python build and shot list).

## Decisions and deviations

- Range split apart by reordering: the longest stretch wins (Python and TypeScript agree).
- A word is kept when its start is inside a piece; its end is cut at the piece's out.
- Stills keep clip-local times; stills at or past a trimmed clip's end are dropped.
- A section maps to the span of what remains and is dropped when wholly snipped. Pieces must not overlap in the
  source (error otherwise).
- Not done, by scope: core still matches a shot's spoken line against source-time words, so for a plan with
  pieces the spoken line needs the plan's pieces (T31/T32 read the version's own plan, E14).
- The committed footage sample did not need a rebuild; its drift test passes unchanged.

## Checks

- `npm run typecheck`: clean.
- `rtk proxy npm test`: 20 files, 174 tests passed.
- `rtk proxy npm run test:e2e`: 80 passed.
