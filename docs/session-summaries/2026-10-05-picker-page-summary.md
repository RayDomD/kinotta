# Picker page: summary

Date: 2026-10-06. Ticket T55 (#52). Plan: `docs/plans/2026-10-05-picker-page.md`.

## Shipped vs planned

Shipped as planned, built to `docs/mockups/2026-10-05-picker-layout.html` (option B).

- **Server.** The version listing carries `comments` and `issues` (the count of `versionIssues`, the list the gate
  refuses on). `project.listRenders(slug)` lists finished renders newest first, skipping temp files and work folders,
  with the version and preset read from the name. `GET /api/reels/<reel>/renders` lists them. `GET /renders/<reel>/<file>`
  serves one with byte ranges, confined to that folder. `POST /api/reels/<reel>/renders/<file>/reveal` shows it in the
  file manager through a new runner call, `revealInFolder` (`explorer /select,` on Windows, `open -R` on macOS,
  `xdg-open` on the folder elsewhere).
- **Picker tab.** It is enabled in the phase nav and remembered per reel like the other tabs.
  - *Main column.* The versions table has a row per version: version, built by, comments (Doto), contract (`ok` or `N
    issues`), and approval with Approve or Withdraw. Approve shows the API's warning for a version with issues. Selecting
    a row selects that version, as the rail does, so the two always agree.
  - *Player.* Under the table, Review's player plays the selected version read only. Picker passes `Review` no edit
    list and puts the table in a new `above` slot, under one `<main>` labelled Picker.
- **Right column.** "Render v<n>": the preset radios and the four settings, prefilled from the saved settings for that
  preset and refilled when the preset changes. Audio at cuts shows only for a footage reel. Render queues with
  `remember: true`. A refusal shows its reason as an alert in the panel; an accepted render says it is queued. Past
  renders list the file, preset and time, with Play (`.mp4` only) and Show in folder. Play swaps the player for the
  finished file, with "Back to v<n>". The list reloads when a render of the open reel finishes.

## Deviations

- **Review no longer shows edit tools without an edit list.** It showed the tools for any code-only version, which put
  Select, Blade and Snip on Picker's read-only player. The Review tab always passes an edit list, so it is unchanged.
- **Overlay renders have no Play.** Browsers can't play ProRes, so an Overlay `.mov` offers only Show in folder.
- **The e2e suite uses port 4380**, below the 4381 to 4399 range, which was full.
- **The smoke spec** now expects Picker as a tab, not an inactive label.

## Checks

- typecheck: clean.
- vitest: the unit project, 39 files, 374 passed, 1 skipped. The render project wasn't rerun: T55 changes no render
  code, and a full run was stopped by Claude Code when the machine ran low on memory. New: `tests/core/picker.test.ts` (6 tests), seen failing first; `versions.test.ts` and
  `section-batches.test.ts` updated for the two new listing fields.
- Playwright: `picker.spec.ts`, 3 passed on its own. The full suite was not run for the same reason; it runs with T56.
- A screenshot of the tab at 1600x960 was checked against the mockup; it showed the edit-tools problem above, which was
  fixed and checked again.
