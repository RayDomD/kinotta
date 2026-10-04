# New reel from a brief, empty Storyboard and last-used tab (T45, #47): run summary

Date: 2026-10-05. Branch: `worktree-agent-a164f2735842a217f` (local, not pushed). Plan:
`docs/plans/2026-10-05-brief-reel-empty-storyboard-last-tab.md`. Ticket: T45 in `docs/tickets-review-edit.md`.

## What shipped

- Core: `Project.startReelFromBrief({ title, brief })` writes only `reel.json` (`title`, `brief`) and returns the slug and
  a request. `ReelSummary.brief` (`text`, `request`) marks a brief reel; it is waiting while `newestVersion` is null.
  `Version.brollRequest` is set on a version with no shots. Both requests come from `requests.ts` and name no agent (E20).
- Word pins on a reel with no clips: a word pin with shot `''` is checked against the version's transcript. Batch text
  drops "Shot N," for it and the batch file writes `shot: null`.
- HTTP `POST /api/reels/brief`.
- UI: New reel has an "Or start from a brief" form (`BriefReel.tsx`) that copies the request on start and opens the
  reel on a waiting page (brief, copy button). The rail row shows the Waiting mark. When the waiting reel's first
  version appears, the reel opens in Storyboard. A version with no shots shows `EmptyStoryboard` (message, "Copy request
  for b-roll", the transcript as a word row to pin) with the Storyboard's lanes under it; pins on words appear in the
  Pins lane as non-interactive hexes. A reel opens in the tab last used for it (`lastTab.ts`, browser storage per
  reel; Storyboard by default).
- Tenth e2e server (port 4387, fake transcriber) for `brief-reel.spec.ts`.

## Deviations from the plan

- The last-used tab is stored in the browser, not in the project, so it follows the viewer rather than the project folder.
- Copying a request uses the clipboard; if the browser refuses, the waiting page and the empty state show the text to copy by hand.
- None else. The GitHub issue (#47) criteria are ticked; the issue is left open.

## Checks

- `npm run typecheck` clean. `rtk proxy npm test` 188/188. `rtk proxy npm run test:e2e` 84/84.
- Note: running Playwright with `| tail` hangs because the e2e servers outlive the runner and hold the pipe; redirect to a file instead.
