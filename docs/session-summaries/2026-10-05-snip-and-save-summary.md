# Snip and Save (T32, #34): run summary

Date: 2026-10-05. Branch: `feat/review-edit-phase` (local, not pushed). Plan: `docs/plans/2026-10-05-snip-and-save.md`.
Ticket: T32 in `docs/tickets-review-edit.md`.

## What shipped

- Edit list (core): `server/core/_internal/edit-model.ts` holds the `Operation` union (`snip` so far), `applyOperation`
  (one function per kind), `operationTouches` and `describeOperation`; pure, so the editor reuses it through the browser-safe
  `server/core/model.ts`. `edit-list.ts` stores `{ base, operations }` at `reels/<slug>/edit-list.json`, outside every version,
  written atomically on every change. A list made on an older version is `stale`. Adding an operation checks it applies on top
  of the list (a snip already cut, outside the footage or removing everything is `invalid`).
- Version builder: `version-build.ts` stages a version in `reels/<slug>/.save/` (its own `plan.json` with paths rewritten for the
  version folder and clip fragments resolved, its own `transcript.json`, the page, `edits.json`, then `shots.json` last with
  `builtBy` and `changedSections`) and publishes it with one rename. `startReel` builds v1 through the same code, so v1 also
  keeps its own plan and transcript (E14).
- Save (`save.ts`): refuses an empty or stale list and asks `batchOut` (a stub returning null, T41's hook); applies the operations,
  stages and builds, then writes the reel's `plan.json` (and `transcript.json` when words change), renames the stage to
  `v<n+1>`, and clears the list. A failure removes the stage, restores the sources and keeps the list. `changedSections` comes
  from the operations plus each section's timeline span before and after, which is what the page comparison finds (no
  `claimMismatch`).
- Read side: `Version.builtBy` and `VersionEntry.builtBy`. A version's own transcript and plan were already read first (T31); a
  test now covers T28's criterion.
- HTTP: `GET/POST/DELETE /api/reels/:slug/edits`, `POST /api/reels/:slug/save`; client functions in `web/src/api`.
- Review UI: the lanes, playback, page frame, captions, words and pins show the version with the unsaved operations applied
  (the core's model, remapped); the Snip tool (S, Select is V) drags a stretch on the lanes then Snip or Enter; SNIP joints show
  the length; Edits and Comments tabs in the right column with numbered cards, Save as v<n+1> and Discard; the rail shows
  "Saved by you" or "Built by <agent>".
- Tests: `tests/core/snip-save.test.ts` (7, real Python build), `tests/core/edit-model.test.ts` (5), `tests/web/edited.test.ts` (5),
  `tests/e2e/snip-save.spec.ts` (2, own server on port 4385). `start-reel.test.ts` now expects v1's four files.

## Decisions and deviations

- Superseded by the follow-up below: agent-built footage reels are editable too.
- Tools: Select and Snip only; Blade comes with T34. Undo, redo and removing one card are T33, so cards have no undo yet.
- Discard has no confirmation (the mockup shows a plain link).
- The page frame is the saved version's, seeked to the matching saved time, so a clip straddling an unsaved snip is not trimmed
  in the preview until Save. Pins inside a snip are hidden in the preview; carry-forward of comments through Save is T35, so
  comments on v1 do not move to v2 yet when the shot times shift.
- A snip at the very start or end of the footage has no neighbour piece, so no SNIP joint is drawn for it; the Edits card and
  the shorter timecode show it.
- The skill's rules still say a version has no copies of the transcript and plan (that text belongs to the hand-off ticket, T41);
  the core reads copies when present and falls back to the reel's files.
- No `parallel.md` exists in the repo or the scratchpad, so no e2e lock was taken; no other agent was running.
- The committed footage sample did not need a rebuild (engine output unchanged).

## Checks

- `npm run typecheck`: clean.
- `rtk proxy npm test`: 26 files, 221 tests passed.
- `rtk proxy npm run test:e2e`: 86 passed. The first full run had one failure in `review.spec.ts` (the timecode read 0.23 s while the
  video was past 0.6 s, a timing assertion under 11 servers); it passed alone and in the second full run.

## Follow-up (2026-10-05): agent-built footage reels

- Fixed: T32 gave agent-built reels (plan in `motion/plan.json`) an `invalid` error. `server/core/_internal/sources.ts` is now the one
  resolver for a reel's plan, used by the edit list and Save: reel-folder `plan.json` first (Kinotta-started reels), else the
  project's `motion/plan.json` for a footage reel, else `invalid` ("built from code"; code-only edits are T40). I kept two locations
  rather than unifying because Kinotta-started reels each need their own plan; `motion/plan.json` is the agent's single shared one.
- The version's plan copy is rebased from the plan's folder to the version folder, so the footage and `motion/clips` fragments are
  found. Save writes the edit into the resolved plan (`motion/plan.json`), so an agent's next build keeps it, and builds v2 with
  `builtBy` you, `edits.json`, its own plan and transcript. The transcript is the plan's `transcript`, else the reel's `transcript.json`.
- Tests: `tests/core/snip-save.test.ts` +2 (Save on a copied footage-project, 4 clips; code-only reel refused with a clear reason),
  `tests/e2e/snip-save.spec.ts` +1 (snip and Save founder-talk). Checks are in the final report of this follow-up.
