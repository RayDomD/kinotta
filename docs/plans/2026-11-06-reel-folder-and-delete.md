---
title: reel-folder-and-delete
date: 2026-11-06
status: Draft
summary: Keep everything a reel owns in its own folder, then add Delete reel and Delete version that leave nothing behind, with foldable rail sections.
spec: docs/mockups/2026-11-06-reel-delete-version-list.html
---

## Intent

- Problem: A reel's files are scattered. Its comments, notes and markers live in `reels/.kinotta/<slug>/`, apart from the reel folder. There is no way to delete a reel or a saved version, and the rail lists reels and versions with no way to fold them.
- Why: Versions pile up on their own (every Video render and every sent comment batch can save one), and a delete that misses files leaves orphaned data.
- Proposed outcome: A reel's own files are in `reels/<slug>/`. Deleting a reel or a version removes everything it owns, and the rail's Reels and Saved versions sections fold.
- Affected: `server/core/_internal/state.ts`, `watch.ts` and the 7 other files that name the state path, `server/core/index.ts`, `server/http/_internal/handler.ts`, `web/src/App.tsx` (`VersionRail`), `skill/kinotta/**` docs that name the old path, `DESIGN.md`.
- Constraints: Finals and Overlays stay in `output/<slug>/` (owner decision, 2026-11-06; commits 011c6fc, 0efdd33). Footage stays: it belongs to the project. Shared caches named by content stay shared. Existing projects keep working: a one-time move on open, never a lost comment.
- Out of scope: Moving Finals into the reel folder. Moving the shared caches (`footage/.playback`, `.proxy`, `.audio`, `.transcripts`, `.waveforms`, `reels/.kinotta/stills`) into one folder; that is a later, separate step if wanted. A Save button.
- Open questions: What Delete does to an open reel (proposed: refuse; the owner opens another first). Whether a version the Current reel is built on can be deleted (proposed: refuse). Both are in the mockup as proposals.

## Goal

Two PRs. PR 1 moves a reel's state into its folder. PR 2 adds delete and the foldable rail.

## Approach

**PR 1, the move.** The state path is built in `state.ts` (`stateFilePath`) and `watch.ts`. Point both at `reels/<slug>/.kinotta/`. On opening a project, move any `reels/.kinotta/<slug>/` into its reel folder, once, copying first and removing the old folder only after the copy is read back. Update the skill docs that name the old path. Project-level files in `reels/.kinotta/` (stills, effects box) do not move.

**PR 2, delete.**
1. `deleteVersion(slug, n)`: removes the version folder, its state file, and its renders in `reels/<slug>/renders` and `output/<slug>`.
2. `deleteReel(slug)`: removes `reels/<slug>/` and `output/<slug>/`, then sweeps shared caches that no surviving version references.
3. Both refuse while a render or agent build is running on the reel. They also refuse to delete the open reel, or a version the Current reel is built on.
4. Rail: Reels and Saved versions fold (both folded by default, a one-line summary each, remembered per project). Delete shows on rows in an open section and opens a confirm sheet that lists what goes. Per the mockup.
5. `DESIGN.md` records the rail and the sheet.

## Steps

PR 1
- [ ] Write a test that opens a project with the old layout and checks every comment, note and marker is read from the reel folder afterwards. Proof: test fails before the change, passes after.
- [ ] Point `state.ts` and `watch.ts` at the reel folder and add the one-time move. Proof: the test passes; opening RayDom (a copy of it) keeps all comments.
- [ ] Update the skill docs. Proof: `grep -rn "reels/.kinotta" skill` shows only project-level files.

PR 2
- [ ] Write the "leaves nothing" test: build a reel with versions, comments, renders in both places, alternates and a shared cache; delete; assert the project tree equals the tree before the reel existed. Proof: fails before, passes after.
- [ ] A second test where another reel still uses a cache: delete keeps it. Proof: passes.
- [ ] `deleteVersion`, `deleteReel`, the refusals, and the HTTP routes. Proof: tests above, plus a refusal test per case.
- [ ] Foldable rail, Delete rows and the confirm sheet. Proof: driven in the running editor on a copy of RayDom: fold and unfold, delete a version, delete a reel, Escape cancels, the open reel's Delete is refused.
- [ ] `npm run typecheck`, unit tests, and `npx vitest run --project render` for any change under `web/src/review/**`. Proof: output shown.

## Risks

- A failed move could lose comments. Mitigation: copy, read back, then remove; keep the old folder if anything differs.
- The sweep could delete a cache another reel needs. Mitigation: it only removes caches no surviving version names, and the second test covers it.
- Windows holds files briefly after a render is killed, so removal retries (see `CLEANUP_RETRIES` in `render.ts`).

## Checks to run

- The two delete tests and the move test.
- Fold, delete and refusal behaviour in the running editor, on a copy of RayDom (never the real project).

## Changelog

### 2026-11-06
- Plan created. Owner decided: keep `output/`, move state into the reel folder.
