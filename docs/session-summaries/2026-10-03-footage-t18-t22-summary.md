# Footage reels T18 and T22: run summary

Date: 2026-10-03. Branch: `feat/storyboard-phase` (local, not pushed). Plan:
`docs/plans/2026-10-03-footage-t18-t22.md`. Tickets: T18 (#21), T22 (#25).

## Outcome

Both tickets shipped inline, with no subagents, and their criteria are ticked in `docs/tickets.md`.
The GitHub issues are still open.

| Ticket | What shipped | Commit |
|---|---|---|
| T18 | `skill/kinotta/` gains motion-broll's `engine/` (Geist OFL beside the fonts), `scripts/`, `templates/`, `examples/opus-aoe2/`, `reference/engine-api.md`, and its SKILL.md body as `reference/motion-broll.md`. The description covers b-roll for review in Kinotta and hands other b-roll to motion-broll. A new section 5 points footage requests at the material and says the footage workflow isn't written yet. ADR 0001 records the engine as part of Kinotta. | `f14e6e6` |
| T22 | `kinotta check` adds `footage-missing`, `transcript`, `shot-type` and `no-spoken-line` after the contract issues on a footage reel, built from the core's public `Version`. Seven new tests in `tests/core/check.test.ts`. The codes are listed in `reference/contract.md`. | `31957e3` |

## Deviations

- `skill/kinotta/engine/package.json` (`"type": "commonjs"`) was added. The repo's `"type": "module"`
  made `render.js` fail with `require is not defined` when run from inside the repo, which is where the
  installed skill's junction points.
- `.gitattributes` keeps `*.sh` LF, and the copied `setup.sh` was converted to LF. The source file is
  CRLF, which bash rejects.
- `shot-type` also fails a type other than `cutaway` or `panel`, not only a missing one. A misspelt
  type would otherwise pass.

## Checks

- `npm run typecheck` clean, `npm test` 135/135, `npm run test:e2e` 71/71.
- From `skill/kinotta/engine/`: `build.py` built `examples/opus-aoe2/06-chapter.html`, and `render.js`
  rendered it to an 87-frame 1920x1080 29.97 fps MP4 with no page errors. Playwright's bundled
  browsers aren't installed, so a preload shim launched the installed Chrome; the engine wasn't edited.
- `~/.agents/skills/motion-broll`: SHA-256 of all 24 files identical before and after.
- The copy matches the source (line endings aside) except for the two files above.

## Open for later tickets

- `engine/beats.js` (contact sheets) creates its temp folder under the hardcoded `/tmp`, which
  doesn't exist for Node on Windows (`ENOENT mkdtemp '/tmp/btXXXXXX'`). The standalone copy has the
  same bug. T19 requires contact sheets to work, so it needs fixing there.
- `render.js` hangs instead of failing when its output folder doesn't exist.
