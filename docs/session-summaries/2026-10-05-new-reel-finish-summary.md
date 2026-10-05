# New reel finish: summary

Date: 2026-10-05. Branch: `feat/review-edit-phase`. Plan: `docs/plans/2026-10-05-new-reel-finish.md`.

## Shipped vs planned

All four planned steps shipped.

- **Story 8** (`3f80bc9`): a picked HEVC or ProRes video gets its H.264 copy at Start, before the reel exists, in
  `footage/.playback/` named from its project path (`media/clip.mp4` gives `media--clip.mp4`). A dropped video's copy
  keeps its old name. ADR 0002 is amended. The new core test checks that the original is unchanged, nothing is written
  beside it, and `footageFile` serves the copy.
- **Story 10** (`45dc967`): a drop copies the video into `footage/` and picks it, so the same "Reel name" form,
  prefilled from the file name, starts the reel. `drop-video.spec` renames before starting.
- **Finish pass** (`f1674f4`), built to `docs/mockups/2026-10-05-review-edit.html` state 1:
  - The drop zone sits beside the project's videos under "Start a reel from a video".
  - The tool check is the one-line "Needs on this machine" row, with install hints when a tool is missing.
  - Codec names and the playback-copy note show on each video.
  - Critique scored 27/40 (single-context, at the owner's choice of no sub-agents). The owner chose to fix P1 and both
    P2s:
    - While New reel is open, the top bar names it, the rail hides the last reel's sections and versions, and the side
      panel says what happens next.
    - Drop status and upload progress sit inside the zone.
    - The brief block is aligned to the drop columns.
  - Audit scored 17/20. Its two P3s, the brief heading level and the terrain colour token, were fixed.
- **Close-out:** T42, T44 and T45 Done, issues #32, #44 and #46 ticked, and the phase plan set to Done.

`<MissingTools />` was mounted before this plan, in `09440d9`.

## Deviations

- The mockup's "What happens next" copy said "Save makes v1" and "Rename or move them any time". The panel says what the
  code does instead: v1 is built when the words are in, and sections are split at pauses. Section rename and move (E12)
  has no ticket.
- The HEVC tests need ffmpeg with libx265, like the existing import tests. The plan's "skip when it cannot" was not
  added.
- The critique's P3, the Doto duration numerals in the pick list, was left as it is.

## Checks run (at `f1674f4`)

- `npm run typecheck`: clean.
- `npx vitest run`: 37 files, 353 passed and 1 skipped (the opt-in faster-whisper test).
- `npm run build`, then `npx playwright test`: 101 passed.
- Impeccable detector: 0 findings on the changed markup files.
