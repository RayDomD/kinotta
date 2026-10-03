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
| D23 | Finish-review follow-ups, chosen in a `ui-preview` round after T17. North Star stays "The Light Table". Colour names in `DESIGN.md` use the Cutting bench set (Table, Gate, Slate, Slate Lifted, Title, Caption, Credits, Splice, Frame Line, Tally, Leader, Scrim); CSS token keys are unchanged. Mockup: [2026-09-30-finish-review-decisions.html](mockups/2026-09-30-finish-review-decisions.html). |
| D24 | After a copy, the Copy button becomes a lit "Sent" button (Tally outline, hex, time) that asks "Copy again?" on hover or focus, and returns to "Copy comments N" when the comments change. Review and Picker stay visible and inactive. |
| D25 | The enlarged shot stays a modal sheet. Pins become a small anchor hex at the exact spot plus a numbered comment tag placed outside the element; grid stills show the tag's number at a readable size. |
| D26 | Short reels keep their layout. A long contract issue list collapses to one line (count and first issue) with "Show all"; the batch still includes every issue. |

## Footage reels

Decided in a third grilling round on long talking videos filled with b-roll. Terms Section and
Transcript are in `CONTEXT.md`, and the shared format is in ADR 0001.

| # | Decision |
|---|---|
| F1 | Short code-only reels and long b-roll videos matter equally. Storyboard stays first and handles both. |
| F2 | A long reel splits into sections of a few minutes, chosen by topic from the transcript. The grid shows one section at a time, and the lanes show the whole reel. |
| F3 | Comment batches are handed off per section. Claude rebuilds only that section, producing a new version of the whole reel with other sections carried over unchanged. |
| F4 | Unsent comments on sections the new version left unchanged move forward to it. Only a handed-off batch freezes. |
| F5 | The transcript is saved with the reel and shown in Kinotta. A pin can land on a spoken word. |
| F6 | motion-broll is the planner for footage reels: density, cutaway or panel or nothing, and word-timed changes. Each planned clip becomes a storyboard shot. |
| F7 | One shared format: the timing contract uses motion-broll's global `seek(t)`, and motion-broll's engine adds Kinotta's element names and scene timing (ADR 0001). |
| F8 | A storyboard still for a panel clip is drawn over the real footage frame at that moment. A cutaway shows alone. The spoken line sits under each shot. |
| F9 | Footage storyboards are in the Storyboard phase. Playback over footage stays in Review. |
| F10 | Section list and transcript line, chosen in a `ui-preview` round (T10, #12): sections are a list in the left rail above Versions, one row per section with its number, name, time span, shot count, pin count and a Waiting mark. The heading over the grid names the current section. Each grid shot shows its spoken line in quotes between the title and the description. The enlarged shot has a word row under the frame with the shot's words at full ink and a few muted context words either side. Hovering a word outlines it and puts a tag below it with the word and its time, and a word pin is a numbered hex above the word. Mockup: [2026-09-30-sections-transcript.html](mockups/2026-09-30-sections-transcript.html), option A. |

## Kinotta skill

Decided in a fourth grilling round, 2026-10-03, on T9 (#11), the skill for code-only reels. Terms
Brand file and Storyboard were sharpened in `CONTEXT.md`.

| # | Decision |
|---|---|
| K1 | The skill's source lives in this repo at `skill/kinotta/` and is linked into `~/.agents/skills/kinotta`, so the skill and the contract checks change in one commit. |
| K2 | The test sample reels are the skill's examples of the format only, labelled "contract, not look". The skill links to them in the repo and doesn't copy them. The look comes from the brand file and the taste lists. |
| K3 | `reels/brand.md` carries `checked: no` or a date. On first use Claude writes it, summarises it in chat and stops without building. A run that finds `checked: no` asks instead of building. |
| K4 | The brand file points at the project's sources and never copies their values. `DESIGN.md` is always the source for colour and type. The file holds the owner's answers only where the project has no source. |
| K5 | A project with no `DESIGN.md`, or an empty one, stops before the brand file and suggests `/impeccable init` and `/impeccable document`. "Proceed without" puts the owner's answers into `brand.md`, marked as standing in for a missing `DESIGN.md`. |
| K6 | Claude answers each comment of a batch in `v<n+1>/answers.md` (done, partly done or not done, with a reason) and repeats the list in chat. The editor ignores the file in this phase. |
| K7 | A `kinotta check <reel> [version]` command prints the version's static contract issues and exits non-zero when there are any. Claude runs it before telling the owner a version is ready. Runtime problems still surface in the editor. |
| K8 | Install: `npm link` puts `kinotta` on the PATH, and a junction links `skill/kinotta` into the skills folder, both documented in the README. A skill run that can't find `kinotta` stops and names the command to run. |
| K9 | Every version stays an unanimated storyboard until the Review phase. A request to animate is met with a warning that Kinotta can't review motion yet. The version rail's v1 "storyboard" label stays until Review. |
| K10 | The real run is a code-only brand intro of about 15 seconds and 5 to 7 shots in Aroma. |
| K11 | `~/.kinotta/taste.md` starts with these rules, and grows by hand: never system-ui as the only typeface; no pure `#000` or `#fff` surfaces; tight leading (1.0 to 1.1) on display type; no em dashes in on-screen copy; no arbitrary purple-to-blue gradients; no neon glows as decoration; text contrast of at least 4.5:1; one idea per shot; hold text long enough to read before a cut. `reels/taste.md` stays optional per project. |
| K12 | The owner runs `kinotta`; Claude never starts it. Claude builds `v<n+1>` as a copy of `v<n>`, writes `shots.json` last (the editor's new-version signal), and never edits `v<n>`. |
| K13 | Exception to K9 for footage reels (decided 2026-10-03, recorded with T23): footage versions carry the motion engine's real animation. Kinotta shows their stills until the Review phase plays them. |
| K14 | No plan approval in chat when building a footage reel for Kinotta (decided 2026-10-03, recorded with T23): v1 is the plan, and the owner answers it with comments in Kinotta. |
| K15 | A clip that changes state gets one storyboard shot per state (`05a`, `05b`, …), more for longer clips; short clips keep one. The enlarged shot shows a strip of the clip's states under the frame, and clicking one opens it. Chosen in a `ui-preview` round on 2026-10-04 (B, then Y over states above the frame). Mockup: [2026-10-04-stills-per-clip.html](mockups/2026-10-04-stills-per-clip.html). Not built yet. |

## Deferred

Audio comments, trimming, the MP4 render and the element library format belong to the Review and
Picker phases.

- **Color grading (Review phase).** Candidate: the video-use skill (`browser-use/video-use`, MIT),
  which grades per footage segment with ffmpeg filter chains on an ASC CDL model and records the
  grade in its `edl.json`. The same approach as motion-broll: video-use owns cuts, grade and
  subtitles, Kinotta adds the review loop, and they share one format. Other options to weigh
  then: ffmpeg `lut3d` with `.cube` LUTs (a round trip with DaVinci Resolve), a live WebGL LUT
  preview (three.js `LUTCubeLoader` and `LUTPass`, unverified), and OpenColorIO for log or ACES
  footage. Questions still to grill: a preview render or a live shader, CDL numbers or LUT files,
  and a grade per clip or per section.
- **Rendering at scale.** An hour of b-roll is hundreds of clips, and motion-broll renders slower
  than real time. The render phase needs a queue and partial renders.
- **Section boundaries.** Claude picks them. You ask for a change in a reel note.
