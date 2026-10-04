---
title: Comments carry forward by remapping (T35)
date: 2026-10-05
status: Done
summary: T35. Unsent comments follow their moment to the next version through source time, for Saves and agent builds alike; a comment whose moment was snipped keeps its text and shows "moment removed".
spec: docs/tickets-review-edit.md T35 (#37); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: Unsent comments only moved to the next version when their section was unchanged, so a snip and Save left the comments on the old version, or at times that no longer match the footage.
- Why: Editing the timeline shifts every moment after a snip. A comment is about a moment of the footage, so it has to move with that moment (E15).
- Proposed outcome: Each unsent comment maps old timeline time to source time (old version's pieces) to new timeline time (new version's pieces). A comment whose moment was snipped is kept with its text and marked "moment removed".
- Affected: `server/core` (carry, comments, state, types), the HTTP comments route, the comments column in `web`, the carry tests.
- Constraints: Sent comments stay frozen on their version. Settling stays once-only and runs on first touch or when the watcher sees the version, so it covers Save and agent builds the same way.
- Out of scope: A re-pin control (a re-pin is a new pin plus Delete on the old card), carrying sent comments, T41's hand-off.
- Open questions: none.

## Goal

After Save or an agent build, every unsent comment of the version before sits on the new version at its remapped time, or is marked `moment-removed`.

## Approach

- `carriedComment` maps `pin.time` with the two versions' pieces (`Version.pieces`; none means one piece over the whole version, so a code-only reel keeps its times). The pin's shot is the new shot that plays at the mapped time. Element and word pins keep their element or word; both follow because the time follows.
- A moment in a snip: the comment is carried with `state: 'moment-removed'`, placed where the snip closed up (the start of the next piece in the source). The state sticks across later versions until the comment is deleted.
- The "section changed" test goes. Nothing is left behind any more, so `carryNotice`, its HTTP field, the carry line in the comments column and `carriedTo.notCarried` are removed. `waiting` (sections still with Claude) is unchanged.
- The comments column shows "Moment removed" on such a card.

## Steps

1. Update the carry tests to the new rule (red), then rewrite `carriedComment` (green).
2. Add Save tests on the founder-talk sample and a started reel: remapped times, a snipped moment, an agent-built version.
3. UI: card state, remove the carry line; e2e on the existing snip-save server.
4. Typecheck, unit, e2e; summary, ticket, index.

## Risks

- A version with no readable pieces falls back to one piece over its duration, so a footage reel version without its own plan maps by identity.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, `rtk proxy npm run test:e2e`.

## Changelog

### 2026-10-05
- Plan created.
- Done. See `docs/session-summaries/2026-10-05-comments-carry-by-remapping-summary.md`.
