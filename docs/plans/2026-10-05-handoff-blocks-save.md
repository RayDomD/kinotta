---
title: A hand-off blocks Save (T41)
date: 2026-10-05
status: Done
summary: T41. Copying a batch marks the reel handed off and Save says why it is off; the next version replays the edit list onto its sources and flags edits whose target is gone.
spec: docs/tickets-review-edit.md T41 (#43); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: Save builds from the reel's sources while an agent may be rewriting them from a copied batch, so the two builds collide and one loses.
- Why: E-decisions on hand-off: only one writer of a version at a time, and the owner's edits must not be lost when the agent's version lands.
- Proposed outcome: While a batch is out Save says so and edits keep collecting; when the agent's version lands the edits follow onto it, and any that no longer fit are marked, not dropped.
- Affected: `server/core` (batch, edit list, Save, settling hook), `server/http` (one route), `web/src/review` (Edits panel), `playwright.config.ts`.
- Constraints: Neutral wording, no agent named. The hand-off lives in the reel folder, outside every version.
- Out of scope: Redoing a flagged edit automatically, the skill's rules (T46).
- Open questions: Block or exclude flagged edits on Save (decided below).

## Goal

A copied batch blocks Save until the next version or a cancel; the next version carries the edit list over with gone targets flagged.

## Approach

- Hand-off: `copyBatch` writes `reels/<slug>/handoff.json` `{ version, copiedAt }`. It is in force while `version` is the newest, so a newer version ends it with nothing to clear. `cancelHandoff(slug)` deletes the file (`DELETE /api/reels/:slug/handoff`).
- Save: replaces the `batchOut` stub; throws `invalid` with the reason. `EditList.handedOff` carries it so the panel shows it before Save is tried. Edits still collect.
- Replay: an edit list whose `base` is older than the newest version is replayed onto that version's sources (`readEditListNow`, run by the watcher's `version-added` path through the settling hook, and by any later read, so a missed event loses nothing). Each operation is applied in order; one that throws is flagged (`flagged[id]` = reason), kept, and left out of what the later ones are checked against. The base moves to the new version; undo history belongs to the old one and is dropped.
- Flagged edits and Save: blocked, with a reason naming the count. Excluding them silently would build a version missing something the owner asked for; blocking costs one click (Remove) and keeps Save honest.
- Panel: the hand-off note with "Cancel hand-off"; a flagged card is dashed (the mockup's `c flag`) with why; flagged edits are not previewed.
- Lock: `readEditList` now runs under the reel lock; internals use `readEditListNow`.

## Steps

1. Core tests, `handoff.ts`, edit list, Save, settling hook.
2. HTTP route, client, Edits panel.
3. Playwright `handoff.spec.ts` (port 4382).
4. Checks.

## Risks

- A replayed edit can apply to a changed target with a different meaning (a clip trim on a clip the agent re-timed). It is applied, not flagged; the owner sees it in the preview.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, e2e through a scoped scratch config (handoff, clips, snip-save, code-only).

## Changelog

### 2026-10-05
- Plan created.
- Done. See the session summary.
