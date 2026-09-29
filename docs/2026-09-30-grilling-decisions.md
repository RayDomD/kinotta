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

## Visual world

Decided in a second grilling round with `ui-preview`. Composed mockup, which applies every row below:
[2026-09-30-editor-visual-world.html](mockups/2026-09-30-editor-visual-world.html). Source:
`C:\FIles\projects\Brands\Rubric\DESIGN.md` and `design-elements.html`. Editor surfaces are in
operate mode, used full screen.

| # | Decision |
|---|---|
| D15 | Rubric's structure is the editor's world: warm near-black ground, Outfit UI, Doto for the wordmark, shot numbers and timecodes, 0 radius, 7×7 pixel icons, the hex mark and hex cursor. No chrome-metal gradients anywhere. |
| D16 | The light is ice blue, `oklch(.84 .11 225)`, the Rubric neon core given chroma. It marks pins, the current version, the playhead, hover outlines and glows, and never fills a surface. The frame well stays neutral. |
| D17 | Stacked paper only on things in your hand: a hovered or focused shot, comment cards, the enlarged shot. The shell is flat ground with hairline dividers. |
| D18 | Pinning: the hex cursor with a centre hotspot dot over the frame, an ice-blue outline and name tag on the element under it, and numbered filled hexes as pins, matching the comment list. |
| D19 | Motion keeps Rubric's speeds: lift 380ms, shadow 180ms, colour 250ms, press 120ms, one curve `cubic-bezier(.2,.8,.2,1)`. This deliberately overrides CRAFT.md's near-zero operate budget. Scrubbing, frame-stepping and keyboard navigation never animate, and reduced motion drops chrome transitions to 0. |
| D20 | No WebGL hex fluid. The dot-matrix terrain is the only texture, used in empty lanes and empty states. |
| D21 | Dark only. |
| D22 | Under the storyboard grid: three lanes (Shots, Pins, Overlays) on one shared time axis. Shot width is its duration. Storyboard pins sit at their shot's start time, side by side. Overlays are drawn at their real span, and an empty lane shows "None" over dot terrain. |

## Deferred

Audio comments, trimming, the MP4 render and the element library format belong to the Review and
Picker phases.
