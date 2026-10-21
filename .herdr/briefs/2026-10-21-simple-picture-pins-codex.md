# Brief: simple mode picture pins (codex)

Worktree: `C:/FIles/Projects/Apps/Kinotta/.worktrees/simple-mode`, branch `feat/simple-mode`. Commit here; do not push.

## Goal
Implement the approved plan `docs/plans/2026-10-21-simple-picture-pins.md` (add picture pins to simple mode like the editor's; keep timeline pins). Move its status In Progress -> Done, write `docs/session-summaries/2026-10-21-simple-picture-pins-summary.md`, regenerate `docs/plans/index.html` with `powershell -NoProfile -File docs/plans/build-plans-index.ps1`.

## Files in scope
`web/src/review/_internal/MediaEditor.tsx` (simple branch only), `web/src/SimpleMode.tsx`, `web/src/simple.css`, `tests/e2e/simple-mode.spec.ts`, the plan, its summary, `docs/plans/index.html`. If the frame pick needs a change in `PagePlayer`/`PictureLayers`, stop and report instead (plan Risks).

## Do not touch
`server/**`, the detailed editor's pin behaviour, `skill/**`, the two modified PNGs under `docs/session-summaries/2026-10-15-viewer-transport-clips/`.

## Notes
Live app http://localhost:5174 (API 127.0.0.1:4317); don't kill them. Clean up e2e `start-server.mjs` processes you leave behind. Single-context; no sub-agents. Conventional Commits, no AI signature, no `--no-verify`.

## Acceptance checks
- `npm run typecheck`, `npm run build` pass.
- `npm run test:e2e -- tests/e2e/simple-mode.spec.ts tests/e2e/review.spec.ts` plus whichever spec covers the editor's frame pin flow, all pass (note any failure that also fails on `5f10f91`).
- New e2e: picture click in simple mode -> composer names element -> save -> pin in list and as hex on picture -> `[`/`]` reaches it; timeline pin still works.
- Before/after screenshots at 1280x800 in `tests/artifacts/simple-picture-pins/`, taken after the reel loads.

When finished, append to the end of this brief: what changed, commits, checks with results, footage-only finding, deviations.

## Execution result — 2026-10-21

- Stopped at the explicit scope boundary before feature code edits. The current `PagePlayer` picker only provides a crosshair and click hit-testing; the approved element hover outline/name tag requires changes in that excluded file. Plan marked Blocked; investigation summary written and dashboard regenerated.
- Commit: `docs: record picture pin scope blocker` (this brief, plan, summary, dashboard and before screenshots).
- Checks: live Simple studio loaded; editor Working loaded; Pin enabled and frame hovered. Computed cursor was `crosshair`, with no element hover outline/name tag. Source inspection confirmed the missing hover path. Two before screenshots captured at 1280x800 after reel load in `tests/artifacts/simple-picture-pins/`.
- Typecheck/build/acceptance e2e not run because implementation stopped before code edits; no after screenshots. No e2e server processes launched, live app/API left running.
- Footage-only finding: picker source spans the loaded page container without requiring a visible authored scene; actual footage-only picking remains unverified. No fallback implemented.
- Deviations: Blocked rather than Done; scope expansion needed for `PagePlayer`. No detailed-editor behavior, server, skill files or pre-existing modified PNGs touched. `/implement` and `/code-review` skills unavailable; direct investigation used instead.

## Update 2026-10-21 (owner): build the designed hover
Owner chose the full DESIGN.md "Pinning (signature)" behaviour. Scope now also includes `web/src/stage/_internal/PagePlayer.tsx` (and its CSS / small stage helpers it needs) to add: hex cursor with centre dot over a pinnable frame, ice outline with glow on the element under the cursor, ice name tag placed outside the element, all drawn in the editor over the reel, never inside the reel's page. The detailed editor gets this too (shared player); its existing pin tests must still pass and add one e2e for the hover in the editor. Then finish the original simple-mode goal. Also verify picking over footage-only moments and report. Plan is Approved again; move it to In Progress -> Done.
