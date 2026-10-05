# Comments carry forward by remapping (T35, #37): run summary

Date: 2026-10-05. Branch: `feat/review-edit-phase` (local, not pushed). Plan: `docs/plans/2026-10-05-comments-carry-by-remapping.md`.

## What shipped

- Core (`server/core/_internal/carry.ts`): settling now carries every unsent comment of version n-1 to n. `remapMoment` maps the pin's
  time old timeline, source time (old version's pieces), new timeline (new version's pieces); a version with no pieces is one piece
  over its length. The pin's shot is the new shot playing at the mapped time. Element pins keep their element and word pins their word.
  The same code runs for a Kinotta Save and an agent-built version, since settling runs on first touch or when the watcher sees the folder.
- A moment inside a snipped stretch: the comment keeps its text and gets `state: 'moment-removed'` (`StoredComment`, `Comment`), pinned where
  the snip closed up (the start of the next piece in the source, else the end). The mark stays on later versions until the comment is deleted.
- The "section changed" rule is gone, so nothing is left behind: `carryNotice`, its HTTP field (`notCarried`), `carriedTo.notCarried`, the
  carry line in the comments column and `carried.moved` are removed. `Comment.carried` is now `{ to }`. `waiting` is unchanged.
- UI: a card shows "Moment removed" (the existing carry-state line, first); the unsaved-snip preview behaviour is unchanged.
- Docs: `server/core/README.md` and the skill's section 6 describe the new rule.
- Tests: `tests/core/section-batches.test.ts` carry tests rewritten to the new rule (same cases: unsent move and sent stay, shifted numbers,
  settles once, watcher, frozen batches, chain) plus a "through a snip" group (remapped times, moment-removed, mark persists, reordered pieces);
  `tests/core/snip-save.test.ts` +1 (real Save on the agent-built sample: remapped times, one moment removed);
  `tests/e2e/section-batches.spec.ts` updated (section 01 comments now move; no carry line); `tests/e2e/snip-save.spec.ts` extended (the agent-built
  snip-and-Save test pins three comments first and checks the "Moment removed" card and the word's new time).

## Decisions and deviations

- Pin time after a carry is the remapped moment, so after a snip a frame pin's time can differ from its shot's start (the old doc said "the shot's start").
- No re-pin control was built; the ticket asks for the state and the card text. Re-pinning is a new pin plus Delete on the old card.
- Removing `carryNotice` and the carry line goes beyond editing the rule, but nothing can feed them any more.
- A version of a footage reel that has no plan of its own and no reel plan maps by identity (one piece over its length).

## Checks

- `npm run typecheck`: clean.
- `rtk proxy npm test`: 26 files, 243 tests passed.
- `rtk proxy npm run test:e2e`: 89 passed. Two orphaned e2e servers (ports 4399 and 4398, left by an interrupted run of mine) could not be stopped
  (the kill was denied), so the full run used a throwaway config with `reuseExistingServer: true` (deleted afterwards). Both were untouched by any spec before.
- The committed footage sample needed no rebuild (engine output unchanged).
