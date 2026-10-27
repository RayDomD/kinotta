---
title: Caption font and background
date: 2026-10-27
status: Done
summary: The agent can set a reel's caption font and background from a comment, instead of the fixed Geist 50px on a dark box.
spec:
---

## Intent

- Problem: Caption font and background are fixed. `CAPTION_CSS` in `skill/kinotta/engine/build.py` (about lines 80-88) sets `600 50px Geist` and a phrase box of `rgba(11,11,11,.72)` with a 10px radius. The plan's `captions` only accepts `look` (highlight, phrase, words, off) and `color` (the lit word). A comment asking for another caption font cannot be answered.
- Why: Caption styling is one of the first things an owner asks to change.
- Proposed outcome: The plan's `captions` gains `font` and `background`. When absent, captions look exactly as today. The agent sets them in answer to a comment; the editor preview and render both show them.
- Affected: `skill/kinotta/engine/build.py`, `skill/kinotta/reference/contract.md` (captions fields), `web/src/review/_internal/MediaEditor.tsx:351`, `web/src/SimpleTimeline.tsx:324`, caption engine and editor tests.
- Constraints: Opt-in per reel (no enforced style). Old plans and frozen versions render unchanged. Fonts must be ones the project has or the brand names, with redistribution rights checked for anything bundled.
- Out of scope: Editor controls for caption font and background (owner chose agent-only on 2026-10-27), caption position, and per-word styling beyond `color`.
- Open questions:
  - O1: What does `background` accept: a colour and opacity only, or also `none` and a radius? Resolved 2026-10-27, owner approved: colour (with alpha) or `none`.

## Goal

1. A plan with `captions.font` and `captions.background` renders captions in that font and background, in the editor preview and in renders.
2. A plan without them renders exactly as today.
3. `kinotta check` rejects an unknown font or a malformed background with a clear message.

## Approach

`captions` gains `font` (a family name the project or brand provides, with optional `weight` and `size`) and `background` (a CSS colour with alpha, or `"none"`). `caption_style` in `build.py` reads them, and the caption layer gets CSS variables (`--cap-font`, `--cap-bg`) with today's values as fallbacks, so `CAPTION_CSS` only swaps its literals for `var(...)`, including the `words` look's per-word box. The editor's caption preview (`MediaEditor.tsx:351`) and the Simple timeline read the same fields. `contract.md` documents them, and the skill's comment guidance says to answer "change the caption font" by setting them.

## Steps

1. [x] Engine tests (red): the default plan's caption CSS is unchanged; font and background applied; `none` removes the box in every look; bad values rejected.
2. [x] `build.py` variables and validation.
3. [x] Editor preview reads the fields; editor render test.
4. [x] `contract.md` and skill comment guidance.

## Risks

- A font missing from the project would silently fall back: validate it at check time.
- The `words` look has its own per-word box; it must use the same background variable.

## Checks to run

- Caption engine tests and the editor render test.
- One render of a sample reel with a custom font, viewed.
- `npm run typecheck`.

## Result

Shipped (2026-10-27):

- `captions.font` (a family name, or `{ family, weight?, size? }`) and `captions.background` (a CSS colour, alpha allowed, or `"none"`) in the plan. `build.py` writes them on each caption as `--cap-font` and `--cap-bg`; `CAPTION_CSS` reads them with today's values as fallbacks, in the phrase box and the `words` look's per-word box. A plan without them builds the identical page.
- Validation, mirrored in `pieces.py` (`check_caption_style`, also run by `build.py`) and `edit-model.ts` (`checkCaptionStyle`): the font family must be Geist or a family in the plan's `brand.fonts` (the only fonts a render embeds), weight 1 to 1000, size 1 to 300 px, and the background a hex or rgb/hsl colour or `none`. Anything else stops with a readable message.
- Editor preview: `MediaEditor.tsx` passes `font` (via the shared `captionFontCss`) and `background` in `captionPreview`; `PagePlayer.tsx` sets `--cap-font` and `--cap-bg` like `--cap-color`.
- Saved edit lists replay the same: `withCaptions` keeps both fields through caption moves (tested).
- Docs: `skill/kinotta/reference/engine-api.md`, `stages/footage-reel.md` and `stages/04-next-version.md` (comment guidance: answer "change the caption font" with `captions.font`).

Deviations:

- Documented in `engine-api.md`, `footage-reel.md` and `04-next-version.md`, not `contract.md`, which does not mention captions (brief's note).
- `SimpleTimeline.tsx:324` was not changed: it reads only `look: off`, so there was nothing to read there.
- "kinotta check rejects": the refusal happens where the plan is read and built (engine `check_plan_parts` and `caption_style`, server `checkPlanParts`), not in `versionIssues`, which has no brand data. `kinotta check` on a built version cannot hold a bad value because the build refuses it.
- `font` also accepts a bare string as shorthand for a family; the plan only said "a family name with optional weight and size".

Checks run:

- Caption engine tests (`tests/engine/captions.test.ts`, `tests/engine/media-model.test.ts`) and core (`tests/core/media-model.test.ts`): pass. Written red first (6 failures), then green.
- Editor render test (`tests/e2e/optimistic-edits.spec.ts`, "the editor preview draws captions in the plan's font and background"): 1 passed.
- Sample render viewed (default; Geist 800 72px with no box; brand serif 64px on orange in the `words` look): all three drew as set.
- `npm run typecheck`: clean. `npm run check:docs`: `check:docs ok`.
- `npx vitest run --project unit`: `Test Files 1 failed | 115 passed | 1 skipped (117)`, `Tests 3 failed | 1169 passed | 3 skipped (1175)`. The 3 failures are `tests/engine/sound-skill.test.ts` "applies generated score operations with missing / existing / partial tracks": `ImportError: cannot import name '_ccallback_c' from 'scipy._lib'` (a pip numpy 2.5.3 shadows the apt scipy 1.11.4 here). Not caused by this change.
- Full e2e (`npx playwright test`): `24 failed, 3 did not run, 171 passed (9.8m)`. Failures: `agent-confirm` (3), `agent-strip` (9), `direction` "Direct: your own font and music...", `pinned-effects` "frame drops make instant Working output...", `playback-stutter` "uncut clip plays smoothly...", `review` "playback follows the pieces and skips a snipped stretch", `simple-mode` (pins, hover feedback, agent timers, "Simple is the default", e.g. `expect(heading "Product showreel").toBeVisible()` failed). Re-run of the same specs alone: `19 failed, 25 passed`. The same specs on unmodified `origin/main` (agent-confirm, agent-strip, simple-mode, playback-stutter): `21 failed, 13 passed`. So these failures predate this change; the cause is the environment (no faster-whisper, no agent tooling).
- `docs/plans/index.html` not regenerated: `pwsh` is not installed.

Out of scope, not done: editor controls for font and background, caption position, per-word styling.

## Changelog

### 2026-10-27
- Plan created with Intent only. Owner chose agent-only (set from comments) on 2026-10-27.
- Owner approved the Intent and its recommended answers; Goal, Approach, Steps, Risks and Checks written. Status Approved.
- Built; Result recorded. Status Done.
