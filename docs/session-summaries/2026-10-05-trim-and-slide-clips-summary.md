# Trim and slide clips (T38, #40): run summary

Date: 2026-10-05. Branch: `feat/review-edit-phase` (local, not pushed). Plan: `docs/plans/2026-10-05-trim-and-slide-clips.md`.

## What shipped

- Core: operations `clip-trim { clip, in, out }` and `clip-slide { clip, delta }` in `edit-model.ts` (apply, `operationTouches`, `describeOperation`, edit list kinds). A trim keeps a clip at least 0.2 s long inside the footage; a slide stays inside it and sets `slid: true` on the clip. A trim drops the states (`stills`) that begin outside the new length, and a `still` that no longer falls in its state, so Save's shot list loses the cut-off state's shot (`02b`).
- Save: `changedSections` now counts a changed clip against its own section and every section it plays over (the page comparison does), so the claim and the comparison agree.
- `Version.clips` (the plan's clips, source time). Agent-built versions have no plan of their own: the newest takes the reel's editing plan, older ones have none.
- Editor: Clips lane drawn from the plan clips with unsaved operations applied. Drag the body to slide, an edge to trim, Alt with the arrow keys slides a focused clip (0.1 s, Shift 1 s). A slid clip carries a dashed "off its words" tag; its Edits card is dashed with a note saying it can be re-synced by an agent. Undo and Redo work as for other edits.
- Tests: `tests/core/edit-model.test.ts` +6, `tests/core/snip-save.test.ts` +3 (footage-project sample, real build: trim drops a state's shot and rebuilds the page, slide writes `slid`, refusals, changed sections and no claim mismatch), `tests/web/edited.test.ts` +3, `tests/e2e/clips.spec.ts` +1 (new server, port 4384).

## Decisions and deviations

- States are clip-local, so trimming a clip's front moves its start without moving its states; only a shorter clip drops states. The engine plays a clip from its in-point, so a front trim starts the animation later rather than cutting its beginning.
- Overlapping clips are allowed (the engine layers scenes); the lane keeps a clip on the footage and at least 0.5 s long when dragging.
- Pointer capture: the clip and its grips capture and stop the press themselves, so the lanes' container capture does not retarget their events. Trim and slide are on only with the Select tool.
- A dragged edge is mapped to the footage through the edited pieces; a slide moves both edges by the timeline distance.
- Engine unchanged; the committed footage sample needed no rebuild. The skill's rules for `slid` are T46's.

## Checks

- `npm run typecheck`: clean.
- `rtk proxy npm test`: 26 files, 276 tests passed.
- `rtk proxy npm run test:e2e`: not run (ports 4398/4399 held by orphaned servers). With a scratch config outside the repo (ports 4384, 4385, 4386 only, no reuse, servers stopped after): `clips.spec.ts`, `snip-save.spec.ts` and `review.spec.ts`, 11 passed. The scratch run needs `npm run build` first (the servers serve `dist/web`).
