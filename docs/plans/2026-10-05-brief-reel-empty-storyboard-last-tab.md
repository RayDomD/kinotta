---
title: New reel from a brief, empty Storyboard and last-used tab (T45)
date: 2026-10-05
status: Done
summary: T45. New reel can start from a brief (reel.json plus a copied request, shown Waiting until shots.json appears, then opened in Storyboard); a version with no clips gets a Storyboard empty state with a b-roll request, its lanes and word pins; a reel opens in the tab last used for it.
spec: docs/tickets-review-edit.md T45 (#47); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: A reel can only start from a video; there is no way to start one for an agent to build, and a reel made from a video has no clips, which leaves the Storyboard blank. The tab on screen is forgotten when a reel is left.
- Why: E18 and E19: Storyboard hands comments to an agent, a brief reel waits for its shot list, and a reel opens where the owner left it.
- Proposed outcome: New reel has a "from a brief" form. Starting writes `reel.json` with the title and brief and copies a request naming the reel and the brief. The reel shows Waiting in the rail until a version with `shots.json` appears, then opens in Storyboard. A version with no shots shows an empty state with a copyable b-roll request, its lanes, and word pins on the transcript. A reel reopens in its last-used tab.
- Affected: `server/core` (start, reels, version, comments, batch, requests), `server/http`, `web/src` (New reel, App, Storyboard, Lanes, comments panel), tests.
- Constraints: Request text names no particular agent (E20). New reel changes stay inside a separate form component, and App changes stay to the last-used-tab and waiting logic, so T31 and T42 merge simply.
- Out of scope: the skill reading the request (T46), the real Review tab (T31), drop zone (T42).
- Open questions: none; decisions below.

## Goal

T45's three criteria met.

## Approach

- Core: `startReelFromBrief({ title, brief })` writes only `reel.json` `{ title, brief }`. `ReelSummary.brief` carries the text and the request; the reel is waiting while it has a brief and no version. `Version.brollRequest` is set when a version has no shots. Both requests are built in `requests.ts`.
- Word pins with no shots: a word pin takes shot `''` and is checked against the version's transcript. The batch leaves the shot out of the line and writes `shot: null`.
- HTTP: `POST /api/reels/brief`.
- UI: `BriefForm` under the video list, copies the request on start, then opens the reel on its waiting page (`BriefWaiting`: brief and a copy button). The rail row shows the Waiting mark. When a waiting reel gets its first version it switches to Storyboard. `EmptyStoryboard` replaces the grid when a version has no shots, reusing `WordRow` over the transcript. Lanes draw shotless pins as non-interactive hexes.
- Last-used tab: kept per reel in browser storage (`lastTab.ts`), read when a reel is opened, written when a tab is chosen. Default Storyboard.

## Steps

1. Failing core tests (brief reel, listing, b-roll request, transcript word pin, batch text).
2. Core, HTTP.
3. UI.
4. E2E on a tenth server (port 4387): brief reel waits and opens, empty state and pin, last-used tab.
5. Full checks.

## Risks

- The word pin shape (`shot: ''`) reaches every place that reads `pin.shot`; carried comments on a later version with clips stay on the older version (no matching shot), which is the existing "not carried" path.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, `rtk proxy npm run test:e2e`.

## Changelog

### 2026-10-05
- Plan created.
- Done. Added `startServer`-based tenth e2e server (port 4387, fake transcriber) for `brief-reel.spec.ts`.
