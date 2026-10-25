---
title: Portrait reels
date: 2026-10-18
status: Draft
summary: Build, review and render reels in a vertical 9:16 frame, starting with talking-head footage.
spec:
---

## Intent

- Problem: Every part of Kinotta assumes a 16:9 frame. A vertical talking-head video (a phone held
  upright) plays pillarboxed inside a 1920x1080 frame, and its b-roll is laid out for landscape, so
  there is no way to produce a vertical reel.
  - Pages are authored for a fixed 1920x1080 viewport: ADR 0001, `skill/kinotta/reference/contract.md`
    ("1920x1080. Lay out for that viewport"), and `PAGE_WIDTH` / `PAGE_HEIGHT` in
    `web/src/stage/_internal/page.ts`.
  - The editor frames everything at 16:9: `.still`, `.sheet`, `.sheet.with-alternates` and `.pk-video`
    in `web/src/styles.css`, and `.rv-frame` and `.native-shot-still` in `web/src/review/review.css`.
    DESIGN.md describes the Review player as "a 16:9 frame at 36vh".
  - The engine renders and checks at 1920x1080: `skill/kinotta/engine/render.js`, `engine/beats.js`, and
    `engine/build.py` (caption offsets), plus `engine-api.md` (`W:1920, H:1080`).
  - The server assembles parts on a 1920x1080 stage (`server/core/_internal/parts-assembler.ts`), and
    caption offsets are stored in pixels of a 1920x1080 page (`edit-model.ts`, `web/src/review/_internal/edited.ts`).
  - The viewer and compare templates are fixed at 16:9 (`skill/kinotta/templates/`).
  - Unverified: the render's `targetSize` (`server/core/_internal/render.ts`) already keeps the source's
    aspect ratio. Whether a portrait source therefore renders portrait today, or is composed over a
    landscape page, still needs checking.
- Why: Vertical short-form video (Reels, Shorts, TikTok) is a main destination for talking-head video.
- Proposed outcome: A reel can be portrait from start to finish. It is built in a vertical frame and
  reviewed, pinned, edited and saved in that frame, and it renders as a vertical video. Landscape reels
  and saved versions behave exactly as they do now.
- Affected: the page contract and ADR 0001, the Kinotta skill (`SKILL.md` section 5, `contract.md`,
  `engine-api.md`, `motion-broll.md`, the engine, `scripts/`, `templates/`), `web/src/stage`,
  `web/src/review`, `web/src/styles.css` and the Storyboard sheets, `server/core` (parts assembler,
  caption offsets, render), `kinotta check`, DESIGN.md, and the e2e and core tests that assert 1920x1080.
- Constraints:
  - Keep ADR 0001's timing contract: `seek(t)`, scene timing, and stable element names.
  - Existing reels and saved versions must open, edit and render unchanged (ADR 0003).
  - Keep one page format with no converter (ADR 0001's reasoning).
  - The shared sound mix is unaffected (ADR 0005).
  - The Review and Storyboard layouts must still read well with a tall frame. That is a DESIGN.md change
    and needs a mockup before code.
  - No new dependency without checking its licence, since Kinotta is going open source.
- Out of scope: Exporting one reel at several aspect ratios. Automatic face-tracking reframes.
- Decided (2026-10-18):
  - Where the frame is set (was question 3): each reel has a frame setting, labelled by ratio rather
    than by platform or template. It defaults to the footage's shape, so dropping in a vertical video
    gives a vertical reel without a prompt. The owner can override it. The setting belongs to the reel,
    not the project, so one project can hold a landscape cut and a vertical cut. Templates chosen at
    project start were rejected as unprofessional and too early.
  - Scope of sources (was question 1): this plan covers footage that is already vertical. Cropping
    landscape footage into a vertical reel is deferred to a later plan.
  - Code-only reels (was question 5): they use the same frame setting. Without footage, the default is
    16:9.
  - Ratios (was question 2): 16:9 (wide) and 9:16 (tall) only. The setting is designed so that 1:1 and
    4:5 can be added later without reworking it. They are out of scope here.
  - Changing the frame (was question 4): free until v1 exists, locked after that. A "Make a tall
    version" action starts a new reel from the same footage, which mirrors the duplicate-and-reframe
    workflow in Premiere, Final Cut Pro and Resolve. Evidence:
    `docs/research/2026-10-18-aspect-ratio-switching.md`.
  - Safe zones (was question 7): tall reels keep captions and graphics out of the areas that TikTok,
    Reels and Shorts cover with their own interface (the right-side buttons and the bottom caption and
    username strip). Review shows a faint guide of the safe area. The exact margins still need to be
    sourced from each platform's published specs.
  - Tall layout (was question 6): option A, the taller player in the same stack. Review keeps today's
    stack, but the tall player grows to about 55% of the viewport height and sits centred, with
    transport and full-width lanes below it. The Storyboard grid shows 5 tall stills per row instead
    of 3 wide ones. Wide and tall reels share one layout. If the lanes feel cramped, tune the player
    height rather than adding a second layout. Mockup: `docs/mockups/2026-10-18-portrait-layouts.html`.
- Open questions: none.

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-18
- Plan created with Intent only.
- Owner chose a frame setting on each reel that defaults to the footage's shape (options B and C), with
  vertical footage only for now. Questions 1, 3 and 5 are resolved.
- Owner chose 16:9 and 9:16 only (question 2 resolved).
- Researched how other editors and HyperFrames handle frame changes. Owner chose a frame that is free
  before v1 and locked after, with a "Make a tall version" action that starts a new reel (question 4
  resolved).
- Owner chose to keep captions and graphics out of the platform overlay areas on tall reels, with a
  safe-area guide in Review (question 7 resolved).
- Owner chose layout A from the mockup, the taller player in the same stack (question 6 resolved). All
  Intent questions are closed.
- Parked by the owner for later, uncommitted. Next: commit the Intent on its own branch from `main`,
  get approval, then write Goal, Approach and Steps.
