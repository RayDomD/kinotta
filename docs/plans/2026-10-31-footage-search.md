---
title: Search a project's footage
date: 2026-10-31
status: Draft
summary: Parked. Find a moment across all of a project's sources by what is said, later by what is on screen, and place it as b-roll.
spec:
---

## Intent

- Problem: Finding b-roll means remembering which file holds it and scrubbing through it. The project's
  transcripts already exist (`footage/.transcripts/<hash>.json`, `media-speech.ts`), but only each source's
  own Words lane shows them, one source at a time.
- Why: Voogle Sort (voogle.app/sort/faq, read 2026-10-31) is built around searching footage "the way you
  remember it": by words, by what is on screen, by people and by place. For Kinotta only the first two serve
  editing a reel, and the first costs little because the data is already on disk.
- Proposed outcome: One search box over the project's media. Typing words lists every source and moment where
  they are said, and a result opens at that moment and can be placed on the timeline. Later, a search can also
  describe what is on screen ("city at night").
- Affected: `server/core/_internal/media-speech.ts` / `media-library.ts` (an index), the HTTP handler, the
  media panel in `web/src/review/_internal/MediaEditor.tsx`.
- Constraints:
  - Local first: the word index is built from cached transcripts and stays on disk. Searching what is on screen
    may send stills to the owner's own agent, never to a third party Kinotta chooses (PRODUCT.md: no keys
    shipped).
  - Placing a result is the existing `placement-add` operation. It changes Working and can be undone.
  - The editor never holds client assets outside the project (PRODUCT.md).
- Out of scope: Face grouping, maps and GPS, a library outside the project, and sorting files into folders.
  These are Voogle Sort's product, not an editor's.
- Open questions:
  1. When to schedule it: after Simple mode and portrait reels ship (recommended)?
  2. Do on-screen descriptions come from the agent (reads stills; costs the owner's plan) or a local image model
     (no cost per search; a model download)?

## Goal

Phase 1: search words said across every transcribed source in the project, open a result at its moment, and
place it. Phase 2, a separate plan: on-screen search.

## Approach

- Phase 1: an in-memory index of every cached transcript in `footage/.transcripts/`, mapped back to sources
  by content hash, rebuilt when a transcription finishes. A query matches words and short phrases and returns
  source, time and the surrounding line. The media panel gets a search field and results that open the source
  at that moment.
- Phase 2: one still every few seconds per source (`media-stills.ts` exists), described once and cached by
  hash, then searched as text.

## Steps

1. Schedule with the owner (open question 1).
2. Phase 1 core index and tests, route, media panel search, e2e test: search a word, open the result, place it.
3. Write the phase 2 plan once phase 1 is in use.

## Risks

- Sources that were never transcribed don't show up in results. Show "N sources not transcribed" with a
  Transcribe action.

## Checks to run

- `npm test`, `npm run typecheck`, `npm run test:e2e`.

## Changelog

### 2026-10-31
- Plan created from the Voogle Sort FAQ comparison and parked until scheduled.
