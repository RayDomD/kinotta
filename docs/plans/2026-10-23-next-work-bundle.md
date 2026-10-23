---
title: Next work bundle
date: 2026-10-23
status: In Progress
summary: One order for the open work from 2026-10-23: close the Codex cleanup, import a folder of shots, and finish the motion-taste plan with the borrowed methods.
spec:
---

## Intent

- Problem: Four threads came out of one session on 2026-10-23, each in its own plan or conversation, with no single order:
  - Codex run cleanup (`2026-10-18-codex-run-cleanup.md`) is In Progress. Goals 1 to 4 are done; goal 5, merging it and `codex/random-audio-seeds` into `main`, waits for the owner.
  - Remove and snip leave a gap (`2026-10-19-remove-leaves-gap.md`) was recommended next, but it is already Done.
  - Building a reel from a folder of shots is new work, drafted as `2026-10-23-media-import-and-lanes.md` with four open questions.
  - Motion taste and templates (`2026-10-23-prompt-motion-taste.md`) is Approved. Codex finished steps 1 and 2 and waits for the owner to approve the taste lines. It now also holds the methods and two templates borrowed from the outside-skills comparison.
- Why: The owner wants one place that says what runs next and what each step waits on.
- Proposed outcome: The threads run in a fixed order, each through its own plan, and this plan tracks only the order and the gates.
- Affected: the three plans above and `docs/plans/index.html`. No code is changed by this plan itself.
- Constraints:
  - Each child plan stays the record of its own work, Result and checks. One plan, one file.
  - Push or merge to `main` only after the owner confirms.
  - Owner decisions are asked one at a time.
- Out of scope: Any work not listed in the four threads. The skills-compare findings outside what the motion-taste plan now holds (for example the full collage style) stay out.
- Open questions:
  - O1: Resolved 2026-10-23. Owner said merge; both branches were already merged on 2026-10-19 (`a330bdc`, `1ba1a4a`).

## Goal

1. The Codex cleanup is merged and marked Done.
2. The media import plan has its open questions answered, is Approved and runs.
3. The motion-taste plan finishes all its steps and is marked Done.

## Approach

Close what is nearly finished first, then run the two larger plans. The motion-taste work touches only the skill, taste list and templates, while media import touches the server, editor and engine, so they can run in parallel once their gates clear. Each one runs on its own branch.

## Steps

1. **Codex cleanup.** Done 2026-10-23. Both branches were already in `main`; the plan is closed.
2. **Remove leaves gap.** Already Done (2026-10-19). Nothing to run.
3. **Motion taste.** Owner approves or edits the taste table in the plan, including the new motion rules. Then Codex runs steps 3 to 6: write the rules, add the brief shape, reference analysis and choice sheets to the skill, and build the nine templates.
4. **Media import and folder reels.** Owner answers O1 to O4 in that plan one at a time (folder order, how motion graphics sit on a track, crop or fit, where non-video files go). Approve it, then run it.
5. Mark this plan Done when the three child plans are Done.

## Risks

- The media import plan touches the engine and many editor files, so it can conflict with other open branches. Rebase on `main` after step 1.
- Codex is idle on the motion-taste plan. A long wait for the taste approval stalls step 3.

## Checks to run

- Each child plan's own checks, recorded in that plan.
- After step 1: `npx vitest run tests/core --maxWorkers=1` passes on `main`.

## Changelog

### 2026-10-23
- Plan created to bundle the session's threads. Remove-leaves-gap found already Done; folder-to-video found already drafted as the media import plan.
- O1 resolved. Codex cleanup found already merged and closed. Status In Progress.
