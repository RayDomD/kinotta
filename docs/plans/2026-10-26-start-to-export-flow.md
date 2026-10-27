---
title: One start screen, Auto that builds everything, and a two-step top bar
date: 2026-10-26
status: In Progress
summary: Merge the start screens, make Auto build the cut and b-roll in one press with visible progress and Cancel, let the agent decide cuts, and turn the top bar into Storyboard then Edit.
spec: docs/mockups/2026-10-26-start-to-export-flow.html
---

## Intent

- Problem: Trying the new features on 2026-10-26, the owner found that starting a reel is confusing and Auto does not deliver what it promises. There are two start screens (Simple mode Make and the editor's New reel). The start page carries "Simple mode", the Agent picker and "Open in editor". The drop area has a separate "Choose a folder…" button, and a dropped video can't be removed. Auto with the default "Copy request" agent makes only the first cut and silently leaves the b-roll request waiting. Progress shows only in one Simple mode banner, so leaving the page loses it. A pasted request's finished output never comes back into the reel. The top bar mixes steps and tools (Storyboard, Review, Renders, Simple mode, Library, gear). Dead-air cuts feel harsh.
- Why: Auto is the one-click path for most people. It has to build the whole reel, show that it's working, and be stoppable, before more features land on top.
- Proposed outcome: One start screen. Auto asks once, then builds the cut and b-roll with the installed agent. Progress and Cancel show at the top of every page. The top bar reads as a sequence, Storyboard then Edit (Simple | Editor). The agent decides the cuts, and every cut stays editable.
- Affected: `web/src/SimpleMode.tsx`, `SimpleMake.tsx`, `NewReel.tsx`, `DropZone.tsx`, `App.tsx` (top bar), `Direction.tsx`; `server/core/_internal/agent-settings.ts`, `agent-jobs.ts`, `dead-air.ts`, `start.ts`; the skill's "Unattended add b-roll" section; `DESIGN.md`; e2e suites `simple-mode`, `direction`, `pinned-effects`.
- Constraints: Kinotta never spends an agent plan without a yes (asked once per project). Cancel stops the agent and every process it started (already true on the server). Copy request stays available. No fake percentage: progress shows the stage, the time so far and a moving bar. Keep the animated revisions and the Review-loads-Working fix from the inline alternates work. Footage stays where it is when picked from the project. Dropped files are copied.
- Out of scope: npm or `npx` distribution (deferred). A keyboard way to add effects (separate follow-up). Library's deferred tabs. New effect templates. Portrait reels.
- Open questions: (1) Answered 2026-10-27: Export lists the app's presets (draft, final, overlay) with a 1080p or 4K size choice. (2) Whether Auto's footage reels ever have shot options; the unattended b-roll path does not mention alternates, so probably not.

## Goal

Pressing Auto on a dropped video yields a finished reel with b-roll and agent-decided cuts, with progress and Cancel visible on any page. The editor reads as Storyboard then Edit, as in the mockup.

## Approach

Six phases, one pull request each, in this order. Each phase is usable on its own.

- **A. Start screen.** Keep `SimpleMake` as the only start screen and delete `NewReel`'s duplicate video and brief UI, routing the editor's "New reel" to it. The start page's top bar shows KINOTTA and the reel menu only. Fold the folder picker into the drop area: the drop target accepts folders, and "Choose files…" offers files or a folder. A dropped video appears as a row with Remove. Remove deletes Kinotta's copy in `footage/` when no reel references it, and only clears the choice otherwise.
- **B. Agent default and confirmation.** When `.kinotta-agent.json` is absent, `readAgentSettings` returns the first installed agent (Claude Code, then Codex), and Copy request only when neither is found. The first Auto or Direct build per project shows "Build it all now?" with the usage notice, and the yes is stored in the same settings file. The Agent picker moves to Settings. With no agent found, the Auto hint says it will prepare a request to paste.
- **C. Progress notice.** A single top strip, shown on every reel page, driven by the existing agent job state. It shows the stage label, a timer, a moving bar and Cancel while running. Then it shows "Ready, open vN", or "Failed" or "Cancelled" with Retry. Copy mode shows Copy request plus what happens next. This replaces the Simple mode banner, and the same strip later carries comment-batch builds.
- **D. Top bar.** Two steps, Storyboard and Edit, with a Simple | Editor switch on Edit that remembers the last pick. Export ▾ replaces the Renders tab (start a render, recent renders, queue). A ··· menu holds Library, Settings, All reels and New reel. The gear and the Simple mode and Library tabs go. The shot-choice count becomes a badge on Storyboard, amber for Direct reels and quiet ("have other options") for Auto reels. After Auto, Edit shows a one-time hint pointing to Storyboard.
- **E. Agent-decided cuts.** v1 opens with no dead-air cuts. The b-roll job also decides cuts from the transcript: it writes snips tagged by the agent, each with a short reason, which go into the reel's edit list as ordinary editable cuts with the reason visible in the Editor. Remove the `deadAir` strength from Auto and Direction. Independently, soften cut edges: more room after a word, and a lead-in before the next word so its first sound isn't clipped. Name both values.
- **F. Copy request round trip.** Kinotta watches each waiting Copy request job's `output/` and, when the finished files appear, runs the existing validation and publish (`acceptOutput`), so the result becomes the next version without any action. On startup it checks waiting jobs too, so output finished while Kinotta was closed still loads. The strip goes from "Waiting for your agent" to "Your agent finished. Open vN"; a failed check shows the reason with Retry. The agent only writes files, so this works with any agent.

## Steps

1. Answer open question 1 with the owner before phase D.
2. Phase A, with e2e: drop, remove (copy deleted, referenced file kept), folder drop, editor New reel opens the same screen.
3. Phase B, with unit tests for the default (each detection case) and e2e for the one-time confirmation.
4. Phase C, with e2e: Auto, then navigate to Storyboard mid-run (strip stays), Cancel (job cancelled, v1 intact), Retry, Ready opens v2. Copy mode strip.
5. Phase D, with e2e for each moved control and the phone width (390px).
6. Phase E. First confirm how unattended output can carry edit-list operations, and check that `validateAgentOutput` accepts them. Unit tests cover cut-edge padding. E2e: the agent's cut is visible, resizable and restorable in the Editor, with its reason shown.
7. Phase F, with e2e: a Copy request job whose `output/` is filled loads as the next version; one filled while the server was stopped loads on start; invalid output shows its reason.
8. Update `DESIGN.md` sections (Auto and Direct, top bar, progress notice), and this plan's changelog after each merge.

## Risks

- Agent cut decisions from word timings alone may still cut a meaningful pause. Mitigation: reasons are visible and every cut is restorable. Owner review of a real reel is part of phase E's check.
- v1 without cuts is longer until v2 arrives. Accepted by the owner on 2026-10-26.
- Defaulting to an installed agent spends plan quota. Mitigation: the one-time confirmation in phase B lands before or with any default change.
- Removing `NewReel` may break routes and tests that open it. Mitigation: phase A updates those tests in the same PR.

## Checks to run

- `npm run typecheck`, `npm run check:docs`, `npm run check:commits -- origin/main`
- Unit tests, and the Playwright suites each phase touches. The full suite runs before the last phase merges.
- A manual run on the built app (port 4317): drop a real video, Auto, watch the strip, cancel once, rerun, open v2.

## Changelog

### 2026-10-26
- Plan created from the owner's trial of the Direction and Storyboard features. Approach agreed in conversation: Brief is not a step, Auto keeps Storyboard as optional, the agent decides cuts, Copy mode gets a confirmation, progress and Cancel. Prototype saved as `docs/mockups/2026-10-26-start-to-export-flow.html`.
- Owner decision: a pasted request's output comes back by Kinotta watching the job folder and loading it, not by the agent calling Kinotta. Plan approved.

### 2026-10-27
- Owner decisions: Export ▾ lists the app's presets plus a 1080p or 4K size (open question 1); this plan ships in the phase A PR rather than its own; phase A is built in this window, and dispatching any later phase needs a yes first.
- Phase A built on `feat/start-screen`: `NewReel` deleted, and the editor's New reel opens the Simple start screen. Starting or opening a reel there returns to the view it came from. The start page's top bar holds KINOTTA and the reel menu only. "Choose a folder…" sits inside the drop zone. A picked video shows as a row with Remove, which deletes the copy this screen just made (and its playback copy) unless a reel uses it (`DELETE /api/footage`). Editor specs that only needed a reel now start it through the API, because Auto's dead-air pass would cut their fixture.
- Owner decisions: Claude merges PRs once their checks pass (a local `gh pr merge` permission rule allows it; #80 merged this way). Phase E keeps 0.15 s after a word and a 0.1 s lead-in before the next. The media render tests that also fail on `main` are tracked in #82.
- Merged: #80 (merge-stack plan closed), #81 (phase A, start screen) and #83 (phase E's cut-edge padding).
- Phase B built on `feat/agent-default`: with no `.kinotta-agent.json`, the agent defaults to Claude Code, then Codex, then Copy request. The first Auto or Direct build asks "Build it all now?" with the usage notice, and "Don't ask again" stores the yes in the same file. The Agent picker lives only in Settings. With no agent found, the Auto hint says Kinotta will prepare a request to paste.

- Phase C built on `feat/progress-notice`: one persistent b-roll progress strip under each reel page's top bar replaces the Simple mode banner, with stage, elapsed time, Cancel, Retry, ready-version navigation and Copy request fallback. Comment-batch builds remain deferred.

- Phase D built on `feat/top-bar`: Storyboard and Edit share one top bar, Edit remembers Simple | Editor across tabs, Export holds presets, size, detailed settings, queue and recent files, and More holds the moved tools. Reel origin drives the Storyboard badge and the per-reel Auto hint. All 10 top-bar e2e checks pass with 1440px/390px screenshots; final full-suite verification pending.
