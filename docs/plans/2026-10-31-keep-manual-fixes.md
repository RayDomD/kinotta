---
title: Keep manual fixes when reprocessing
date: 2026-10-31
status: In Progress
summary: Prove with tests that the owner's word, timing, caption and phrase fixes survive a new transcription and an agent rebuild, then lock fixed sources so nothing reprocesses over them.
spec:
---

## Intent

- Problem: It is unknown whether the owner's fixes survive reprocessing. What the code shows today:
  - Word fixes are `word-text` and `word-timing` operations in the edit list (`edit-model.ts`). They name a
    word by its source start within 5 ms (`2026-10-05-fix-and-retime-words.md`). A new transcription with
    slightly different times could leave them naming nothing.
  - Native-media words are cached by content hash in `footage/.transcripts/<hash>.json`
    (`media-speech.ts`). A failed job starts again, and nothing re-runs a finished one, but nothing stops a
    deleted cache or a future "retranscribe" from replacing it.
  - The footage-reel skill tells the agent to run `transcript.py` and fix words in `transcript.json` itself
    (`stages/footage-reel.md`, step 4). An agent re-running step 4 on a later version would write a fresh
    transcript.
  - Phrase text (`phrase-text`), caption positions and dead-air cuts have the same question.
- Why: Voogle Sort's FAQ (voogle.app/sort/faq, read 2026-10-31) promises that once you correct a transcript,
  caption or face group, it skips that video when reprocessing. An editor that loses a hand fix costs trust
  more than any missing feature.
- Proposed outcome: Each kind of hand fix is known, by test, to survive each kind of reprocessing. Where one
  doesn't, Kinotta keeps it: a source with owner fixes is never re-transcribed over them, and an agent cannot
  replace its words without saying so.
- Affected: tests first (`tests/core/`, `tests/e2e/`); then possibly `media-speech.ts`, `sources.ts`,
  `carry.ts`, `edit-model.ts`, `skill/kinotta/stages/footage-reel.md` and `04-next-version.md`.
- Constraints:
  - Versions stay frozen, and earlier versions keep their own words (T36).
  - The skill never touches `edit-list.json` (SKILL.md hard rules).
  - AGENTS.md: a test showing the app is wrong, with no owner answer yet, is marked `test.fixme` with the
    reason, and an issue is opened for the fix.
- Out of scope: Face grouping (Kinotta has none); new kinds of fix.
- Open questions:
  1. When the owner deliberately asks for a fresh transcription, should Kinotta keep fixes whose words still
     line up and list the ones it drops (recommended), or refuse until the owner removes them?

## Goal

A matrix of tests, fix kind × reprocessing kind, with every cell passing or marked `test.fixme` with an issue.
Then the fixes needed to make them pass.

## Approach

**Fix kinds:** `word-text`, `word-timing`, `phrase-text`, `caption-position` / `caption-phrase-position`, a
restored or resized dead-air cut (`2026-10-20-editable-dead-air.md`).

**Reprocessing kinds:**
1. Save to a new version (expected to keep: T36).
2. An agent rebuild from a comment batch (stage 04) that writes a new version.
3. Simple mode's Regenerate (one agent pass over all pins, `2026-10-20-simple-mode-flow.md`).
4. A new transcription of the same source: cache deleted, or a re-run with word times shifted by 10–50 ms.
5. The agent re-running `transcript.py` on a footage reel.

**Fixes, only once tests show the need:**
- Mark a source "words fixed by you" when any word operation applies to it. `media-speech` then refuses to
  start a new transcription for it unless the owner asks, and says why.
- On an explicit fresh transcription, re-anchor each fix to the new word whose text and time best match
  (within a tolerance), and list those it could not place on the Edits card.
- Skill: stages 04 and footage-reel say never to re-run the transcript for a reel whose words the owner has
  fixed, and to read the fixed words from the version.

## Steps

1. Write the core tests for cells 1, 2 and 4, and the e2e tests for 3, using the existing fixtures and the
   injectable transcriber.
2. Mark failing cells `test.fixme` with the reason, and open one issue per behaviour that needs a fix.
3. Ask the owner the open question if cell 4 fails.
4. Implement the lock, then the re-anchoring, each turning its `fixme` tests back on.
5. Update the skill stages for cell 5.

## Risks

- Re-anchoring can attach a fix to the wrong word when a phrase repeats. Require both text similarity and time
  closeness, and drop the fix (listed) rather than guess.
- The lock must not block a first transcription that failed halfway.

## Checks to run

- `npm test`, `npm run typecheck`, `npm run test:e2e`.
- By hand: fix a word in Review, regenerate in Simple mode, and see the fix in the new cut's captions.

## Changelog

### 2026-10-31
- Plan created from the Voogle Sort FAQ comparison.
- Step 1: `tests/core/keep-manual-fixes.test.ts` holds the matrix for native-media and legacy word fixes.
  Findings:
  - **Fixed:** on a native-media reel, a word transcribed since the newest version could not be fixed at all. The
    editor shows the cached words (`MediaEditor.tsx`, `spoken`), but the core applied operations before filling
    speech, so `word-text` was refused with "There is no word that starts there". Working inputs now carry the
    cached words (`withCachedSpeech` in `edit-list.ts`). The stored anchor stays without them.
  - **Holds:** a fixed word stays in its saved version after the source is transcribed again; a fresh run with
    identical times keeps the fix on Working and in the next version; on a legacy reel, a rewritten
    `transcript.json` with times moved by 20 ms keeps the fix (Working reads the saved version's transcript).
    Asking to transcribe a ready source again reuses the cache.
  - **Open (`it.fails`):** on native media, a fresh transcription whose times move by more than 5 ms leaves the
    fix naming nothing, on Working before a save and after one. After a save it is worse: every later edit is
    refused. This is step 4 (lock, then re-anchor), issue #127.
  - A second fix in `save.ts`: Save's check for a version that only captures new speech now compares against
    Working as stored, since Working inputs carry cached words. Full core suite: the same 18–20 render, agent-process
    and sound-engine failures as the commit before this work, none in word or save tests.
  - Not yet covered: `phrase-text`, `word-timing`, caption positions, dead-air cuts, Simple mode Regenerate (e2e).
- Step 4 (issue #127): a fix re-anchors instead of the source being locked. Nothing re-transcribes a finished source
  today, so a lock alone protected nothing; the failure was the fix losing its word. `fixedWordIndex`
  (`edit-model.ts`) keeps the exact start (within 5 ms) first. Otherwise it takes the nearest word within
  `REANCHOR_SECONDS` (150 ms) that still reads the fix's `was`. A tie or a different text is refused, as before.
  A fix without `was` (every `word-timing`, and word fixes saved before the Words lane on native media sent it)
  must still match exactly, so T36's rule holds: removing a re-time that a later fix depends on is refused
  (`snip-save.test.ts`). The editor's own lookups keep the exact `wordIndexAt`. Both `it.fails` cells pass.
- `tests/core/render-fresh-speech-word.test.ts` checks the first fix in the browser: a word transcribed since the
  newest version is fixed in the Simple timeline, recorded, and saved into v2. Run against the code before the fix,
  the edit is never recorded.
- Still open: `phrase-text` and caption positions match words by range or start within 5 ms and do not re-anchor;
  dead-air cuts; Simple mode Regenerate end to end.
