# Move and scale elements on code-only reels (T40, #42): run summary

Date: 2026-10-05. Branch: `feat/review-edit-phase` (local, not pushed). Plan: `docs/plans/2026-10-05-code-only-element-moves.md`.

## What shipped

- Core: `server/core/_internal/code-edits.ts` holds the code-only path. A reel with no footage and no plan of its own is code-only; each scene of its newest page stands in as a clip (carrying the offsets its `kinotta-edits.css` holds), so the T39 `element-offset` operation applies unchanged. Any other operation is refused with "This reel is built from code, so only elements can be moved or scaled. To change its timing, ask your agent for a new version."
- Save (`save.ts`): `v<n+1>` is staged in `.save/` as a copy of `v<n>` (without `shots.json`), plus `kinotta-edits.css`, the copied page with one `<link>` added, `edits.json`, then `shots.json` last (copied, with `changedSections` and `builtBy: you`), and renamed in with one step. v<n> is untouched; a failure leaves no stage and the list in place. Carry-forward (T35) runs as for any version (tested).
- Accumulation: the new css holds the offsets of `v<n>`'s file with the list applied over them; a move of the same element replaces its offset, home removes the rule. A page already linking the file is not linked twice; if all offsets are home the file stays, empty.
- `Version.code` ({ scenes, offsets }) on code-only versions. Change detection counts a scene's css rules as part of the scene, so a css-only version change shows as changed sections and agrees with the claim (no `claimMismatch`).
- Editor: the drag, tag, ghost and Edits panel work on a code-only reel. The tools show Select, with Blade and Snip disabled and "Built from code: only elements can be moved. To change timing, ask your agent for a new version." beside them; S and B do nothing. Cards read "Scene cube-lands · Moved cube by ...".
- Tests: `tests/core/code-only-edits.test.ts` (7, copied showreel-project, real Save), `tests/web/edited.test.ts` +2, `tests/e2e/code-only.spec.ts` (1, port 4383: tools off, drag, Save, v3's page shows the cube at its offset, v2 has no css).

## Decisions and deviations

- Scene root: `@clip`, as on footage reels; its rule is `[data-scene="x"] { translate: ...; scale: ...; }` with no element part (the engine's own form).
- Format: one rule per line, `translate: Xpx Ypx; scale: k;`, only what is off home. Lines in the file not in this form are not read and not kept on the next Save; the file is Kinotta's. The skill's rules for the agent carrying it forward are T46.
- The operation's `clip` field holds the scene name here, so the Edits panel replaces "Clip" with "Scene" for code-only reels. No new operation kind.
- Fixed on the way: the Review tab threw on every reel without footage (`remap` of two separate empty lists built a zero-length piece). It was present before this ticket (reproduced on the previous build); one shared empty list fixes it.
- The cards show no timeline time for a code-only reel (there are no pieces to place them on).

## Checks

- `npm run typecheck`: clean.
- `rtk proxy npm test`: 28 files, 297 tests passed.
- `rtk proxy npm run test:e2e`: not run (ports 4398/4399 held by orphaned servers). Scratch configs outside the repo, ports 4383 to 4386 only, no reuse, servers stopped after, run after `npm run build`: `code-only.spec.ts` 1 passed; `clips`, `snip-save`, `review` 12 passed; `lanes`, `smoke`, `storyboard` (the specs that use the default showreel server, run on 4383) 17 passed. One `lanes.spec.ts` test failed once (heading not found in 5 s) and passed on three reruns.
