# Grilling decisions, 2026-09-30

Input to `/to-spec`. Origin: the RoboNuggets guide *The 3 Levels of AI Motion Graphics* (one-shot,
storyboard, direct) and its video transcript. Kinotta is a clean-room build of the storyboard and
review loop shown there, not a copy of the RUBRIC tools. Glossary: `CONTEXT.md`.

| # | Decision |
|---|---|
| D1 | Each comment batch produces a new, frozen version. Comments stay on the version they were made on. |
| D2 | A click pins the exact element under the mouse ("change the color of this"). On footage, a pin records only a position. |
| D3 | One timeline with mixed clips: footage takes and scenes on V1, overlays such as b-roll on V2. A code-only reel is one with no footage. |
| D4 | Own repo, no HyperFrames dependency. Patterns are borrowed, with MIT notices wherever code is copied. |
| D5 | Each version is an HTML page under the timing contract (ADR 0001). |
| D6 | "Copy all comments" copies a pasteable list, as in the original, and also saves the batch to `vN/comments.json`. |
| D7 | Build order: Storyboard, then Review, then Picker. |
| D8 | Storyboard layout: a grid of every shot, where clicking a shot enlarges it for pinning. Mockup: [2026-09-30-storyboard-layout.html](mockups/2026-09-30-storyboard-layout.html), option A. |
| D9 | Storyboard stills are the live page paused at each shot's time, not screenshots (ADR 0001). |
| D10 | A local web app: a Node server plus a browser UI. The server logic stays independent of HTTP and the UI goes through one API client, so Electron can wrap it later. |
| D11 | React + TypeScript + Vite. |
| D12 | Taste list: one global list plus an optional per-project `reels/taste.md`. The editor suggests rules from repeated comments, and you approve them. |
| D13 | A global Claude skill invoked inside any project, with reels in `<project>/reels/` (ADR 0002). |
| D14 | On first use, Claude discovers the brand sources and writes `reels/brand.md` for you to check once. |

## Deferred

Audio comments, trimming, the MP4 render and the element library format belong to the Review and
Picker phases.

## Open for design

The visual identity. The candidate source is the Rubric brand reference
(`C:\FIles\projects\Brands\Rubric\DESIGN.md`). Editor surfaces are in operate mode.
