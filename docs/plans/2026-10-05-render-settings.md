---
title: Presets and the four settings (T53)
date: 2026-10-06
status: Done
summary: A render takes frame rate, size, quality and audio at cuts on top of its preset's defaults; Picker's render call remembers them per preset in render-settings.json, the CLI's flags never do.
spec: docs/specs/2026-10-05-approve-and-render.md
---

## Intent

- Problem: a render always uses its preset's fixed values. The owner can't pick a frame rate, a size or a higher quality, and nothing remembers what they picked last time.
- Why: R2 makes presets named defaults and R3 gives four settings on top, remembered per reel (R16), with non-default quality or audio named in the file (R18).
- Proposed outcome: `project.render` takes `fps`, `size`, `quality` and `audio`, filled from the reel's saved settings for that preset and then from the preset's defaults. A request with `remember: true` (Picker's) saves them to `reels/<reel>/render-settings.json`. `kinotta render` takes the four as flags and never saves.
- Affected: `server/core/_internal/render.ts`, a new `render-settings.ts` in the core, `types.ts`, `index.ts`, `skill/kinotta/engine/render.js` (one optional flag), `runner.ts`, the HTTP handler, `server/cli.ts`, the web client types, the core and http READMEs.
- Constraints: R2, R3, R16, R18. `render.js`'s default run stays unchanged. Size scales the page (`deviceScaleFactor`), never re-lays it out, and keeps the source's aspect ratio.
- Out of scope: Picker's form (T55); parallel segments (T54).
- Open questions: None that block. The decisions below are recorded for the owner.

## Goal

Each preset renders with its R2 defaults; each setting changes the output as described, size keeping the source's aspect ratio; a High-quality or Hard-cut render gets its own file name; settings saved by the HTTP call come back per preset; `kinotta render` with flags leaves `render-settings.json` unchanged.

## Approach

**Settings.** `RenderSettings` is `{ fps: 'source' | 24 | 25 | 30 | 60, size: 'half' | 'source' | '1080p' | '4k', quality: 'standard' | 'high', audio: 'smooth' | 'hard' }`. `RenderRequest` gains optional `fps`, `size` and `quality` beside its existing `audio`, plus `remember`. The settings a render uses are the preset's defaults, overlaid by the reel's saved settings for that preset, overlaid by the request's own. An unknown value is `invalid`.

Defaults (R2): Draft `{ source, half, standard, smooth }`; Final and Overlay `{ source, source, standard, smooth }`.

**Decisions R2 and R3 leave open** (recorded in the summary for the owner):

1. *Draft's size.* R2 says Draft is half size, but R3's size list (source, 1080p, 4K) has no half. `half` becomes a fourth size value and Draft's default.
2. *Size is the short side.* `1080p` means the short side is 1080 and `4k` means 2160, so a vertical 9:16 source at 1080p comes out 1080x1920. The long side follows the source's aspect ratio. `source` is the source's size, `half` half of it.
3. *High quality.* H.264 CRF goes from 28 to 20 for Draft and from 16 to 10 for Final. Overlay has no CRF, so High writes ProRes 4444 XQ instead of 4444. That needs one new optional `render.js` flag, `--prores-profile`, whose absence keeps today's profile.
4. *A `kinotta render` without flags uses the reel's saved settings* for that preset, the same ones Picker shows. Flags override them for that render only.
5. *`-hardcuts` only when the render has sound.* Overlay and code-only renders have no audio, so the audio setting changes nothing and doesn't rename the file.

**Engine.** `runRender` reads the settings. Frame rate: `source` is the footage's rate or 30 for a code-only page, otherwise the number. Size: the target height and width come from the source's size (the page for code-only, the footage otherwise) through the short-side rule, made even; the page's scale is target height over page height. CRF and the ProRes profile come from the quality. The file name adds `-high` for High and then `-hardcuts` for Hard with sound (R18), after `<height>p<fps>`.

**Saving.** `render-settings.ts` reads and writes `reels/<reel>/render-settings.json` (`{ draft, final, overlay }`, each the four settings) atomically under the reel lock. `project.render` with `remember: true` saves the settings it used, for that preset only, once the render is accepted. `project.renderSettings(slug)` returns all three presets with defaults filled in.

**HTTP.** `POST /api/renders` passes `fps`, `size`, `quality` and `remember` through. `GET /api/reels/<reel>/render-settings` returns `{ settings }`.

**CLI.** `kinotta render` takes `--fps`, `--size`, `--quality` and `--audio`, and never sends `remember`.

## Steps

1. Tests first: `tests/core/render-settings.test.ts`, plus a footage-size test in `render-footage.test.ts`. See them fail.
2. `render.js` `--prores-profile`; runner passes it.
3. Settings module, core `render` and `renderSettings`, engine.
4. HTTP, CLI flags, web types, READMEs.

## Risks

- 4K renders are slow; the test renders a one-second page.
- The saved file could hold a value a later build drops; reading ignores unknown values and falls back to the default.

## Checks

- typecheck, full vitest. Playwright not run: the web types were left for T55, so no UI code changed.

## Changelog

- 2026-10-06: Plan written, In Progress.
- 2026-10-06: Done. Web client types deferred to T55. Summary: `docs/session-summaries/2026-10-05-render-settings-summary.md`.
