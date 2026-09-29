# Spec: Storyboard phase

Plan: `docs/plans/2026-09-30-storyboard-phase.md`. Glossary: `CONTEXT.md`. Decisions: `docs/2026-09-30-grilling-decisions.md` (D1 to D22, F1 to F9) and the plan's S1 to S8. ADRs: 0001 (timing contract), 0002 (invoked inside projects).

![Storyboard, v2](../images/01-storyboard.png)

## Problem Statement

When Claude builds a storyboard for a reel, the only way to give feedback is to type prose into the terminal: "the orange word in the third shot should hold longer". Nothing ties a comment to a shot, a moment or an element, so Claude has to guess what "the orange word" means, and a vague comment costs a whole rebuild. Nothing keeps a record of what was asked for each round either, so there is no history of how a reel got to where it is. Each storyboard is also built from whatever brand sources Claude happens to find that day, so two runs can disagree about the logo.

The same problem is worse on long footage. Filling an hour-long talking video with motion-graphic b-roll means a few hundred planned clips, each tied to a spoken line. Reviewing that plan in chat is impossible: there's no way to see a clip against the frame it sits on or the words it covers, and one giant feedback round would arrive only after hours of review.

## Solution

Kinotta is a local editor you open inside any project that has reels. It shows the newest storyboard version of a reel as a grid of every shot. Each still is the real page paused at that shot's time. You click a shot to enlarge it, hover over the frame to see which named element a click will land on, and click to pin a comment to it. When you're done, one button copies the whole comment batch as pasteable text and saves it next to the version. You paste it into Claude, and Claude builds the next version as a new frozen folder. The editor notices the new version and offers to open it. The Kinotta skill gives Claude the rules for all of this: how to write a storyboard version under the timing contract, how to record the project's brand sources once in a brand file, and how to read your taste list before each build.

Footage reels work the same way at a larger scale. Claude transcribes the video once and plans the b-roll with motion-broll's rules. It splits the reel into sections of a few minutes, by topic, and each planned clip becomes a shot. A panel clip's still is drawn over the real video frame at that moment, and every shot shows the line it covers. You review one section at a time and hand off one section's batch while you carry on with the next. Claude rebuilds only that section, and your unsent comments on the other sections move forward to the new version.

![Pinning an element](../images/03-pin-hover.png)

## User Stories

### Opening a project

1. As the owner, I want to start the editor from inside a project folder, so that it opens that project's reels without any setup.
2. As the owner, I want the editor to list every reel in the project's reels folder, so that I can pick the one I'm working on.
3. As the owner, I want the editor to open the most recently changed reel by default, so that I land where I left off.
4. As the owner, I want to be told plainly when the project has no reels folder or no reels yet, so that I know to ask Claude for one rather than suspect the editor.
5. As the owner, I want the editor to never copy or store my client's assets, so that the project stays the only source of truth (ADR 0002).

### Seeing a storyboard

6. As the owner, I want to see every shot of the storyboard in a grid, so that I can judge the whole plan at a glance (D8).
7. As the owner, I want each shot's still to be the live version page paused at that shot's time, so that what I pin on is the real thing, not a screenshot (D9).
8. As the owner, I want each shot to show its number, title, start time and description, so that I can read the plan like a shot list.
9. As the owner, I want shot numbers and timecodes set in the dot-matrix face with tabular figures, so that times line up and scan quickly.
10. As the owner, I want to see how many pins each shot has, so that I can spot where my feedback is concentrated.
11. As the owner, I want a shot to lift into stacked paper when I hover or focus it, so that I know what a click will open (D17).
12. As the owner, I want a Shots lane under the grid where each shot's width is its duration, so that I can see the pacing of the reel (D22).
13. As the owner, I want a Pins lane on the same time axis showing each pin at its shot's start, so that I can see where in time my feedback sits.
14. As the owner, I want an Overlays lane on the same axis that shows overlays at their real span, or "None" over dot terrain when there are none, so that the lane never looks broken.
15. As the owner, I want to click a shot segment or a pin in the lanes to open that shot, so that the lanes are navigation as well as a summary.
16. As the owner, I want the total duration and shot count in view, so that I know the reel's shape without counting.

### Enlarging and pinning

17. As the owner, I want to click a shot to open it large in the stacked-paper sheet, so that I can pin precisely.
18. As the owner, I want to step to the previous or next shot with the arrow keys while enlarged, so that I can review shot by shot without closing.
19. As the owner, I want Esc and a Close button to return me to the grid, so that leaving is obvious.
20. As the owner, I want the hex cursor with a centre dot over the frame, so that I know exactly which point a click will record (D18).
21. As the owner, I want the element under the cursor outlined in ice blue with its name in a tag, so that I know what a click will pin before I click (D18).
22. As the owner, I want the name tag to never cover the reel's content, so that I can still judge the frame while aiming.
23. As the owner, I want a click to create a pin recording the version, shot, time, position on the frame and element name, so that Claude gets an unambiguous target (D2).
24. As the owner, I want to type the comment right after placing a pin, so that pinning and writing are one motion.
25. As the owner, I want pins shown as numbered filled hexes on the frame, the stills and the lanes, matching the numbers in the comment list, so that I can connect them at a glance.
26. As the owner, I want to cancel a pin before I've typed anything, so that a stray click leaves no empty comment.
27. As the owner, I want a pin on a spot with no named element to record only the position, so that I can still comment on backgrounds and gaps (D2, S5).

### Managing comments

28. As the owner, I want all comments on the current version in a side panel as stacked-paper cards, each with number, shot, time and element, so that I can review my feedback before sending it.
29. As the owner, I want to click a comment to open its shot with the pin highlighted, so that I can check what I meant.
30. As the owner, I want to edit a comment's text, so that I can fix a typo or sharpen it (S7).
31. As the owner, I want to delete a comment and its pin, so that I can drop a mistake (S7).
32. As the owner, I want to write a note on the whole reel, so that feedback with no single moment still reaches Claude.
33. As the owner, I want comments saved as I go, so that closing the browser loses nothing.
34. As the owner, I want an empty comments panel to tell me how to pin, so that a first visit is self-explanatory.

### Handing off to Claude

35. As the owner, I want "Copy all comments" to put the batch for the section I'm in (the whole reel when it has one section), notes included, on my clipboard as pasteable text, so that one paste gives Claude everything it needs for that section (D6, F3).
36. As the owner, I want the same batch saved in the version's folder as structured data, so that Claude can read the exact pins and not only prose (D6).
37. As the owner, I want the pasteable text to name each comment's shot, time and element, so that it reads correctly even without the saved file.
38. As the owner, I want the button to show how many comments are in the batch and confirm the copy, so that I know it worked.
39. As the owner, I want to keep commenting after copying and copy again, overwriting the saved batch, so that a forgotten comment isn't lost (S7).
40. As the owner, I want copying with no comments to be impossible or clearly empty, so that I never hand Claude a blank batch by accident.

### Versions

41. As the owner, I want every version of the reel listed, marked storyboard or later, with the newest highlighted in ice blue, so that I always know which version is on screen (D16).
42. As the owner, I want to open an older version and see its shots and comments, so that I can check history.
43. As the owner, I want older versions to be read-only, with a line saying so, so that I can't add feedback Claude will never see (S6).
44. As the owner, I want a new version to appear in the list with a "ready" notice while I'm working, so that I know Claude has finished (S4).
45. As the owner, I want to open the new version with one click and never be switched to it automatically, so that I'm not pulled away mid-look (S4).
46. As the owner, I want a handed-off batch to freeze on its version the moment a newer version exists, so that history stays exactly what was asked (D1, S7, F4).
### Broken versions

47. As the owner, I want a version that breaks the timing contract to open anyway, so that I can still review whatever works (S5).
48. As the owner, I want a clear list of what's broken, such as "shot 04: no named elements" or "page cannot jump to a time", so that I can tell Claude exactly what to fix.
49. As the owner, I want shots that can't be shown to render as an explicit placeholder with the reason, so that a missing still never looks like a black frame in the reel.
50. As the owner, I want the list of broken rules included in my copied batch on request, so that fixing the format is part of the same hand-off.

### Claude's side (the Kinotta skill)

51. As the owner, I want to ask Claude for a storyboard in any project and have it write version 1 under the timing contract, so that the editor can open it without changes (S1, D5).
52. As the owner, I want every storyboard version to carry a shot list with number, start time, title and description per shot, so that the grid has what it needs.
53. As the owner, I want every element Claude builds to carry a stable name that survives between versions, so that "the headline" means the same thing in v2 and v3.
54. As the owner, I want Claude to build each scene in its final look but unanimated, so that the storyboard judges look and framing before motion.
55. As the owner, I want Claude, on first use in a project, to find the logo, colours and fonts and write them to the brand file for me to check once, so that storyboards are on-brand from the first run (S2, D14).
56. As the owner, I want Claude to read the brand file on later runs instead of re-scanning, so that two runs can't pick different logos.
57. As the owner, I want Claude to read my global taste list and the project's taste file before each build, so that my standing rules apply to every reel (S3, D12).
58. As the owner, I want Claude, given a batch, to read the saved structured batch and write a new version folder, never touching the old one, so that versions stay frozen (D1).
59. As the owner, I want Claude to answer each comment in its summary of the new version, so that I can see what was changed and what wasn't.

### Look, feel and access

60. As the owner, I want the editor chrome to carry no hue except the ice-blue light, and the frame surround to stay neutral, so that the chrome never tints my judgment of the reel (D15, D16).
61. As the owner, I want the reel to play and render exactly as authored, so that what I judge is what ships.
62. As the owner, I want Rubric's motion speeds on the chrome but none on scrubbing, stepping or keyboard navigation, so that the editor feels crafted without slowing me down (D19).
63. As the owner, I want every control reachable and operable by keyboard with a visible focus state, so that the editor meets WCAG AA.
64. As the owner, I want reduced motion to drop all chrome transitions to zero, so that the editor respects my system setting.
65. As the owner, I want every state (current version, pinned, broken, read-only) signalled by shape or text as well as colour, so that nothing relies on the ice blue alone.
66. As the owner, I want the Review and Picker phases visible in the top bar but inactive, so that I can see where the product is going without dead links.

### Footage reels and sections

67. As the owner, I want to ask Claude for a b-roll reel on a video in my project, with or without an SRT, so that one request starts the whole plan (F6).
68. As the owner, I want Claude to transcribe the video once and save the transcript with the reel, so that planning and review use the same words (F5).
69. As the owner, I want Claude to plan b-roll with motion-broll's rules, meaning density, cutaway or panel or nothing, and changes timed to words, so that there is one planning rulebook (F6).
70. As the owner, I want a long reel split into named sections of a few minutes each, chosen by topic, so that I can review an hour one part at a time (F2).
71. As the owner, I want to switch between sections from a list that shows each section's name, time span, shot count and pin count, so that I can see where my review stands.
72. As the owner, I want the grid to show one section's shots at a time, so that the grid stays readable at any reel length (F2).
73. As the owner, I want the lanes to span the whole reel with section bands and the current section highlighted, so that I keep the shape of the hour in view (F2, D22).
74. As the owner, I want each shot of a footage reel to show its type (cutaway or panel) and the spoken line it covers, so that I judge each clip against its words (F8).
75. As the owner, I want a panel clip's still drawn over the real footage frame at its moment, and a cutaway shown alone, so that I can see whether a panel clears the speaker (F8).
76. As the owner, I want the transcript line under each enlarged shot with its words selectable, so that I can pin a comment to a word, like "cut away on 'deploy', not before" (F5).
77. As the owner, I want a word pin to record the word and its time, so that Claude can retime a clip exactly.
78. As the owner, I want a click on the footage part of a still to record only a position, so that I can comment on the video under a panel (D2).
79. As the owner, I want to hand off one section's batch while I keep reviewing other sections on the same version, so that Claude fixes early sections while I work (F3).
80. As the owner, I want Claude, given a section batch, to rebuild only that section and carry every other section over unchanged, so that a small batch never disturbs finished work (F3).
81. As the owner, I want the version list to show which sections each version changed, so that I can see what moved between versions.
82. As the owner, I want sections that have a batch with Claude marked as waiting, so that I don't comment on a section that's about to change.
83. As the owner, I want to ask for different section boundaries in a reel note, so that a bad split is fixable without new tools.
84. As the owner, I want a clip built by motion-broll to open in Kinotta without conversion, so that the two tools never drift apart (F7).
85. As the owner, I want my unsent comments on sections the new version left unchanged to move forward to it automatically, so that I never re-pin work because Claude finished another section (F4).

## Implementation Decisions

### Modules

- **Reels core (server, no HTTP).** The deep module that holds almost all behaviour. It opens a project directory and exposes reels, versions, shot lists, contract checks, comments and batches. Its interface, in words:
  - open a project by path, and list its reels with their newest version and last change;
  - list a reel's versions in order, each marked newest or frozen;
  - read a version: its sections, shot list, overlays, the reel's transcript and footage reference, which sections this version changed, and a static contract report;
  - add, edit and delete comments (frame pins and word pins) and the reel note on a version, refused with a clear error on any version that isn't the newest;
  - produce a batch for one section, or the whole reel when it has one section: write the structured batch file into the version folder, mark the section as waiting, and return the pasteable text;
  - on a new version, freeze handed-off batches and move unsent comments on unchanged sections forward to it;
  - subscribe to changes: an event when a new version folder appears or a comment file changes on disk.
- **HTTP layer (server).** Thin routes over the core, plus a server-sent event stream for change events. It also serves each version's files from the project's reels folder on the same origin as the UI, which the stage needs in order to reach into the page. It holds no logic of its own (D10).
- **API client (UI).** The single module through which the UI talks to the server, so that Electron can later swap the transport (D10).
- **Stage (UI).** The only module that touches a version page. It loads a version in a same-origin frame, waits for the page to be ready, jumps it to a given second, and reports the named element and frame position under a point. It also reports runtime contract failures, such as a missing jump function or a jump that throws. For a panel clip on a footage reel it draws the clip over the footage frame at the same second, and tells a click on the clip apart from a click on the footage. The grid stills and the enlarged sheet both use it.
- **Storyboard UI (React).** Section list, grid, lanes, enlarge sheet with transcript line, comments panel, version rail and top bar, built to `docs/mockups/2026-09-30-editor-visual-world.html` and D15 to D22. The section list and the transcript line have no mockup yet, so they are designed inside the established world before they're built.
- **Launcher.** A `kinotta` command run inside a project that starts the server against that project's reels folder and prints the local URL.
- **Kinotta skill (Claude side).** The rules Claude follows: the timing contract, the version folder layout, brand file creation and use, taste list reading, and how to consume a section batch. For footage reels it adds transcription (the owner's SRT, or a local transcription), section splitting by topic, and planning through motion-broll.
- **motion-broll engine change.** motion-broll's engine gains Kinotta's element names and scene timing markup, so that every clip it builds is a valid scene under the shared contract (F7). The change lives in the motion-broll skill, not in this repo.

### Timing contract, made concrete (ADR 0001)

- Each scene carries its start time and length as markup attributes.
- Each element a click may land on carries a stable name attribute, unique within its scene and stable across versions.
- The page exposes a global `seek(seconds)` that resolves once that frame is drawn. The name is motion-broll's, so both tools share one format (F7).
- The page must render deterministically for a given second: no wall-clock time and no unseeded randomness.

### Files on disk

- The reels folder holds the brand file, an optional project taste file, and one folder per reel.
- Each reel folder holds numbered version folders. The highest number is the newest version.
- A footage reel also holds its transcript (timed words) and a reference to its footage file, which stays where it is in the project (ADR 0002).
- Each version folder holds the page, its shot list, and a structured batch file for each section handed off. The shot list gives each shot a number, start time, title and description, and on a footage reel also its section, its type (cutaway or panel) and the transcript span it covers. It lists the reel's sections (name and time span) and optional overlays, and names the sections this version changed.
- The global taste list lives in the user's home directory under a Kinotta folder, outside any project.
- The editor writes only the structured batch into version folders. Everything else in the reels folder is Claude's.

### Pins and batches

- A frame pin records the version, section, shot number, time in seconds, x and y as fractions of the frame, and the element name or none. A click on footage records no element.
- A word pin records the version, section, shot number, and the word with its time from the transcript.
- A comment is a pin plus text. A note is text on the reel with no pin.
- Storyboard pins take their shot's start time, since the still is that moment (D9).
- A batch covers one section. On a reel with one section it covers the whole reel, as before.
- The pasteable text lists the reel, version and section, then each comment numbered as "shot, time, element or word: text", then notes, then any contract issues the owner chose to include. It says where the structured file was saved.

### Behaviour

- Only the newest version accepts comment changes. The core enforces this, not only the UI (S6).
- Copying locks nothing. A later copy overwrites that section's saved batch until a newer version exists (S7).
- When a newer version appears, handed-off batches freeze on the old version. Unsent comments on sections the newer version did not change move forward to it, and unsent comments on changed sections stay on the old version and are listed as not carried (F4).
- Sections with a handed-off batch show as waiting until a newer version changes them.
- The grid shows one section at a time. The lanes always span the whole reel.
- On a new version event the UI shows a "ready" notice and never navigates on its own (S4).
- Contract failures are collected from the static checks in the core and the runtime checks in the stage, and shown as one list. The affected shots render as labelled placeholders (S5).
- Stills are live frames. The stage loads them lazily as shots enter the viewport, so a long storyboard stays responsive.
- The element name tag positions itself outside the hovered element and flips to avoid covering content or leaving the frame.

### Visual system

- Built to D15 to D22 and the approved mockup: warm near-black ground, Outfit UI, Doto numbers and timecodes, 0 radius, the ice-blue light for pins and current state only, stacked paper only on things in hand, the hex cursor and pins, dot terrain as the only texture, dark only, and Rubric motion speeds with no motion on scrubbing or keyboard steps.
- `DESIGN.md` is written from the built Storyboard at the end of the phase, not before.

## Testing Decisions

- A good test drives a module only through its public interface and asserts on what a user or Claude would observe: files on disk, returned data, pasteable text, events and rendered results. Tests never assert on internal state or component structure.
- **Core tests (the main seam).** They run the reels core against sample reels folders created in a temp directory per test. They cover listing reels and versions, newest-version detection, shot list reading, static contract checks on good and broken samples, comment add, edit and delete, refusal on frozen versions, batch file writing and pasteable text, re-copy overwrite, and change events when a version folder appears. For footage reels they also cover sections and transcript reading, word pins, per-section batches, the waiting mark, and carrying unsent comments forward only for unchanged sections. They are fast, with no browser.
- **One end-to-end browser test.** It drives the full app against a sample project with a contract-following storyboard version and a broken one. It opens the storyboard, checks the stills render from the live page, enlarges a shot, hovers and clicks a named element, types a comment, checks the pin names that element, copies the batch, and checks the batch file and the clipboard text. It also checks that the broken version opens with its issue list. A second sample, a short footage reel with two sections and one motion-broll panel clip, checks that the panel still shows over the footage frame, that a word pin records its word, and that a section batch copies only that section. This is the only proof that a click resolves to the right element.
- No component-level tests. The browser test covers the UI through behaviour.
- Prior art: none. The repo is greenfield, so these tests set the pattern for the Review phase.

## Out of Scope

- The Review phase: animated playback over footage, scrubbing, the footage track of takes, and pins on playing footage. Storyboard stills over a single footage frame are in scope (F8).
- Color grading, which is planned for Review with the video-use skill as the candidate.
- Rendering many clips at once. That needs a render queue and belongs with the MP4 render.
- The Picker phase and the element library format.
- Approval and the MP4 render.
- Audio comments and trimming.
- Taste rule suggestions from repeated comments. The taste list is hand-edited in this phase (S3).
- A light theme, multiple users, sharing, accounts, and Electron packaging.

## Further Notes

- The stills require the version page and the UI to share an origin so that the stage can reach elements inside the page. The pages are Claude-written files from the owner's own projects, run locally for a single user, so this trust level is accepted. It should be revisited before Kinotta is ever shared.
- Many live frames on one grid may be heavy for long reels. Lazy loading is the first mitigation. If a 14-shot storyboard is still slow, measure before changing approach, since D9 rules out screenshots as the answer.
- Sections keep long reels workable: the grid only ever holds one section, so live-frame cost scales with section length, not reel length.
- Section boundaries are Claude's call. You ask for a change in a reel note (Deferred, grilling log).
- The sample reels used in tests double as the reference examples in the Kinotta skill, so Claude and the tests agree on the format.
- Screenshots: `docs/images/01-storyboard.png` to `06-lanes-empty.png`, captured from the approved mockup. The demo reel in them is synthetic.
