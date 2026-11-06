---
title: reel-folder-and-delete
date: 2026-11-06
status: In Progress
summary: Keep everything a reel owns in its own folder, then add Delete reel and Delete version that leave nothing behind, with foldable rail sections.
spec: docs/mockups/2026-11-06-reel-delete-version-list.html
---

## Intent

- Problem: A reel's files are scattered. Its comments, notes, markers and style live in `reels/.kinotta/<slug>/`, apart from the reel folder. There is no way to delete a reel or a saved version, and the rail lists reels and versions with no way to fold them.
- Why: Versions pile up on their own (every Video render and every sent comment batch can save one), and a delete that misses files leaves orphaned data.
- Proposed outcome: A reel's own files are in `reels/<slug>/`. Deleting a reel or a version removes everything it owns and breaks nothing that survives. The rail's Reels and Saved versions sections fold.
- Affected: `server/core/_internal/state.ts`, `watch.ts` and the 7 other files that name the state path, `server/core/index.ts`, `server/http/_internal/handler.ts`, `web/src/App.tsx` (`VersionRail`), `skill/kinotta/**` docs that name the old path, `DESIGN.md`.
- Constraints: Finals and Overlays stay in `output/<slug>/` (owner decision, 2026-11-06; commits 011c6fc, 0efdd33). Footage stays: it belongs to the project. Existing projects keep working and never lose a comment. A deleted version number is never reused.
- Out of scope: Moving Finals into the reel folder. Moving the shared caches into one folder. A Save button. Cleaning the OS temp folder (separate, see 2026-11-01-stop-tests-leaking-temp-folders).
- Open questions: none blocking. Defaults chosen, change on request: the open reel and a version the Current reel is built on cannot be deleted; version numbers are never reused.

## Goal

Two PRs. PR 1 moves a reel's state into its folder. PR 2 adds delete and the foldable rail.

Review tier: High (it deletes user files; `~/.claude/reference/review.md`). Five hunters, the verifier, `/security-review` and `/blast-radius` run, and the owner approves the merge. Executors per `~/.claude/rules/models.md`: heavy build on codex (fallback Sonnet, medium, in its own worktree), hunters on agy (fallback fresh-context Sonnet), verifier Opus, medium.

## Approach

**PR 1, the move.** The state path is built in `state.ts` (`stateFilePath`) and `watch.ts`. Point both at `reels/<slug>/.kinotta/`. The move runs on every project open, file by file, because an older build (another worktree, or a server still running) can keep writing the old folder:
- Only the old copy exists: move it (copy, read back, then remove).
- Both exist: keep the reel-folder copy, set the other aside under a conflict name, and tell the owner.
- It carries every file, including the reel's `style.json` (path derived in `style.ts:212`).

Project-level files in `reels/.kinotta/` (stills, effects box) do not move. Agent job folders already live inside the reel (`reels/<slug>/.agent/jobs`). `watch.ts` must ignore `reels/<slug>/.kinotta/`, so saving a comment never reads as a new version.

**PR 2, delete.**
1. Before any code, map how one version points at another: `shots.json` fields, `parts-alternates.ts`, `parts-working.ts`, `carry.ts`, `save-journal.ts`, `edit-reversal.ts`, the edit list's `frozen` pointer and "Used vN" entries (with Redo), and the reel-level `shared/` and `shots/` folders. Delete only what no surviving version needs.
2. `deleteVersion(slug, n)`: removes the version folder, its state file, and its renders in `reels/<slug>/renders` and `output/<slug>`. It refuses a version the Current reel is built on or that an edit or Redo entry names.
3. Version numbers are never reused: `reel.json` keeps a high-water mark, and the next save is above it. Today the next number is the highest existing plus one (`version.ts:46`), so deleting the newest would reuse its number while job requests, copied comment batches and renders still mean the old one.
4. `deleteReel(slug)`: removes `reels/<slug>/` and `output/<slug>/`, then sweeps only caches tied to version content: content-named playback copies and stills. Caches keyed by footage (`.proxy`, `.audio`, `.transcripts`, `.waveforms`) stay, because the footage stays (same rule as `removeVideo`). Every swept cache must be regenerable, so sweeping too much costs time and never data.
5. Both refuse while the reel has a running or queued render, or a handed-off agent job, and refuse to delete the open reel.
6. Rail: Reels and Saved versions fold (both folded by default, a one-line summary each, remembered per project). Delete shows on rows in an open section and opens a confirm sheet listing what goes. Per the mockup.
7. `DESIGN.md` records the rail and the sheet.

## Steps

PR 1
- [x] Test: open a project with the old layout; every comment, note, marker and the style are read from the reel folder. Proof: fails before the change, passes after.
- [ ] Test: both locations exist (older build kept writing): the reel-folder copy wins, the other is set aside and reported. Test: a crash between copy and remove loses nothing and finishes on the next open. Proof: both pass.
- [ ] Test: saving a comment emits no version event from the watcher. Proof: passes.
- [ ] Point `state.ts` and `watch.ts` at the reel folder and add the move. Proof: the tests pass; a copy of RayDom opens with all comments intact.
- [ ] Update the skill docs. Proof: `grep -rn "reels/.kinotta" skill` shows only project-level files.

PR 2
- [ ] Write down the version-to-version references (item 1 above). Proof: a short list in the PR body, each with the file and line.
- [ ] Test: build a reel with versions, comments, renders in both places, alternates and a content-named cache; delete it; assert the project tree equals the tree before the reel existed (baseline taken after footage import). Proof: fails before, passes after.
- [ ] Same test points `KINOTTA_HOME` and the temp folder (`TEMP` and `TMP` on Windows) at empty sandboxes and asserts both are unchanged. Proof: passes.
- [ ] Test: another reel still uses a cache; delete keeps it. Proof: passes.
- [ ] Test: after deleting version N, every surviving version passes `kinotta check` and Working loads; the next save gets a number above N. Proof: passes.
- [ ] Refusal tests: open reel, Current's base version, a version named by an edit or Redo entry, a running render, a queued render, a handed-off job. Proof: each refused with its reason.
- [ ] `deleteVersion`, `deleteReel` and the HTTP routes. Proof: the tests above.
- [ ] Foldable rail, Delete rows and the confirm sheet. Proof: driven in the running editor on a copy of RayDom: fold and unfold, delete a version, delete a reel, Escape cancels, a refused delete says why.
- [ ] Gate: `npm run typecheck`, unit tests, and `npx vitest run --project render` (AGENTS.md covers `web/src/review/**` and `server/core/_internal/media-*`; run it if either is touched). Proof: output shown.
- [ ] Review: five hunters, verifier PASS, `/security-review`, `/blast-radius`. Proof: findings and verdicts in the PR.

## Risks

- A failed or partial move could lose comments. Mitigation: copy, read back, then remove, per file; keep both on any difference.
- Deleting a version could break one that depends on it. Mitigation: the reference map, the refusals, and the survivors-still-pass test.
- The sweep could remove a cache another reel needs. Mitigation: it only removes version-content caches no surviving version names.
- Windows holds files briefly after a render is killed, so removal retries (see `CLEANUP_RETRIES` in `render.ts`).

## Checks to run

- The tests listed under Steps.
- Fold, delete and refusal behaviour in the running editor, on a copy of RayDom (never the real project).

## Changelog

### 2026-11-06
- Plan created. Owner decided: keep `output/`, move state into the reel folder.
- Reviewed by the advisor before approval; added the version-reference map, never-reused numbers, a file-by-file move rule, the watcher test, a narrower sweep, wider refusals, the Windows temp variables, the render gate and the High review tier.

### 2026-11-07
- Owner approved the plan. PR 1 merged as #133 (18cf2c0). PR 2 in progress on `feat/reel-delete`.
