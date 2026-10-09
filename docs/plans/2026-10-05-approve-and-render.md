---
title: Approve and Render phase
date: 2026-10-05
status: Done
summary: Approve versions and render Draft, Final or Overlay from Review or kinotta render.
spec: docs/specs/2026-10-05-approve-and-render.md (#52)
---

## Intent

- Problem: Kinotta can edit and version a reel, but it can't produce a video file or mark a version as final. The
  Picker tab has no meaning.
- Why: rendering is the last gap in the Storyboard, Review, Picker loop. Without it, every deliverable is stitched
  together by hand outside Kinotta.
- Proposed outcome: the owner approves the versions that are final. Any version can be rendered as a quick Draft, and
  an approved one as a Final MP4 or a transparent Overlay. Renders run in the background, and an agent's render gives
  the same file as the owner's.
- Affected:
  - Core: `Project`, a new render module, `runner.ts`, the startup tool check.
  - The HTTP API and the `kinotta` CLI.
  - Web: a new Picker page, a rail mark for approved versions, a render indicator in the top bar.
  - The skill: `SKILL.md`, `engine/render.js`. `composite.py` is replaced.
  - `CONTEXT.md`.
- Constraints:
  - Versions stay frozen, and approving one doesn't change it.
  - Only the owner approves.
  - Kinotta calls no AI service.
  - Processes start only through `runner.ts` (E3).
  - A render matches what Review plays.
  - A cancelled or failed render leaves no partial file.
- Out of scope: agent approval, codecs beyond the three presets, GPU encoding, WebM, GIF, HLS, resuming an interrupted
  render, uploading or sharing.
- Open questions: none.
  - Settled 2026-10-05: the Picker layout, a versions table (`docs/mockups/2026-10-05-picker-layout.html`).
  - Settled 2026-10-05: the five spec choices and five gaps, as R12 to R18 in `docs/2026-09-30-grilling-decisions.md`.

## Goal

The owner approves the versions of a reel that are final, from Review (formerly Picker), and the rail marks them. Any version renders as
a Draft; Final MP4 and transparent Overlay require no contract issues and respect the version's plan-preservation and transparency gates. Approval is a label, not a render gate (R19). A
render runs in the background in one queue with progress and cancel, and lands in the reel's `renders/` folder. An
agent's `kinotta render` uses the same engine and queue and can't approve. This answers the Intent: a version you like
becomes a file you can send without leaving Kinotta.

## Approach

Build spec #52 as tickets T48 to T59 (`docs/tickets-approve-render.md`), working the frontier one ticket per fresh
context with `/implement`. The executor, model and effort are chosen with the owner before the first ticket.

The render queue lives in the core `Project`, so whichever process holds the project holds the queue: the editor, or
`kinotta render` hosting the same server headless. A port file then lets the CLI join a running editor's queue
(R12). `engine/render.js` stays the one renderer, extended with flags and JSON progress, and is started only through
`runner.ts` (R14, E3). The footage pipeline cuts by the version's own pieces and pipes the overlay into the composite
(R13, R18). Picker is built to `docs/mockups/2026-10-05-picker-layout.html` in the DESIGN.md visual world and finished
in Lane B. Each ticket gets its own plan and session summary, as T29 to T47 did.

## Steps

1. First slice: T48 approve and the rail mark, T49 a Draft of a code-only reel through the core and `kinotta render`.
   T57 Chromium in the tool check runs alongside.
2. Footage and gates: T50 Final and Overlay of a footage reel, T51 the render gate.
3. Engine breadth: T52 one queue across processes and cancel, T53 presets and settings, T54 parallel segments.
4. Picker: T55 the page, T56 queue, top bar indicator and ready notice.
5. T58 skill and glossary; T59 Lane B finish pass on Picker.
6. `/code-review` on the whole branch against spec #52.

## Risks

- Render fidelity: the overlay page and the cut footage must line up frame for frame. The pixel-compare test at a
  known time, over a sample with a snip, guards it.
- `render.js` is shared with the skill's standalone users. New flags must leave its default run unchanged.
- Renders are slow. Tests use a few seconds of footage at a small size; the full-length check is opt-in.
- Parallel Chromium pages and ffmpeg pipes make cancel and cleanup easy to get wrong. Cancel tests assert on the
  folder, not only the output file.
- Moving `playwright` to `dependencies` adds a browser download on install.
- A stale port file from a crashed editor could send `kinotta render` nowhere; T52 tests it.

## Checks to run

- `npm run typecheck`
- `rtk proxy npm test` (core, engine, scripts)
- `rtk proxy npm run test:e2e`
- The runner boundary test (`tests/core/start-reel.test.ts`)
- `kinotta check` on the footage sample; drift test green
- Manual pass by the owner: approve, render a Draft, a Final and an Overlay of a real reel, open each in a player

## Changelog

### 2026-10-05
- Plan created, Intent only.
- Grilling settled R12 to R18: one queue with a headless server, plan-less versions refused for Final and Overlay,
  `render.js` extended, `playwright` a runtime dependency, settings per preset, approval editor-only with a watcher,
  and five smaller gaps. Spec updated to match.
- Picker layout chosen in a `ui-preview` round: option B, a versions table with the player under it. Saved to
  `docs/mockups/2026-10-05-picker-layout.html`.
- Intent approved by the owner. Goal, Approach, Steps, Risks and Checks written; tickets T48 to T59 in
  `docs/tickets-approve-render.md`. Status Approved.

### 2026-10-08
- Reconciled T58 and T59 with the current source, October 6 Review/Picker merge and October 8 editor audit. Corrected the skill's render rule and footage handover, documented the merged approval/render components in DESIGN.md, and confirmed the existing glossary definitions and removal of retired compositor references.
- Updated the Goal for R19 and the settled Picker merge. The earlier implementation approach and layout choice remain historical records.
- Current verification: typecheck and build pass, unit/engine checks pass 595 tests with one existing skip, all 110 browser checks pass, and the final complete render suite passes 100 tests in 23 files. Both presets' delivery gates and actual CLI behavior are covered by the render suite.
- T58/T59 are Done. Acceptance mapping, commands, results and limits: `docs/session-summaries/2026-10-08-open-plans-reconciliation-summary.md`. No git writes or external sends.
