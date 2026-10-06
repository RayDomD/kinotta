# Presets and the four settings: summary

Date: 2026-10-06. Ticket T53 (#52). Plan: `docs/plans/2026-10-05-render-settings.md`.

## Shipped vs planned

Shipped as planned, except that the web client types are left for T55 (see Deviations).

- **Settings.** `RenderSettings` is `{ fps, size, quality, audio }`. `RenderRequest` takes any of them, plus
  `remember`. A render uses the request's settings over the reel's saved ones for its preset over R2's defaults
  (Draft `{ source, half, standard, smooth }`, Final and Overlay `{ source, source, standard, smooth }`). An unknown
  value is `invalid` naming the setting.
- **Engine.** Frame rate: `source` is the footage's rate or 30 for a code-only page. Size sets the short side and keeps
  the source's aspect ratio, and the page is scaled through `deviceScaleFactor`. High lowers the CRF (Draft 28 to 20,
  Final 16 to 10) or writes ProRes 4444 XQ for an Overlay, through a new optional `render.js --prores-profile` flag; the
  skill's default run is unchanged. File names add `-high`, then `-hardcuts` for Hard cuts in a render with sound.
- **Saving (R16).** `reels/<reel>/render-settings.json` holds `{ draft, final, overlay }`, written atomically under the
  reel lock. Only a request with `remember: true` saves, for its preset only, once the render is accepted.
  `project.renderSettings(slug)` returns the three presets with defaults filled in.
- **HTTP.** `POST /api/renders` passes the settings and `remember`; `GET /api/reels/<reel>/render-settings` returns
  `{ settings }`.
- **CLI.** `kinotta render` takes `--fps`, `--size`, `--quality` and `--audio`, and never sends `remember`. An unknown
  value or flag prints the usage.

## Decisions for the owner

R2 and R3 left these open. Each is built as described and is easy to change:

1. **Draft's size.** R2 says Draft is half size, but R3's size list (source, 1080p, 4K) has no half. `half` is a fourth
   size value and Draft's default.
2. **Size is the short side.** `1080p` makes the short side 1080, so a vertical page comes out 1080x1920; the file is
   named by its height (`1920p30`).
3. **High quality values.** CRF 20 for a Draft, 10 for a Final, ProRes 4444 XQ for an Overlay.
4. **`kinotta render` without flags uses the reel's saved settings** for that preset, the ones Picker shows.
5. **Audio only names a render with sound.** A code-only or Overlay render with `audio: 'hard'` keeps the plain name.
   Before this ticket, a code-only Draft asked for Hard cuts was named `-hardcuts`.

## Deviations

- **Web client types not changed.** Nothing in the UI sends settings yet; T55's Picker form adds the client call and
  its types together.
- **Settings saved even if the render then fails.** `remember` saves when the render is accepted, since the owner chose
  those settings either way.

## Checks

- typecheck: clean.
- vitest: 44 files, 422 passed, 1 skipped (full run). An earlier full run had one 5 s timeout in `handoff.test.ts`,
  which T53 doesn't touch; it passed alone, in the unit project, and in the next full run. New: `tests/core/render-settings.test.ts` (13 tests) and a footage test for size and frame
  rate in `render-footage.test.ts`, seen failing first.
- Playwright: not run; this ticket changes no UI code. T52 ran the full suite (103 passed) on the server paths this builds on.
