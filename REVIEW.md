# Review rules: Kinotta

## What failure looks like here

- Timing contract (ADR 0001): a reel page stops seeking to an exact second, scenes drift, or a named element loses its name, so comments can no longer pin to it.
- Versions and revisions: a frozen version or an immutable revision folder gets rewritten, or Working changes without an undoable edit.
- Editor (`web/`): an interaction differs from `DESIGN.md` or the latest owner decision, a keybinding collides, or a passing test hides a UI that does not actually work.
- Server (`server/`): logic leaks into HTTP handlers, or network and file calls bypass the single API client and service layer.
- Render (`server/`, `scripts/`): Final or Overlay output differs from what Review showed, or a render silently drops a track.
- Skill (`skill/kinotta/`): guidance, templates or scripts contradict the editor's behaviour or the taste file, or a template breaks the timing contract.
- Assets: a file is added without clear redistribution rights (Kinotta will be open sourced), or a deletion removes something still referenced.
- Docs and plans: a plan's status or result is wrong, a link breaks, or a doc claims behaviour that is not implemented.
- Secrets: any key, token or connection string in code, fixtures or commits.

## Skip

- `dist/`, `node_modules/`, `package-lock.json`, `test-results/`, `.vitest/`
- `docs/plans/index.html` and other generated dashboards
- Binary fixtures and media (`*.wav`, `*.mp4`, `*.png`) beyond checking they are referenced and licensed
- `reels/*/renders/`, `footage/`, `.herdr/`, `.worktrees/`

## Findings

- Tag each finding `Important`, `Nit`, or `Pre-existing`.
- Cite a file and line for every finding.
- At most 3 nits per review.
- Open the summary with the finding count, or say "nothing to fix".
