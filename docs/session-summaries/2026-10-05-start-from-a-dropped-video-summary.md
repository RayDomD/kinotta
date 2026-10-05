# Start from a dropped video (T42, #44): run summary

Date: 2026-10-05. Branch: `worktree-agent-a9ba721915c80f62f` (local, not pushed). Plan:
`docs/plans/2026-10-05-start-from-a-dropped-video.md`. Ticket: T42 in `docs/tickets-review-edit.md`.

## What shipped

- `Project.importVideo(name, body)` (`server/core/_internal/import.ts`): streams the body into `footage/` while hashing it
  (SHA-256, never held in memory). A file in `footage/` with the same size and hash is reused (`copied: false`), whatever
  the name; a different file with a taken name becomes `name-2.ext`. The name is cut to its last path segment, so it
  cannot leave `footage/`. A non-video extension or a file that cannot be probed is rejected (`invalid`) and removed.
- HEVC or ProRes: an H.264/AAC copy is written to `footage/.playback/<name>.mp4` through the runner (`makePlaybackCopy`,
  ffmpeg), staged and renamed. The original is untouched. `footageFile` serves the copy when it exists; `reel.json` still
  names the original. `listVideos` skips dot folders, so copies are not listed.
- HTTP `POST /api/footage?name=` (raw body; 201 copied, 200 reused). UI: `web/src/DropZone.tsx` (drop or "Choose a file…"),
  one line in `NewReel.tsx`. A drop copies, then starts the reel named from the file, and opens it in Review.
- ADR 0002 amended. Tenth e2e server (port 4388) for `drop-video.spec.ts`.

## Deviations and decisions

- A drop starts the reel at once with the file's name; there is no name field first (the picker keeps one).
- The H.264 copy is made for dropped videos only, as the ticket says. The mockup also shows one for a picked HEVC file; not done.
- The runner-only test caught a comment naming ffprobe in `import.ts`; reworded. The runner now also owns ffmpeg.
- The GitHub issue (#44) criteria were not ticked from this run; the edit was blocked and is left to the owner.

## Checks

- `npm run typecheck` clean. `npm test` 189/189 (7 new in `tests/core/import-video.test.ts`, real ffmpeg/ffprobe).
  `npm run test:e2e` 82/82 (new `drop-video.spec.ts`: drop, reel opens in Review with video, drop again adds no second copy).
