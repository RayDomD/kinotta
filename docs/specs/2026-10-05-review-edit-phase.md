# Spec: Review and Edit phase

Intent and plan: `docs/plans/2026-10-04-direct-edits.md`. Decisions E1 to E20: `docs/2026-09-30-grilling-decisions.md`.
Look: `docs/mockups/2026-10-05-review-edit.html`. Glossary: `CONTEXT.md`.

## Problem Statement

Every change to a reel goes through an agent, even one I could make in seconds: a misheard caption word, a stumble
to cut out, a clip that should start half a second later, a badge that should sit 40 px lower. I write a comment,
copy the batch, paste it into Claude, wait for a build, and check the result. Kinotta can't start a reel either: an
agent has to create every one, so I can't use Kinotta for a plain edit of a talking video at all. And I can't play
a reel; the Storyboard shows stills, so I judge cuts and timing by guesswork.

## Solution

Kinotta becomes an editor that works with or without AI. I start a reel by dropping a video in (or picking one
already in the project). It plays at once and transcribes on my machine, then shows captions and splits long
videos into sections. In the new Review tab I play and scrub the reel, cut and snip the footage, fix and re-time
words, move captions, trim and slide b-roll clips, and move and scale elements. My changes collect in an edit list
I can undo, and Save turns them into the next frozen version, with no agent involved. When I want motion graphics,
an agent builds them from the same sources, so my edits survive, and the Storyboard comment loop works as today.
Kinotta never calls an AI service and names no particular agent.

## User Stories

### Starting a reel

1. As the owner, I want a "New reel" choice in the rail, so that I can start a reel from Kinotta instead of the terminal.
2. As the owner, I want to drop a video file onto Kinotta, so that I can start editing it without any setup.
3. As the owner, I want a dropped video copied into my project's footage folder, so that the project owns it and the reel keeps working after I move or delete the original.
4. As the owner, I want a dropped video that is already in the footage folder (same file) not copied twice, so that my disk doesn't fill with duplicates.
5. As the owner, I want a list of the videos already in my project to pick from, so that a large file isn't copied just to start a reel.
6. As the owner, I want a picked video left where it is, so that my project's layout doesn't change.
7. As the owner, I want each listed video to show its length, codec and size, so that I pick the right take.
8. As the owner, I want an HEVC or ProRes video to get an H.264 copy for playback automatically, so that it plays in the browser without me converting it.
9. As the owner, I want the original video never altered, so that I can always go back to the source.
10. As the owner, I want a new reel's name taken from the video's file name and editable, so that I don't have to type one to start.
11. As the owner, I want the video to play as soon as the reel is created, so that I can start cutting before transcription finishes.
12. As the owner, I want transcription to run on my machine with progress and a time estimate, so that I know when words will arrive and nothing leaves my computer.
13. As the owner, I want to cut and snip while transcription runs, so that I don't wait minutes before working.
14. As the owner, I want words, then captions, to appear when transcription finishes, so that I can fix them next.
15. As the owner, I want a video over about three minutes split into sections at pauses automatically, so that a long reel is reviewable in parts without effort.
16. As the owner, I want Kinotta to tell me at startup if Python, ffmpeg or faster-whisper is missing, and how to install it, so that a start from video never fails halfway.
17. As the owner, I want to start a reel from a short brief instead, which copies a ready-made request for my agent, so that I can still have an agent build a reel from scratch.
18. As the owner, I want a reel started from a brief to wait in the rail with the Waiting mark until the agent writes its shot list, so that I know it's coming.
19. As the owner, I want a reel made from a video to open in Review and one made from a brief to open in Storyboard, so that I land where the next step is.

### Playing

20. As the owner, I want to play a reel with its footage, clips and captions together, so that I judge it as the audience will.
21. As the owner, I want to scrub by dragging the playhead, so that I can find a moment quickly.
22. As the owner, I want keyboard play, pause and frame stepping, so that I can work without the mouse.
23. As the owner, I want the timecode in the Doto numerals with the reel's total length, so that times read like an instrument.
24. As the owner, I want a zoomed timeline with an overview of the whole reel above it, so that I can work on words and still see where I am.
25. As the owner, I want playback to skip snipped stretches and follow the pieces' order, so that what I hear is the edit, not the source.
26. As the owner, I want clips to play their real animation over the footage, so that I can judge motion, not just stills.

### Cutting

27. As the owner, I want a Blade tool that cuts the footage into two pieces at the playhead or a click, so that I can work on parts separately.
28. As the owner, I want a Snip tool that removes a selected stretch and closes the gap, so that I can take out a stumble or a long pause.
29. As the owner, I want to drag a piece to a new place in the order, so that I can rearrange the talk.
30. As the owner, I want each snip and cut marked on the timeline, with the snip's length, so that I can see every edit I made.
31. As the owner, I want words and captions inside a snipped stretch to disappear with it, so that captions match what's said.
32. As the owner, I want a b-roll clip inside a snipped stretch dropped and one straddling a snip trimmed to its edge, so that no clip plays over missing footage.
33. As the owner, I want clips and words on a moved piece to move with it, so that b-roll stays on its line.
34. As the owner, I want sections to stay contiguous after I reorder pieces, so that each section is still one stretch of the reel.

### Words and captions

35. As the owner, I want to fix a misheard word by editing it in the words lane, so that captions and spoken lines read right.
36. As the owner, I want to drag a word's edges to re-time it, so that a caption lit out of sync lines up with the voice.
37. As the owner, I want dragging a caption to move every caption in the reel, so that captions stay consistent.
38. As the owner, I want Alt-dragging a caption to move only that phrase, so that one caption can clear a panel.
39. As the owner, I want a phrase I moved to keep its place after I re-time words around it, so that my placement isn't lost when phrases renumber.
40. As the owner, I want phrase breaks to stay automatic, so that I never have to manage them.

### B-roll clips and elements

41. As the owner, I want to drag a clip's edges to trim it, so that it starts or ends where I want.
42. As the owner, I want to drag a whole clip to slide it along the timeline, so that it lands on a different moment.
43. As the owner, I want a slid clip marked "off its words", so that I know its changes no longer land on the words they were placed on.
44. As the owner, I want a trim that removes one of a clip's states to drop that state's shot, so that the storyboard matches the clip.
45. As the owner, I want to click an element in the frame and drag it, so that I can move it without describing the move.
46. As the owner, I want to scale an element with its corner handle, so that I can make it bigger or smaller.
47. As the owner, I want the element's name and its offset shown in the name tag while I drag, so that I know exactly what I'm moving and by how much.
48. As the owner, I want a ghost outline of the element's original place, so that I can compare before and after.
49. As the owner, I want to drag a whole panel clip over the footage, so that it clears the speaker.
50. As the owner, I want element moves and scale on code-only reels too, so that the same drag works on every reel.

### Edit list and Save

51. As the owner, I want every change listed in an Edits panel, numbered, with what changed and where, so that I can review my changes before saving.
52. As the owner, I want undo and redo, so that I can try things safely.
53. As the owner, I want to undo a single edit from its card, so that I can drop one change without undoing everything after it.
54. As the owner, I want the edit list kept across a reload or crash, so that I never lose unsaved work.
55. As the owner, I want Save to build the next version from my edits in about a second, so that saving is cheap.
56. As the owner, I want Discard to drop the edit list, so that I can abandon a try.
57. As the owner, I want a saved version marked "Saved by you" in the rail and a built one marked with its agent, so that I can see who made each version.
58. As the owner, I want a saved version to record the edits it applied, so that I can see later what changed.
59. As the owner, I want my unsent comments to move to the saved version, re-placed at their new times, so that my own edit doesn't strand my notes.
60. As the owner, I want a comment whose moment I snipped kept and marked "moment removed", so that I can re-pin or delete it.
61. As the owner, I want each version to keep the transcript and plan it was built from, so that fixing a word in a new version doesn't change what an older one shows.
62. As the owner, I want Save blocked while a batch is with an agent, with the reason shown, so that we don't both write the next version.
63. As the owner, I want to keep editing while Save is blocked, and have my edit list replayed onto the agent's version when it lands, so that I don't lose a sitting.
64. As the owner, I want an edit whose target the agent removed flagged in the list, so that I can drop or redo it.
65. As the owner, I want cancelling a hand-off to unblock Save, so that I'm never stuck.

### Agents and the Storyboard

66. As the owner, I want an agent's next build to keep every edit I saved, so that working alone and with an agent mix freely.
67. As the owner, I want the Storyboard of a reel with no clips to show an empty state with a copyable request for b-roll, plus the lanes, so that the next step is one click.
68. As the owner, I want to pin comments on words of a reel with no clips, so that I can brief an agent precisely.
69. As the owner, I want a reel to open in the tab I last used for it, so that I return to where I was.
70. As the owner, I want the app's wording to name no particular agent, so that I can use whichever agent I like.
71. As an agent, I want the reel's sources (plan, transcript, pieces, offsets, caption position) to hold every saved edit, so that I build on the owner's edits without reading the edit list.
72. As an agent, I want a version to record who built it, so that I can explain a version I didn't author.
73. As an agent, I want a slid clip to be visible in the plan, so that I can re-sync it to its words when asked.

## Implementation Decisions

- **Core gains editing.** The reels core (HTTP-free, D10) adds to `Project`: read the edit list, add an operation,
  undo, redo, remove one operation, discard, save, start a reel from a video, list the project's videos, and read
  transcription progress. The HTTP layer and the UI's single API client expose them; the UI never touches files.
- **Edit operations.** The edit list is a list of operations on named targets, never patched files, so it can
  replay onto new sources (E5). Kinds: cut (at a source time), snip (a source range), move piece (index to index),
  word text (word at a source time), word timing (word at a source time, new start and end), caption position
  (reel), caption phrase position (anchored to the phrase's first word's source time), clip trim (clip id, new in
  and out), clip slide (clip id, delta), element offset (clip id or scene, element name, x, y, scale). It lives in
  the reel folder, outside every version, and is written on every change.
- **Pieces and source time.** A footage reel's plan gains an ordered list of pieces (source in, source out).
  Without one, the reel is a single piece covering the whole video, so existing plans are unchanged. Clip in and
  out, word times, phrase anchors and section bounds stay in source time. One mapping module converts source time
  to timeline time and back through the pieces, and every reader (build, shot list, carry-forward, editor) uses it.
- **Plan fields.** New optional fields: `pieces`; `captions.position` and per-phrase positions keyed by first-word
  source time; per-clip element `offsets` (`x`, `y`, `scale`); a clip's `slid` flag (cleared by an agent re-sync).
  `build.py` applies offsets with the CSS `translate` and `scale` properties, so they stack on the clip's own
  animated `transform`, `left` and `top` without touching clip code (E10).
- **Save.** Save checks no batch is out, writes the operations into the sources (`plan.json`, the reel's
  `transcript.json`), runs `build.py --plan` and `shots.py` into `v<n+1>`, copies the transcript and plan into the
  version (E14), writes `edits.json`, computes `changedSections` from the operations, sets `builtBy: "you"` in
  `shots.json`, writes `shots.json` last (the new-version signal, K12), carries unsent comments forward with
  remapped times, and clears the edit list. Any failure leaves no `v<n+1>` and keeps the edit list.
- **Kinotta runs the repo's Python scripts** (E3): the Kinotta skill's copies of `build.py`, `shots.py` and
  `transcript.py`, called as subprocesses through one module. A startup check reports a missing Python, ffmpeg or
  faster-whisper by name.
- **Transcription is injectable.** `openProject` takes an optional transcriber; the default runs `transcript.py
  --audio`. It reports progress, and its result writes the reel's transcript, then captions and automatic sections.
- **Start from video.** A drop streams the file to the local server, which writes it to the project's footage
  folder, skipping an identical file. A pick uses the file where it is. The core probes the codec and makes an
  H.264 copy for HEVC or ProRes. It writes `reel.json` (title, footage), a plan with one piece, captions on and
  no clips, and builds `v1` with `builtBy: "you"` once transcription is in; until then the editor plays the footage
  from the reel without a version. Sections split every ~3 minutes at the nearest pause, one section below that.
- **Start from a brief.** Writes `reel.json` with the title and copies a request text naming the reel and the
  brief; the reel shows Waiting until a version with a `shots.json` appears.
- **Version folders.** A version may hold its own `transcript.json` and `plan.json`; the core reads them before
  the reel's. Older versions without them fall back to the reel's files. `shots.json` gains optional `builtBy`.
- **Carry-forward by remapping.** Unsent comments map from the old timeline to source time and onto the new
  timeline, for Saves and agent builds alike. An element pin follows its element. A pin inside a snipped stretch
  keeps its text and gets a `moment-removed` state. This replaces "unchanged sections only" as the carry rule.
- **Save blocked by a hand-off.** A copied batch marks the reel as handed off until the next version appears or
  the hand-off is cancelled. While handed off, Save returns a reason; operations still collect. When the next
  version appears, the edit list replays onto its sources; operations whose target is gone are flagged.
- **Code-only reels.** Element offsets only, saved as a stylesheet in the next version with `translate` and `scale`
  rules scoped to `[data-scene]` and `[data-el]`; the version is a copy of `v<n>` plus that file. Scene timing is
  not editable.
- **Editor.** The Review tab becomes current for editing: rail (reels, sections, versions with who built them),
  player in the Gate well with Select, Blade and Snip tools, lanes (overview, Footage pieces, Clips, Captions,
  Words, Pins, axis) on one zoomable time axis, and a right column with Edits and Comments tabs and Save and
  Discard. It reuses the storyboard's tokens, rail, lanes, pins, comment cards and buttons, per
  `docs/mockups/2026-10-05-review-edit.html` and `DESIGN.md`. The New reel screen holds the drop zone and the
  project's video list. Element outlines, handles, tags and ghosts are drawn by the editor over the page, never
  inside it.
- **Skill.** The skill's rules learn the new plan fields (keep pieces, offsets and positions; clear `slid` on a
  re-sync), write `builtBy` with the agent's name, copy the transcript and plan into each version, and use neutral
  wording where the app shows it (E20).
- **Glossary.** New terms in use: Agent, Edit list, Save, Piece, Cut, Snip, Offset (`CONTEXT.md`).

## Testing Decisions

- A good test drives the public seam and checks what the owner or an agent would see: files in the reel and
  version folders, versions listed, comments and their pins, the shot list, the composed page. No test reaches
  into a module's internals.
- **Core (`Project` from `openProject`), the main seam.** Tests copy the footage sample fixture into a temp project,
  apply operations, Save, and check the new version: its page and shot list rebuild from the sources, `edits.json`,
  `changedSections`, `builtBy`, the per-version transcript and plan, carried comments at remapped times and
  "moment removed", the hand-off block and replay, start from video with a fake transcriber, and code-only offsets.
  These run the real Python build. Prior art: the core tests over copied fixtures (versions, comments, section
  batches, word pins).
- **Engine scripts.** `build.py` and `shots.py` with pieces (timeline times, dropped and trimmed clips, words in a
  snip), offsets stacking on an animated element, caption and phrase positions, and a plan without the new fields
  building the same page as before. Prior art: the engine build, compose and captions tests.
- **Browser e2e.** A few flows on the running app: pick a video and play it; snip a stretch and Save to a new
  version; edit a word; drag an element and see its offset in the tag; Save blocked while a batch is out. Prior
  art: the Playwright specs started by the shared test server.
- **Transcription.** Tests pass a fake transcriber with fixed words. One opt-in test runs real faster-whisper on
  the 12-second sample video.
- **Drift.** The committed footage sample is rebuilt when the engine changes, as today.

## Out of Scope

- Colour grading and the footage track of takes (split off from Review).
- MP4 render and a render queue.
- Re-breaking caption phrases by hand.
- Editing scene timing on code-only reels.
- Moving an element's end position only (an offset applies to its whole animation).
- Packaging and testing agents other than Claude (a later ticket).
- Audio comments, approval, the Picker phase, the element library format, Electron packaging.

## Further Notes

- This phase changes K12 (an agent is no longer the only author of a version) and product principle 5, and absorbs
  T28 (each version keeps its transcript).
- First tracer-bullet slice: start a reel from a picked video, play it, snip a stretch, Save to a new version.
- Section boundaries for reels made in Kinotta are automatic and editable (E12); an agent can rename them by topic
  when asked.
- The mockup embeds a frame of the owner's own sample video.
