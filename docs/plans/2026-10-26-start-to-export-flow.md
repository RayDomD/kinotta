---
title: One start screen, Auto that builds everything, and a two-step top bar
date: 2026-10-26
status: Draft
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
- Open questions: (1) Export presets: the app's draft, final and overlay, or draft, final and 4K. (2) Fix 7: does the skill hand finished output back itself, or does Kinotta watch `output/` and offer to load it? (3) Whether Auto's footage reels ever have shot options; the unattended b-roll path does not mention alternates, so probably not.

## Goal

Pressing Auto on a dropped video yields a finished reel with b-roll and agent-decided cuts, with progress and Cancel visible on any page. The editor reads as Storyboard then Edit, as in the mockup.

## Approach

Six phases, one pull request each, in this order. Each phase is usable on its own.

- **A. Start screen.** Keep `SimpleMake` as the only start screen and delete `NewReel`'s duplicate video and brief UI, routing the editor's "New reel" to it. The start page's top bar shows KINOTTA and the reel menu only. Fold the folder picker into the drop area: the drop target accepts folders, and "Choose files…" offers files or a folder. A dropped video appears as a row with Remove. Remove deletes Kinotta's copy in `footage/` when no reel references it, and only clears the choice otherwise.
- **B. Agent default and confirmation.** When `.kinotta-agent.json` is absent, `readAgentSettings` returns the first installed agent (Claude Code, then Codex), and Copy request only when neither is found. The first Auto or Direct build per project shows "Build it all now?" with the usage notice, and the yes is stored in the same settings file. The Agent picker moves to Settings. With no agent found, the Auto hint says it will prepare a request to paste.
- **C. Progress notice.** A single top strip, shown on every reel page, driven by the existing agent job state. It shows the stage label, a timer, a moving bar and Cancel while running. Then it shows "Ready, open vN", or "Failed" or "Cancelled" with Retry. Copy mode shows Copy request plus what happens next. This replaces the Simple mode banner, and the same strip later carries comment-batch builds.
- **D. Top bar.** Two steps, Storyboard and Edit, with a Simple | Editor switch on Edit that remembers the last pick. Export ▾ replaces the Renders tab (start a render, recent renders, queue). A ··· menu holds Library, Settings, All reels and New reel. The gear and the Simple mode and Library tabs go. The shot-choice count becomes a badge on Storyboard, amber for Direct reels and quiet ("have other options") for Auto reels. After Auto, Edit shows a one-time hint pointing to Storyboard.
- **E. Agent-decided cuts.** v1 opens with no dead-air cuts. The b-roll job also decides cuts from the transcript: it writes snips tagged by the agent, each with a short reason, which go into the reel's edit list as ordinary editable cuts with the reason visible in the Editor. Remove the `deadAir` strength from Auto and Direction. Independently, soften cut edges: more room after a word, and a lead-in before the next word so its first sound isn't clipped. Name both values.
- **F. Copy request round trip.** Close the loop decided in open question 2, so a pasted request's output becomes the next version.

## Steps

1. Answer open questions 1 and 2 with the owner (one at a time).
2. Phase A, with e2e: drop, remove (copy deleted, referenced file kept), folder drop, editor New reel opens the same screen.
3. Phase B, with unit tests for the default (each detection case) and e2e for the one-time confirmation.
4. Phase C, with e2e: Auto, then navigate to Storyboard mid-run (strip stays), Cancel (job cancelled, v1 intact), Retry, Ready opens v2. Copy mode strip.
5. Phase D, with e2e for each moved control and the phone width (390px).
6. Phase E. First confirm how unattended output can carry edit-list operations, and check that `validateAgentOutput` accepts them. Unit tests cover cut-edge padding. E2e: the agent's cut is visible, resizable and restorable in the Editor, with its reason shown.
7. Phase F per the answer to open question 2.
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
