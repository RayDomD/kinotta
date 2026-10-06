---
title: Final and Overlay, and footage reels (T50)
date: 2026-10-05
status: Done
summary: A footage version renders as the footage cut by its own pieces with the overlay page piped on top; Overlay writes ProRes 4444 with alpha; code-only reels get Final and a transparent-only Overlay.
spec: docs/specs/2026-10-05-approve-and-render.md
---

## Intent

- Problem: only a Draft of a code-only page renders. A footage reel, which is most reels, can't become a file, and nothing makes a Final or an Overlay.
- Why: Final and Overlay are the deliverables (R2). The footage pipeline (R13, R18) is what makes a render match what Review plays.
- Proposed outcome: Draft, Final and Overlay render for footage and code-only reels. A footage render is the footage cut by the version's own pieces with the overlay page on top. Overlay is ProRes 4444 with alpha and no audio. `composite.py` is gone.
- Affected: `skill/kinotta/engine/render.js`, `server/core/_internal/runner.ts`, `render.ts`, `RenderRequest`, the core README, `skill/kinotta/scripts/composite.py` and the skill files that mention it.
- Constraints: R2, R9, R13, R18, E3. Pieces come from the version's plan resolver, never the reel's current plan. No ProRes intermediate for a Final. `render.js`'s default run stays the same. A failure leaves nothing.
- Out of scope: the gate (T51), the queue across processes and cancel (T52), the frame rate, size and quality settings (T53), parallel segments (T54).
- Open questions: None.

## Goal

`project.render` makes a Draft, Final or Overlay of any version. A footage Final's duration matches its pieces, its frame at a known time matches the page over the footage at the mapped source time, Smooth audio has no sample jump at a cut and Hard is a direct cut, and an Overlay is ProRes 4444 with alpha and no audio.

## Approach

**render.js.** Three more optional flags, none changing the default run:
- `--info` prints `{width, height, duration, alpha}` as one JSON line and exits without rendering.
- `--codec rgba` writes uncompressed RGBA frames in NUT, meant for a pipe.
- An output of `-` writes the video to stdout. Progress and the closing line then go to stderr.

With an explicit `--codec`, the background is cleared unless the codec is `h264`. A composed footage page is transparent through its CSS rather than the `alpha` class, so Overlay and the pipe need this.

**Runner.**
- `pageInfo(page)` runs `--info`.
- `probeFootage(file)` returns the size, the frame rate as ffprobe's fraction and whether there is audio.
- `renderOverFootage(job, onProgress)` starts `render.js` writing RGBA to stdout and ffmpeg reading it from stdin, and pipes one into the other. If either fails, it stops the other.
- `compositeArgs(...)` is a pure function that builds the ffmpeg command. Each piece is a `trim`/`atrim` of the footage. The pieces are joined with `concat`: video with hard cuts, and audio with 20 ms `afade`s on each side of every cut (Smooth) or none (Hard). The result is set to the frame rate and size, the overlay is put on top centred, and the output is H.264 with AAC.

**Core.** `RenderRequest` gains an optional `audio: 'smooth' | 'hard'` (default Smooth). It is the one setting R18's file names need here: a Hard render gets `-hardcuts`. T53 adds the other three settings and the saved defaults.

`render.ts` picks the pipeline:
- Code-only, Draft or Final: `renderPage` to MP4 at the page's size (half for Draft), 30 fps. Final is CRF 16 with blur.
- Code-only, Overlay: refused in `prepareRender` unless `pageInfo` says the page is transparent. Otherwise `renderPage` to ProRes `.mov`.
- Footage, Draft or Final: `renderOverFootage` with the version's `pieces` from `readVersion` (the resolver, so a plan-less version falls back), at the footage's size (half for Draft) and frame rate. The page is scaled by `deviceScaleFactor` to the target height.
- Footage, Overlay: `renderPage` to ProRes at the footage's size and rate, without the footage.

The name is `<reel>-v<n>-<preset>-<height>p<fps>[-hardcuts].<mp4|mov>`, where fps is the rate rounded to two decimals (`29.97`). A missing footage file fails the render with that reason.

**composite.py** is deleted, and `motion-broll.md`'s preview step points to `kinotta render`. T58 rewrites SKILL.md's render rule; this ticket only removes the file and its references.

## Steps

1. Tests (`tests/core/render-footage.test.ts`): a reel started from generated footage with a tone, one clip and one snip saved as v2.
   - Final duration equals the pieces.
   - A frame at a time after the snip matches the page screenshot composited over the footage at the mapped source time, within a mean-difference tolerance. It fails the same tolerance against the unmapped time.
   - Smooth audio is near zero at the cut, and Hard is near the source sample.
   - Overlay is ProRes 4444 with alpha and no audio.
   - No ProRes or other intermediate is left, and none is in `renders/` during the render.
   - A later snip and Save leaves a re-render of v2 the same.
   - A code-only Overlay is refused for an opaque page and made for a transparent one.

   Plus `render.js` tests for `--info`, `--codec rgba` to `-`, and the cleared background.
2. render.js flags.
3. Runner functions.
4. render.ts pipelines and names.
5. Remove composite.py and its references.

## Risks

- Piping RGBA through Node is about 1 MB a frame at 640x360 and 8 MB at 1080p, which is fine locally. A stall shows as a hung render, so both processes are killed together on any failure.
- AAC smears a hard discontinuity a little; the Hard test checks the sample's size, not exact equality.

## Checks to run

typecheck, full vitest, the full Playwright suite (`render.js` is shared with the engine e2e specs).

## Changelog

### 2026-10-05
- Plan created and built. Summary: `docs/session-summaries/2026-10-05-footage-render-summary.md`.
