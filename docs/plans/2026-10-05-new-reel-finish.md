---
title: New reel finish, editable drop name, playback copy for picked videos
date: 2026-10-05
status: Done
summary: Close T42's open stories 8 and 10 and run the T47 finish pass on the drop zone and brief form after the T42/T44/T45 merge.
spec: docs/specs/2026-10-05-review-edit-phase.md
---

## Intent

- Problem: After merging T42, T44 and T45, the New reel screen still misses two spec stories. A dropped video starts
  a reel at once under its file name, with no chance to rename it (story 10). A picked HEVC or ProRes video gets no
  H.264 copy, so it does not play in the browser (story 8); only dropped videos get one. The drop zone, pick list,
  missing-tools notice and brief form were built in separate worktrees and never had the T47 finish pass.
- Why: These are the last open items before T42, T44 and T45 can be marked Done and the phase plan closed.
- Proposed outcome: Dropping or picking a video both lead to the same "Reel name" step, prefilled from the file name.
  Any HEVC or ProRes video plays in Review, whichever way it came in. The New reel screen matches the saved mockup.
- Affected: `web/src/NewReel.tsx`, `web/src/DropZone.tsx`, `web/src/MissingTools.tsx`, `web/src/BriefReel.tsx`,
  `web/src/styles.css`, `server/core/_internal/start.ts`, `server/core/_internal/import.ts`,
  `server/core/_internal/footage.ts`, ADR 0002, tests under `tests/core` and `tests/e2e`.
- Constraints: The original video is never altered (story 9). A picked video is not copied or moved (story 6).
  Processes start only through `runner.ts` (E3). The layout follows `docs/mockups/2026-10-05-review-edit.html`
  (drop state), which is the decision for this surface.
- Out of scope: The open owner decisions in the run summary (front trims, "Remove" label, section-split refusal,
  transcription resume, E12 section drag and rename). Resolution in the pick list meta.
- Open questions:
  - Q1. Where does a picked video's playback copy go? Recommended: `footage/.playback/`, named from the video's
    project-relative path (`media/talk.mov` becomes `media--talk.mp4`), so ADR 0002's "only files outside `reels/`
    are the copies in `footage/.playback/`" stays true. The alternative is `media/.playback/` beside the original,
    which needs an ADR amendment.
  - Q2. When is the copy made? Recommended: at Start, before `startReel` returns, with "Making a playback copy…"
    shown. A long ProRes file then takes a while to start, but Review never opens on a video it cannot play.
  - Both settled by the owner on 2026-10-05: the recommended answers.

## Goal

Drop and pick share one naming step; every HEVC or ProRes video plays in Review through a copy in
`footage/.playback/`; the New reel screen is built to the saved mockup's drop state and passes critique and audit.

## Approach

1. Story 10: Unify drop and pick. A drop imports the file into `footage/` as today, then selects the imported video
   as `picked`, with the name prefilled from `suggestedTitle`. The same "Reel name" form and Start button start
   the reel. `DropZone` reports the imported path instead of starting the reel.
2. Story 8: `startReel` probes the codec (it already does). For HEVC or ProRes it makes the playback copy through
   `ensurePlaybackCopy`, moved into a function shared by `import.ts` and `start.ts`. `footageFile` looks for the
   copy where Q1 puts it.
3. T47 finish pass, Lane B, with the mockup as the decision. Use a two-column drop state (the drop zone at 1.3fr,
   the pick list at 1fr) and the heading "Start a reel from a video". The tool check becomes the mockup's one-line
   `rv-needs` row in the pick column ("Needs on this machine: … All found."), with the install hints shown when
   something is missing. The brief form stays below, since the mockup predates T45. Then run `/impeccable critique`,
   `/impeccable audit`, the verbs those flag, and `/impeccable polish`.

## Steps

1. Story 10: change `DropZone` to `onImported(path)`; `NewReel` picks the imported video and refreshes the list.
   Update `drop-video.spec.ts` for the name step and add a check that the name is editable.
2. Story 8: move the shared copy helper, call it from `startReel` for HEVC or ProRes, and point the `footageFile`
   lookup at the Q1 location. Core test: a picked HEVC video gets a copy and the original's bytes are unchanged.
   Amend ADR 0002 if Q1 goes the other way.
3. Finish pass on the New reel screen per the Approach, step 3.
4. Mark T42, T44 and T45 Done in `docs/tickets-review-edit.md`, tick #32, #44 and #46, update the run summary, set
   the phase plan to Done, regenerate the index, and commit. Ask before pushing.

## Risks

- A HEVC test fixture needs ffmpeg with an HEVC encoder on the test machine. If it is missing, the test makes the
  fixture at run time and skips when it cannot, like the opt-in Whisper test.
- Making the copy at Start blocks on a long transcode (Q2).

## Checks to run

- `npm run typecheck`, `npx vitest run`, `npm run build`, then the full `npx playwright test`.
- `/impeccable audit` clean on the New reel screen.

## Changelog

### 2026-10-05
- Plan created.
- Q1 and Q2 approved as recommended; status In Progress.
- Shipped: story 8 (`3f80bc9`), story 10 (`45dc967`), finish pass (`f1674f4`) after a critique (27/40) whose P1 and
  both P2s the owner chose to fix. Checks green; status Done. Summary:
  `docs/session-summaries/2026-10-05-new-reel-finish-summary.md`.
