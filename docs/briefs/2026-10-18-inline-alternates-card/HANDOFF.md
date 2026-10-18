# Handoff: inline alternates card (lane card, AGY)

The work is ready to dispatch. The owner picks the model. Everything the lane needs is committed on `feat/inline-alternates-card` (from `main` at `5f3a23d`).

## What is here

- Plan: `docs/plans/2026-10-18-inline-alternates-card.md` (goals G1 to G6, approach, risks, checks).
- Tickets: `docs/tickets-inline-alternates.md`. T1 preview on the card, then T2 play on hover or focus, then T3 Use and Not this. They form a linear chain.
- Behaviour mockup: `docs/mockups/2026-10-18-inline-alternates-card.html`, accepted by the owner.
- Brief: `1-card-agy.md` in this folder, for one lane. The scope fence covers web only: `Storyboard.tsx`, `Storyboard.verify.ts`, an optional `initialRevision` prop on `ShotSheet.tsx`, `styles.css`, `tests/e2e/alternates.spec.ts`, fixture additions in `tests/helpers/parts.ts`, and new `tests/web/**` files.
- Manifest: `manifest.md`. One lane, no overlaps. The cleanup run on `fix/codex-run-cleanup` touches none of these files.

## Pre-flight already done (2026-10-18)

- AGY 1.4.2 is installed. `agy models` lists `gemini-4-argon-low`, `gemini-4-argon-medium` and `gemini-4-argon-high`.
- The file-read probe passed with `gemini-4-argon-medium` (it read `AGENTS.md` correctly). Probe the chosen id again if it is not medium.
- The brief opens with an imperative first step, because AGY tends to plan large briefs instead of editing.

## Dispatch (PowerShell, from the main checkout)

```powershell
git worktree add ../Kinotta-inline-alternates-card -b agent-loop/inline-alternates-card/card feat/inline-alternates-card
New-Item -ItemType Junction -Path "../Kinotta-inline-alternates-card/node_modules" -Target "C:/FIles/Projects/Apps/Kinotta/node_modules"
cd ../Kinotta-inline-alternates-card
npx playwright test -c tests/e2e/alternates.config.ts --workers=1   # baseline, should pass
agy --mode accept-edits --model "<gemini-4-argon-id>" --add-dir "C:/FIles/Projects/Apps/Kinotta-inline-alternates-card" --print-timeout 45m --print="follow docs/briefs/2026-10-18-inline-alternates-card/1-card-agy.md exactly" > agent-run-card.log 2>&1
```

- Put the chosen model id in the manifest's Model column.
- `--add-dir` is required. Without it, AGY exits 0 having done nothing.
- `--print=` must be written with `=` and come after `--model`.
- If `accept-edits` stalls on a permission prompt, rerun with `--dangerously-skip-permissions` instead.

## Re-entry

- Exit 0 does not prove the lane worked. Confirm the worktree has changes and read the log. AGY often prints Test evidence and Deviations to stdout instead of the brief, so copy them into the brief.
- Rerun the brief's commands yourself in the worktree: typecheck, build, the alternates, parts and working e2e configs, and `tests/web`.
- Review the diff against the T1 to T3 acceptance boxes and the file fence. Watch for clicks on dots and actions that open the sheet, focus after a dismissal, more than one `PagePlayer` mounted, and reduced motion.
- After passing, commit on the lane branch, then merge `--no-ff` into `feat/inline-alternates-card`. Remove the `node_modules` junction before `git worktree remove`.
- Reviewer work after merge: `/impeccable critique` of the card states, a `DESIGN.md` description of the card's states, `docs/session-summaries/2026-10-18-inline-alternates-card-summary.md`, plan status `Done`, ticket boxes ticked, the dashboard regenerated, and the owner's go-ahead before merging to `main`.
