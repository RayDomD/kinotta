# Tickets: Review and Edit phase

Generated 2026-10-05 from spec #30 (`docs/specs/2026-10-05-review-edit-phase.md`). Plan:
`docs/plans/2026-10-04-direct-edits.md`. Decisions E1 to E20: `docs/2026-09-30-grilling-decisions.md`. Look:
`docs/mockups/2026-10-05-review-edit.html`. Glossary: `CONTEXT.md`. Numbering continues from `docs/tickets.md`
(T1 to T28, Storyboard phase).

Work the **frontier**: any ticket whose blockers are all done. T29 to T32 are the spec's first slice: start a reel
from a picked video, play it, snip a stretch, Save to a new version.

Status keys: **Done**, **Parked (owner)**, or open.

## T29 (#31). Pieces in the engine — Done

**What to build:** A footage reel's plan may hold an ordered list of pieces (source in, source out). `build.py --plan`
and `shots.py` map clip in and out, word times, phrase anchors and section bounds from source time to timeline time
through the pieces. A clip inside a snipped stretch is dropped, a clip straddling one is trimmed to its edge, and
words and captions in a snip disappear. One TypeScript module in core does the same source-to-timeline mapping and
back, for the editor, carry-forward and Save to share. A plan without pieces is one piece covering the whole video.

**Blocked by:** None. Can start immediately.

**Model:** top

- [x] A plan with pieces builds a page whose scenes, captions and shots sit at timeline times
- [x] A clip inside a snip is dropped; a clip straddling a snip is trimmed to its edge
- [x] Words and caption phrases inside a snip are absent from the page and the shot list
- [x] A plan without `pieces` builds the same page and shot list as before (drift test unchanged)
- [x] The core mapping module converts source to timeline time and back, with tests over reordered pieces

## T30 (#32). Start a reel from a picked video — Done

**What to build:** The rail gains one "New reel" choice. Its screen lists the videos already in the project with
length, codec and size. Picking one (left where it is) with a name taken from its file name, editable, writes
`reel.json` (title, footage) and a plan with one piece, captions on and no clips. Kinotta runs the skill's
`build.py` and `shots.py` as subprocesses through one runner module (E3). `openProject` takes an optional
transcriber; tests pass a fake with fixed words. Once words are in, Kinotta writes the reel's transcript and builds
`v1` with `builtBy: "you"` in `shots.json`. The new reel opens in Review.

**Blocked by:** None. Can start immediately.

**Model:** mid

- [x] The New reel screen lists the project's videos with length, codec and size
- [x] Picking a video creates the reel without copying or altering the video
- [x] With a fake transcriber, the reel gets `transcript.json` and a `v1` that passes `kinotta check`, with `builtBy: "you"`
- [x] The reel opens in the Review tab
- [x] Python is called only through the runner module

## T31 (#33). Review tab plays a reel — Done

**What to build:** The Review tab, per the mockup: rail (reels, sections, versions), player in the Gate well, and
lanes (overview, Footage pieces, Clips, Captions, Words, Pins, axis) on one zoomable time axis with an overview of the
whole reel above it. The player plays the footage with clips animating and captions over it, follows the pieces'
order and skips snipped stretches. Space plays and pauses, arrow keys step frames, dragging the playhead scrubs. The
timecode reads in Doto numerals with the reel's total length. A reel with no version yet plays its footage alone.

**Blocked by:** T29, T30

**Model:** top

- [x] A footage reel plays footage, clips and captions together in the Gate well
- [x] Playback follows pieces and skips snips
- [x] Keyboard play, pause and frame step; drag scrubs; timecode shows current and total in Doto
- [x] The zoomed timeline and its overview stay in step with the playhead
- [x] Playwright: pick a video and play it

## T32 (#34). Snip and Save — Done

**What to build:** The Snip tool selects a stretch on the timeline and removes it, closing the gap. Each change is
an operation in the reel's edit list, stored in the reel folder outside every version and written on every change.
The Edits panel lists operations numbered, with what changed and where. Save checks no batch is out, writes the
operations into the sources (`plan.json` pieces, the reel's `transcript.json`), runs `build.py --plan` and
`shots.py` into `v<n+1>`, copies the transcript and plan into the version, writes `edits.json`, computes
`changedSections`, sets `builtBy: "you"`, writes `shots.json` last, and clears the edit list. Discard drops the list.
The core reads a version's own `transcript.json` and `plan.json` before the reel's (E14, absorbs T28). The rail marks
a saved version "Saved by you" and a built one with its agent.

**Blocked by:** T29, T30, T31

**Model:** top

- [x] A snip adds an operation, marks the timeline with the snip's length, and playback skips it
- [x] Save makes `v<n+1>` with `edits.json`, `changedSections`, `builtBy: "you"`, and its own transcript and plan
- [x] Any failure in Save leaves no `v<n+1>` and keeps the edit list
- [x] `v1` keeps its spoken lines after `v2` corrects a word (T28's criterion)
- [x] Discard clears the edit list
- [x] The rail shows who made each version
- [x] Playwright: snip a stretch and Save to a new version

## T33 (#35). Undo, redo and remove one edit — Done

**What to build:** Undo and redo step through the edit list (keyboard and buttons). Each card in the Edits panel can
drop its own operation without undoing those after it. The edit list survives a reload or crash.

**Blocked by:** T32

**Model:** mid

- [x] Undo and redo restore the edit list and the player's view
- [x] Removing one card leaves later operations applied
- [x] Reloading the app restores the unsaved edit list

## T34 (#36). Blade and reorder pieces — Done

**What to build:** The Blade tool cuts the footage into two pieces at the playhead or a click. Dragging a piece
moves it to a new place in the order. Clips, words and captions on a moved piece move with it. Cuts and snips are
marked on the timeline. Sections stay contiguous after a reorder.

**Blocked by:** T32

**Model:** top

- [x] Cut and move-piece operations apply in the editor and on Save
- [x] Clips and words on a moved piece play at their new place in the saved version
- [x] Every section is one contiguous stretch after a reorder
- [x] Cuts and snips are marked on the footage lane

## T35 (#37). Comments carry forward by remapping — Done

**What to build:** Unsent comments move to the next version on Save and on an agent's build, their times mapped
from the old timeline to source time and onto the new one. An element pin follows its element. A pin inside a
snipped stretch keeps its text and gets a `moment-removed` state, shown as "moment removed" so it can be re-pinned
or deleted. This replaces "unchanged sections only" as the carry rule.

**Blocked by:** T32

**Model:** top

- [x] After a snip and Save, unsent comments sit at remapped times in the new version
- [x] A comment in a snipped stretch is kept and marked "moment removed"
- [x] An agent-built version carries comments by the same rule
- [x] Existing carry-forward tests are updated to the new rule

## T36 (#38). Fix and re-time words — Done

**What to build:** In the Words lane, editing a word fixes its text and dragging its edges re-times it. Captions and
spoken lines follow. Phrase breaks stay automatic. Operations target a word by its source time.

**Blocked by:** T32

**Model:** mid

- [x] A word text edit shows in captions and spoken lines after Save
- [x] A re-timed word lights at its new time in the saved version
- [x] Playwright: edit a word (spec run in scoped config: snip-save.spec.ts)

## T37 (#39). Move captions — Done

**What to build:** Dragging a caption moves every caption (`captions.position` in the plan). Alt-dragging moves only
that phrase, anchored to its first word's source time, and the phrase keeps its place when words around it are
re-timed. `build.py` applies both.

**Blocked by:** T32

**Model:** mid

- [x] Dragging moves all captions in the saved version (spec run in scoped config: snip-save.spec.ts)
- [x] Alt-drag moves one phrase; it keeps its place after nearby words are re-timed (spec run in scoped config: snip-save.spec.ts)
- [x] A plan without caption positions builds as before

## T38 (#40). Trim and slide clips — Done

**What to build:** Dragging a clip's edges trims it; dragging the whole clip slides it. A slid clip gets the plan's
`slid` flag and shows "off its words". A trim that removes one of a clip's states drops that state's shot.

**Blocked by:** T32

**Model:** top

- [x] Clip trim and slide operations apply in the editor and on Save (spec run: clips.spec.ts)
- [x] A slid clip is marked "off its words" and `slid` in the plan
- [x] A trim that removes a state drops its shot from the shot list

## T39 (#41). Move and scale elements on footage reels — Done

**What to build:** Clicking an element in the frame selects it; dragging moves it and its corner handle scales it.
The name tag shows the element's name and offset while dragging, and a ghost outline marks its original place. A
panel clip moves as a whole the same way. Offsets are stored per clip and element in the plan (`x`, `y`, `scale`)
and `build.py` applies them with CSS `translate` and `scale`, stacking on the clip's own animation. Outlines,
handles, tags and ghosts are drawn by the editor over the page, never inside it.

**Blocked by:** T32

**Model:** top

- [x] An offset moves and scales the element through its whole animation in the saved version (engine test, core Save test)
- [x] Offsets stack on an animated `transform`, `left` and `top` (engine test) (tests/engine/offsets.test.ts)
- [x] Tag and ghost show while dragging; the page holds no editor markup (spec run: clips.spec.ts)
- [x] Playwright: drag an element and see its offset in the tag (spec run: clips.spec.ts)

## T40 (#42). Move and scale elements on code-only reels — Done

**What to build:** The same drag works on code-only reels. Save writes the next version as a copy of `v<n>` plus a
`kinotta-edits.css` with `translate` and `scale` rules scoped to `[data-scene]` and `[data-el]`. Scene timing is not
editable.

**Blocked by:** T39

**Model:** mid

- [x] Saving an element move on a code-only reel makes `v<n+1>` = `v<n>` plus `kinotta-edits.css`
- [x] The moved element shows at its offset in the new version
- [x] Timing tools are unavailable on code-only reels

## T41 (#43). A hand-off blocks Save — Done

**What to build:** Copying a batch marks the reel as handed off until the next version appears or the hand-off is
cancelled. While handed off, Save is blocked with the reason shown and edits still collect. When the agent's
version lands, the edit list replays onto its sources; an operation whose target is gone is flagged on its card.

**Blocked by:** T32

**Model:** top

- [x] Save returns and shows a reason while a batch is out
- [x] Cancelling the hand-off unblocks Save
- [x] The edit list replays onto the agent's version; gone targets are flagged
- [x] Playwright: Save blocked while a batch is out

## T42 (#44). Start from a dropped video — Done

**What to build:** Dropping a video onto the New reel screen streams it to the local server, which writes it to the
project's `footage/` folder, skipping an identical file. An HEVC or ProRes video gets an H.264 copy for playback;
the original is never altered. ADR 0002 records the copy.

**Blocked by:** T30

**Model:** mid

- [x] A dropped video lands in `footage/` and starts a reel
- [x] Dropping the same file again does not copy it twice
- [x] HEVC or ProRes gets an H.264 playback copy; the original is unchanged
- [x] ADR 0002 is amended

## T43 (#45). Real transcription with progress — Done

**What to build:** The default transcriber runs `transcript.py --audio` on the user's machine and reports progress
with a time estimate. The video plays and can be cut and snipped while it runs. Words, then captions, appear when it
finishes. A video over about three minutes is split into sections at pauses near every three minutes. One opt-in test
runs real faster-whisper on the 12-second sample.

**Blocked by:** T30, T31

**Model:** mid

- [x] Progress and an estimate show while transcribing
- [x] Snips made during transcription survive its end
- [x] Long videos get automatic sections at pauses; short ones get one section
- [x] The opt-in faster-whisper test passes on the sample

## T44 (#46). Startup check for Python, ffmpeg and faster-whisper
 — Parked (owner)

Built and committed on branch `worktree-agent-adfb0c28f2649be21` (`1ca4280`), checks green there; merging into this branch was not permitted in the unattended run, so it waits for the owner's merge.

**What to build:** At startup Kinotta checks for Python 3, ffmpeg and faster-whisper and names any that is missing,
with how to install it, so a start from video never fails halfway.

**Blocked by:** None. Can start immediately.

**Model:** small

- [ ] A missing tool is named with an install hint at startup and in the New reel screen
- [ ] All present: no message

## T45 (#47). New reel from a brief, empty Storyboard and last-used tab — Done

**What to build:** New reel offers starting from a short brief: Kinotta writes `reel.json` with the title and copies
a request naming the reel and the brief; the reel shows Waiting until a version with `shots.json` appears, then
opens in Storyboard. A reel with no clips shows a Storyboard empty state with a copyable request for b-roll, and its
lanes still show, with word pins. A reel opens in the tab last used for it.

**Blocked by:** T30

**Model:** mid

- [x] A brief reel waits in the rail with the Waiting mark and opens in Storyboard once built
- [x] A reel with no clips shows the empty state, its lanes, and accepts word pins
- [x] A reel reopens in its last-used tab

## T46 (#48). Skill learns the new plan fields — Done

**What to build:** The Kinotta skill keeps pieces, offsets and caption positions when it rebuilds, clears `slid` when
it re-syncs a clip to its words, writes `builtBy` with the agent's name, and copies the transcript and plan into each
version. App wording and the skill's user-facing text name no particular agent (E20).

**Blocked by:** T37, T38, T39

**Model:** small

- [x] Skill rules cover pieces, offsets, caption positions, `slid`, `builtBy` and per-version transcript and plan
- [x] App strings name no particular agent

## T47 (#49). Finish pass on Review and Edit — Done

**What to build:** Lane B finish on the built Review tab and New reel screen: `/impeccable critique`, then
`/impeccable audit`, the verbs they flag, and `/impeccable polish`. DESIGN.md records the new surfaces.

**Blocked by:** T31, T32, T33, T34, T36, T37, T38, T39, T41, T42, T43, T45

**Model:** mid

- [x] Critique and audit findings resolved or recorded
- [x] AA contrast and a keyboard-only pass of snip and Save
- [x] DESIGN.md matches the built surfaces
