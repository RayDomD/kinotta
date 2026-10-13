---
title: alternates
date: 2026-10-13
status: Approved
summary: A comment can ask for options; the agent answers with alternates of one shot, chosen on the storyboard.
spec:
---

## Intent

- Problem: When a shot is wrong but you do not know what you want, the only move is a comment and a whole new version that holds one guess. A second guess costs another round.
- Why: Rounds are the cost in Kinotta's loop. Seeing two or three answers to one comment side by side settles in one round what now takes several. Other tools already keep several takes of a shot; Kinotta has the pin to say why each one exists, which they lack.
- Proposed outcome: A comment can ask for options. The next version brings back that shot as two to four named alternates, each with a line saying what differs. You see them on the storyboard, pin on any of them, and put one in the reel.
- Added 2026-10-13 (N6): each alternate can be marked kept or rejected with a short reason, and the next comment batch carries those marks so the agent knows why, not only which one won.
- Affected: the timing contract (ADR 0001) and `server/core/_internal/contract.ts`; comment pins, carry and batches (`types.ts`, `comments.ts`, `carry.ts`, `batch.ts`); the edit list (`edit-model.ts`); the Storyboard, shot sheet, lanes and comments panel in `web/src`; the stage (`web/src/stage`) so a still or player can show a given alternate; the render path; `skill/kinotta` (SKILL.md and `reference/contract.md`); `CONTEXT.md` (new terms Alternate and Span pin; changes to Pin, Comment batch, Shot); tests under `tests/core` and `tests/e2e`. Mockup: `docs/mockups/2026-10-13-alternates-in-storyboard.html`.
- Constraints:
  - Builds on `2026-10-12-live-edits-freeze-at-render.md`: choosing an alternate is an edit on the working reel, undoable, and frozen at a render or hand-off.
  - One card per shot on the storyboard. Alternates live inside the shot and do not change the shot count.
  - The word is "alternate". `CONTEXT.md` lists "take" under words to avoid.
  - `DESIGN.md` tokens and the One Light Rule. The alternates card is the only stacked paper at rest on the grid.
  - Existing versions and reels with no alternates open, check and render exactly as they do now.
  - AIMovieStudiov2 is AGPL-3.0. Its takes gallery is the idea only; no code from it is copied.
- Out of scope:
  - Span pins. Split into `2026-10-14-span-pins.md` on 2026-10-13; they need neither prerequisite.
  - Manual tuning of an element's text, colour, size and timing (the Tune panel), including tuning inside an alternate. Separate plan.
  - Their Multi-angle. A code-built scene has no camera.
  - Clip speed and transitions.
  - Alternates for footage clips, and for single-page reels. Parts reels only.
- Open questions: all settled with the owner in the 2026-10-13 grilling session.
  - O1: settled. One revision per alternate, on top of `2026-10-12-shots-as-parts.md`.
  - O2: settled. Alternates you did not choose travel into the next version until you dismiss them.
  - O3: settled. Only one shot per batch may ask for options: two, three or four, three by default.
  - O4: moved to the span pins plan.
  - O5: settled. A reminder only. Nothing is blocked; the alternate in the reel stays there until you choose another.
  - O6: settled by the parts design. Kinotta assembles a page for any choice of revisions, so the stage shows alternate B by loading the page assembled with B.
  - N6: settled. Each alternate has a "Not this" button with an optional reason. It dismisses the alternate, and the reason goes to the agent in the next batch.
  - Also settled: alternates of one shot may differ in length, and choosing one moves later shots by the rule in the parts plan.

Decided with the owner in the 2026-10-13 preview session: the flow in the mockup (ask with a pin, answer on the storyboard, choose and keep pinning); one card per shot; choosing is an edit, not a new version; Multi-angle is left out.

## Goal

On a parts reel, a comment can ask for options on its shot. The next version brings that shot back with two to four alternates, each named and described by the agent. The Storyboard shows them inside the one shot card, the enlarged shot shows any of them live and takes pins on it, "Use" puts one in the reel as an undoable edit, and "Not this" dismisses one with an optional reason.

Acceptance criteria:

- A comment on the newest version has an "Ask for options" switch with a count of 2, 3 or 4, default 3. Once one comment asks, the switch on comments of other shots is off, with a line naming the shot that already asked.
- The copied batch states the request on that shot's heading, as in `Shot 04 · 3 alternates`.
- A manifest may give a shot `alternates`: two to four entries of `{ revision, label, title, note, duration }`. The shot's own `revision` is the one in the reel. `kinotta check` reports fewer than two, more than four, a missing revision, a repeated label, or a shot `revision` that is not among its alternates.
- The grid shows one card for the shot, as the only stacked paper at rest, with a strip of one segment per alternate and the label of the one in the reel. The top bar shows how many shots need a choice. Nothing is blocked by it.
- The enlarged shot shows the alternates strip from the mockup. Selecting one shows it live in the frame. Up and Down step alternates; Left and Right still step shots. A pin placed while viewing B is recorded on B and shown only on B.
- "Use" is one edit on the working reel. It changes which revision is in the reel, moves later shots if the length differs, appears in the Edits list, and one undo reverses it. It freezes with the next render or hand-off.
- "Not this" is one undoable edit that marks an alternate dismissed, with an optional reason. A dismissed alternate is not shown on the strip. The alternate in the reel cannot be dismissed.
- The next batch states, for a shot with alternates, which one is in the reel, each dismissed one with its reason, and pins on any alternate with its label.
- When the agent builds the next version, alternates that were neither chosen nor dismissed are still offered on that shot. Dismissed ones are not. `kinotta build` carries them forward when the agent's manifest leaves that shot's alternates out.
- A reel with no alternates, and every single-page reel, opens, checks and renders exactly as before.

## Approach

UI lane B, built to `docs/mockups/2026-10-13-alternates-in-storyboard.html`, steps 1 to 3, minus the span pin in step 1 of the mockup.

An alternate is a shot revision. The parts plan already gives every shot immutable revisions and a manifest that names one per shot, so alternates add a list beside that name and nothing else on disk.

- Manifest: `alternates` on a shot, as in the acceptance criteria. Read in `version.ts`, validated in `contract.ts`, exposed on `Shot` as `alternates` with the chosen one marked.
- A page for any alternate: the assembler takes an optional override of one shot's revision. The server serves that assembled page at a URL keyed by version, shot name and revision, cached by those three, so stills and the player load alternate B the same way they load the version page. A frozen version's own `index.html` always holds the revision in the reel.
- Asking: `NewComment` gains `options?: 2 | 3 | 4`, stored on the comment. `comments.ts` refuses a second asking shot in one version with `invalid` and the reason the UI shows. `batch.ts` writes the heading.
- Choosing and dismissing: two operations in `edit-model.ts`, `shot-alternate` (`shot`, `revision`) and `shot-alternate-dismiss` (`shot`, `revision`, `reason`). Both go through the working reel that live edits provides, so undo, the Edits list and freeze-at-render work without new machinery. Choosing changes the shot's duration in the working manifest; later shots follow from the running sum, and attached sound follows as it does for a moved shot.
- Pins on an alternate: a frame pin gains `alternate?: <revision>`. The frame shows a pin only when its alternate is the one being viewed, or when it has none. Carry keeps the field while that revision is still offered and otherwise sets the existing `element-removed` style state with a new reason.
- Travelling forward: `kinotta build` merges the previous manifest's undismissed alternates into a shot the agent did not rebuild with new ones. An agent that answers "use B, make it bigger" writes one new revision and lists it first.
- Storyboard: `ShotCard` gains the strip and the stacked-paper state; `ShotSheet` gains the alternates strip, the viewed-alternate state and the keys; the top bar gains the count. No new screen.
- The skill learns to answer an options request: write one revision per alternate, give each a title and a one-line note saying what differs, list the recommended one first, and never offer more than asked.

## Steps

Each step is a failing test first, then the change.

1. `alternates` in the manifest: reading, validation and `kinotta check` messages.
2. The assembler's revision override and the served page for an alternate.
3. `options` on a comment, the one-shot rule, and the batch heading.
4. `shot-alternate` and `shot-alternate-dismiss` operations, with undo and a length change that moves later shots.
5. `alternate` on frame pins, their display rule and their carry.
6. Batch lines for the alternate in the reel, dismissed alternates with reasons, and pins on alternates.
7. `kinotta build` carrying undismissed alternates forward.
8. Storyboard card, enlarged shot strip, keys and the top-bar count, to the mockup.
9. Skill references, `CONTEXT.md` (Alternate), `server/core/README.md`.
10. `/impeccable critique`, `/impeccable audit`, the verbs they flag, `/impeccable polish`, then the session summary.

## Risks

- Two unbuilt plans sit under this one. It is written against what they describe. If either lands differently, this plan is revised before its first step.
- Each alternate on the strip is a live page. Four alternates on an open shot is four frames; the strip must load them only while the shot is open and show a plain placeholder until each is ready.
- Alternates of different lengths change the reel's duration when chosen. Renders, the overload check and comment times after that shot all depend on it, so the choice must go through the same path as any other timing edit and never be a display-only switch.
- Travelling alternates can pile up over rounds. The only way out is "Not this", so the strip must stay usable at four and the check must refuse a fifth.
- The "one shot per batch" rule is enforced when a comment is saved. Comments carried from an older version could bring a second asking shot; carry must clear `options` on a carried comment.

## Checks to run

- `npm run typecheck`, `npm run build`.
- Vitest, one worker: the new manifest, override, comment, operation, pin, batch and build tests, plus the existing contract, comments, carry, comment-batch and edit-list suites.
- Playwright, one worker: `storyboard`, `pins`, `review` and `editing` specs, with a parts fixture reel that has a shot with three alternates.
- Shell checks in dark and light themes at 390, 768, 1024, 1272 and 1600px for the Storyboard with an alternates card and the enlarged shot.

## Changelog

### 2026-10-13
- Plan created with Intent only. Flow and three assumptions agreed from `docs/mockups/2026-10-13-alternates-in-storyboard.html`. Awaiting approval of the Intent and answers to O1 to O6 before Goal and Approach.
- O1 and O5 settled by the owner from the questions screen: one page per shot, and the unchosen shot is a reminder only. Order of work is now live edits, shots as parts, then this plan. O2, O3, O4 and O6 remain open.
- N6 added at the owner's request: marking alternates kept or rejected, carried in the batch.

### 2026-10-14
- Remaining questions settled with the owner in the 2026-10-13 grilling session: one asking shot per batch with 2 to 4 alternates, differing lengths allowed, unchosen alternates travel until dismissed, and a "Not this" button with an optional reason (N6).
- Span pins split out into `2026-10-14-span-pins.md`.
- Goal, Approach, Steps, Risks and Checks written on top of the parts design. Awaiting approval before code.
- Approved by the owner on 2026-10-14 with the Codex brief `docs/briefs/2026-10-14-live-edits-parts-alternates/1-chain-codex.md`.
