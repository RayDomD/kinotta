# Startup tool check: summary

Date: 2026-10-05. Ticket T44 (#46). Plan: `docs/plans/2026-10-05-startup-tool-check.md`.

## Shipped vs planned

Shipped as planned: core `checkTools` and `missingToolsMessage` (exported from `server/core/index.ts`), the startup
message on stderr after the URL line, `GET /api/tools`, `fetchTools` in the web api, and a `<MissingTools />` component
(`web/src/MissingTools.tsx`) that renders nothing when all tools are present.

## Deviations

- The component is not mounted: the New reel screen (T30) is built in parallel and absent from this branch. The
  coordinator mounts `<MissingTools />` there after merging. The second criterion's New-reel half is therefore open.
- faster-whisper is looked up with `importlib.util.find_spec`, not an import, because the import takes about a second.
- Ticket file and issue were not updated (the ticket file is not on this branch's base).

## Checks

See the final report for the counts of typecheck, vitest and Playwright runs.