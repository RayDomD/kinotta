---
title: Trim and slide clips (T38)
date: 2026-10-05
status: Done
summary: T38. clip-trim and clip-slide operations; drag a clip's edges to trim, its body to slide; a slide sets slid in the plan and the lane says "off its words"; a trim drops the shots of states it cuts off.
spec: docs/tickets-review-edit.md T38 (#40); docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: A b-roll clip cannot be shortened, lengthened or moved without an agent re-running the plan.
- Why: The Review and Edit phase lets the owner fix what the agent built; clip timing is most of it.
- Proposed outcome: Drag a clip's edge to trim it, its body to slide it. Save writes both into the plan and the next version. A slid clip is marked "off its words". A trim that cuts off one of a clip's states drops that state's shot.
- Affected: `server/core` (edit model, footage read, Save's changed sections), `web/src/review` (Clips lane, Edits panel), `playwright.config.ts`.
- Constraints: Plans without edits build as before; the engine is unchanged. Editor chrome is never inside the page.
- Out of scope: re-syncing a slid clip (an agent's job), moving elements inside a clip, creating or deleting clips.
- Open questions: What a state is when a clip is trimmed (decided below).

## Goal

`clip-trim { clip, in, out }` and `clip-slide { clip, delta }` are operations in the edit list. They preview in the Clips lane and Save writes them into the plan; a slide sets `slid: true`.

## Approach

- Operations in `edit-model.ts` (source seconds, shared with the browser). A trim needs a clip at least 0.2 s long inside the footage and a real change; a slide needs a distance and stays inside the footage.
- States (`stills`) are clip-local, so a trim drops the states that begin at or after the new length, and a `still` that no longer falls inside its state; the shot list is rebuilt from the plan on Save, so the dropped state's shot goes.
- Save's `changedSections` counts a changed clip against its own section and every section it plays over, before or after, since the page comparison counts every scene over a section.
- `Version.clips` carries the plan's clips (source time). A version an agent built has no plan of its own: the newest takes the reel's editing plan, an older one has none and its lane falls back to its shots.
- Editor: the Clips lane draws plan clips with the unsaved clip operations applied, mapped through the edited pieces. Body drag slides, edge grips trim, Alt with the arrow keys slides a focused clip. The clip handles its own pointer capture and stops the event, so the lanes' press capture does not swallow it (the T36 pitfall). Slid clips show a dashed "off its words" tag; the Edits card is dashed with a note.

## Steps

1. Core and web unit tests, then `edit-model.ts`, `save.ts`, `footage.ts`.
2. Editor: `edited.ts`, `Lanes.tsx`, `Review.tsx`, `EditsPanel.tsx`, CSS.
3. Playwright `clips.spec.ts` on port 4384.
4. Checks.

## Risks

- A drag across a snip maps an edge through the pieces; a clip split by a snip trims its visible edge only.

## Checks to run

`npm run typecheck`, `rtk proxy npm test`, e2e through a scoped scratch config (clips, snip-save, review).

## Changelog

### 2026-10-05
- Plan created.
- Done. See the session summary.
