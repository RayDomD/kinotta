---
title: Snip and Save (T32)
date: 2026-10-05
status: Done
summary: T32. An edit list of operations (snip first) kept in the reel folder, an Edits panel and Snip tool in Review, and Save building the next version from the sources atomically.
spec: docs/tickets-review-edit.md T32 (#34); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: I can play a reel but not change it. Removing a stumble still needs an agent.
- Why: Snip and Save is the heart of the phase; every later edit (undo, blade, words, captions, clips, offsets, hand-off) is another operation kind in the same list.
- Proposed outcome: The Snip tool removes a stretch and closes the gap. The change is an operation in the reel's edit list, listed in an Edits panel. Save writes it into the sources, builds `v<n+1>` with no agent, and clears the list. Discard drops it. The rail says who made each version.
- Affected: `server/core` (edit list, Save, version builders, `builtBy`), `server/http`, `web/src/api`, `web/src/review`, `App.tsx`, the Kinotta skill's rules for per-version copies.
- Constraints: Build to `docs/mockups/2026-10-05-review-edit.html`. Save is atomic: no `v<n+1>` unless everything succeeded, `shots.json` last, edit list kept on failure. Python only through the runner.
- Out of scope: Undo, redo, remove one (T33), Blade and reorder (T34), comment carry-forward (T35), words, captions, clips, offsets, hand-off block (T41; the check is a stub with its hook).
- Open questions: none; decisions below.

## Goal

T32's seven criteria met, with an edit list that later operation kinds extend by adding one union member, one apply function and one description.

## Approach

- Core: `edit-list.ts` holds the typed `Operation` union (`snip`), the pure `applyOperation(sources, op)` (one function per kind) and `describeOperation`. The list lives at `reels/<slug>/edit-list.json` (`{ base, operations }`), written atomically on every change. A browser-safe `server/core/model.ts` re-exports the pure parts (pieces mapping, apply) so the editor previews with the same code Save uses.
- Version builder: `version-build.ts` stages a version in `reels/<slug>/.save/` (plan and transcript copies with paths rewritten for the version folder, page, shots stage, `edits.json`, then `shots.json` last with `builtBy` and `changedSections`) and publishes it with one rename. `startReel` builds v1 through it too, so v1 also keeps its own plan and transcript (E14).
- Save: refuse an empty list, a stale base and a batch that is out (stub `batchOut`, T41's hook); apply the operations to the plan and words; stage and build; write the reel's `plan.json` and `transcript.json`, then rename. Any failure restores the sources and removes the stage; the list stays. Then the list is cleared.
- Read side: `Version.builtBy`, `VersionEntry.builtBy`; a version's own transcript and plan are already read first (T31), now covered by a test (T28's criterion).
- HTTP and UI: `GET/POST/DELETE /api/reels/:slug/edits`, `POST /api/reels/:slug/save`. Review previews the edit list over the version's pieces (the lanes remap through the same mapping), the Snip tool (S) drags a stretch then Snip, a right column with Edits and Comments tabs, Save and Discard. The rail shows "Saved by you" or "Built by <agent>".

## Steps

1. Failing core tests (edit list, Save, atomic failure, per-version files, T28), then core.
2. HTTP and client, Review UI, CSS.
3. Playwright (port 4385): snip a stretch and Save.
4. Full checks, rebuild the footage sample if the engine output changed (it should not).

## Risks

- A plan's clip paths are relative to the plan; the version copy rewrites them one level up.
- `changedSections` must agree with the content comparison or `claimMismatch` appears; it is computed from the sections' timeline spans before and after.

## Follow-up: agent-built footage reels

Problem: T32 only edited reels with a `plan.json` in the reel folder. An agent builds a footage reel from the project's
`motion/plan.json` (`build.py --plan motion/plan.json reels/<slug>/v<n>/index.html`), so those reels got `invalid`.
Decision: `_internal/sources.ts` `readReelPlan` is the one resolver, used by the edit list and Save. A reel-folder `plan.json` wins
(Kinotta-started reels each own a plan, so one shared plan would collide); otherwise a footage reel (reel.json `footage`) uses
`motion/plan.json`; otherwise `invalid` with "built from code" (code-only edits are T40). The plan's folder is its base for relative
paths, so the version's plan copy is rebased from there to the version folder (video, clip fragments in `motion/clips`). Save writes
the edit into whichever plan was resolved, so an agent's next compose keeps it. The transcript is the plan's `transcript`, else the
reel's `transcript.json`.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, `rtk proxy npm run test:e2e`.

## Changelog

### 2026-10-05
- Plan created.
- Done. See the session summary.
- Follow-up: agent-built footage reels (see the section above).
