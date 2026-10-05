# Review and Edit phase (direct edits): run summary

Date: 2026-10-05 (unattended overnight run). Branch: `feat/review-edit-phase`, off `feat/storyboard-phase`, local and not
pushed. Plan: `docs/plans/2026-10-04-direct-edits.md`. Spec: `docs/specs/2026-10-05-review-edit-phase.md` (#30).
Tickets: `docs/tickets-review-edit.md` (T29 to T47, issues #31 to #49). Executor: Sonnet sub-agents, one ticket per fresh
context, at the owner's choice.

## Shipped vs planned

16 of 19 tickets are Done on this branch:

- **First slice:** T29 pieces in the engine and core mapping, T30 start from a picked video, T31 Review tab plays a reel,
  and T32 snip and Save.
- **Edit kinds:** T33 undo, redo and remove, T34 blade and reorder, T36 words, T37 captions, T38 clip trim and slide, T39
  element offsets on footage reels, and T40 element offsets on code-only reels.
- **Flow:** T35 carry-forward by remapping, T41 hand-off blocks Save, and T43 real transcription with progress.
- **Finish:** T46 skill rules and agent-neutral wording, and T47 the Lane B finish pass.

The owner can start a reel from a picked video, play it, cut, snip, reorder, fix and re-time words, move captions, trim
and slide clips, and move and scale elements. They Save to the next version with no agent, and an agent's next build keeps
those edits.

Three tickets are **Parked (owner)**. Each is built and committed with its checks green, but on its own worktree branch.
Merging into this branch was refused by the permission classifier in the unattended run.

| Ticket | Branch | Commit |
|---|---|---|
| T42, drop a video | `worktree-agent-a9ba721915c80f62f` | `aaead62` |
| T44, startup check | `worktree-agent-adfb0c28f2649be21` | `1ca4280`, based on old `4aa1fe6` |
| T45, brief reels, empty Storyboard, last-used tab | `worktree-agent-a164f2735842a217f` | `129ea98` |

After merging:

- Mount `<MissingTools />` in `NewReel.tsx` (T44).
- Give T42 an editable name and an H.264 copy for picked HEVC or ProRes files (stories 8 and 10).
- Run the T47 finish pass on the drop zone and brief form.

## Deviations

- **Save for agent-built reels.** T32 first could only edit reels with a reel-folder `plan.json`. A follow-up (`ed3d236`)
  resolves `motion/plan.json` for agent-built footage reels, per E2.
- **Words lane.** T36's word editor could not open by mouse because the lanes captured the pointer, and the grips had no
  size. Fixed in `55257a1`.
- **Sections stay contiguous by refusal (T34).** A move that would split a section is refused. Section bounds are not
  rewritten.
- **Save is blocked while any edit is flagged after a replay (T41).** A flagged edit is not silently excluded.
- **Per-card button labelled "Remove" (T33).** The mockup says "Undo".
- **Front trims (T38).** Trimming a clip's front starts its animation later instead of cutting its head.
- **Transcription progress is held in memory (T43).** A restart mid-transcription does not resume.
- **E12 section drag and rename** has no ticket. The spec listed no operation for it.

## Code review

`/code-review` ran on `07406e8...HEAD` against spec #30. The **Standards** axis found one hard item and four judgement
calls.

- **Fixed in `920528d`:**
  - A committed `.pyc` file, now untracked and ignored.
  - Constants duplicated between web and core.
  - The bare `'you'` sentinel, now `BUILT_BY_YOU`.
- **Left as recorded judgement calls:**
  - The `Lanes.tsx` size.
  - Web importing `server/core/model.ts`, which the core README documents.

The **Spec** axis found P1 to P9:

- **P1** is T42's, and parked.
- **P4** is the `.pyc` file, fixed in `920528d`.
- **P5** is accepted, since its features were ticketed.
- **P2, P3 and P6 to P9** were fixed in `1806029`:
  - Save carries comments at once.
  - Plan-less versions resolve the right pieces.
  - A save journal closes the crash window.
  - Transcript fields are preserved.
  - A code-only Save copies no stale review files.
  - Element pins are flagged "Element removed".

A focused re-review of those fixes found three more problems, all fixed in `947ee8b`:

- The newest-version plan order.
- The journal's committed-check.
- Conservative element flags.

No open findings remain.

## Checks run (at `06ca70f`)

- `npm run typecheck`: clean.
- `rtk proxy npm test`: 33 files, 332 passed and 1 skipped. The skipped test is the opt-in real faster-whisper test,
  which passed when run once with `KINOTTA_REAL_WHISPER=1`.
- **e2e:** the full `npm run test:e2e` has **not** run. Two orphaned e2e servers from an interrupted run, node PIDs 14340
  and 34508, hold ports 4399 and 4398, and stopping them was refused by permissions. The other 14 spec files ran through a
  scratch config that starts only their servers: 58/58 passed.
  - Not run: `smoke`, `storyboard`, `lanes`, `pins`, `sections` and `contract`, which need 4399 or 4398.
- **Flaky, passed on rerun:** an `engine-compose` pixel compare, a `review.spec` timing assertion, a `lanes.spec` test,
  and two `handoff.test.ts` timeouts under load.
- **Issues:** GitHub issue criteria were ticked where `gh issue edit` was allowed. It was denied for #32, #44 and #46.
