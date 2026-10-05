# Spec: Approve and Render phase (Picker)

Decisions R1 to R18: `docs/2026-09-30-grilling-decisions.md`. Glossary: `CONTEXT.md`. Builds on the Review and Edit
phase (`docs/specs/2026-10-05-review-edit-phase.md`, #30). Look: none yet; the Picker page needs a `ui-preview` round
before its tickets are built.

## Problem Statement

I can start a reel, cut it, fix its words, review it and save versions, but Kinotta can't give me the one thing anyone
else sees: a video file. When a version is right, I have no way to mark it as the one, and no way to turn it into an
MP4 without leaving Kinotta and stitching the footage, the clips and the captions together by hand. The skill tells
agents not to render either, so the loop stops one step short of a deliverable. The Picker tab has sat in the top bar
since the Storyboard phase without a meaning.

## Solution

Picker becomes the third phase. In it I see a reel's versions, approve the ones that are final, and render them. A
render is a background job in one queue, with progress and cancel. Draft gives a quick check of any version; Final and
Overlay, the deliverables, need an approved version with no contract issues. Final is an H.264 MP4 of the whole reel
with its captions, clips and audio; Overlay is a transparent ProRes file of the clips and captions for finishing in
another editor. Four settings (frame rate, size, quality, audio at cuts) are prefilled by the preset. Renders land in
the reel's `renders/` folder. An agent renders through `kinotta render`, which uses the same engine and the same
queue, so a render is the same file whoever starts it. Only I approve, for now.

## User Stories

### Approval

1. As the owner, I want to approve a version, so that I mark which versions are final.
2. As the owner, I want to approve more than one version of a reel, so that a client cut and a short cutdown can both be final.
3. As the owner, I want to withdraw an approval, so that a mistake or a change of mind is undone without losing renders already made.
4. As the owner, I want approved versions marked in the version rail, so that I see which versions are final from any tab.
5. As the owner, I want approving to leave the version as it is, so that versions stay frozen history.
6. As the owner, I want to keep commenting on an approved version, so that approval doesn't stop the next round.
7. As the owner, I want a warning when I approve a version with contract issues, so that I know it can't be rendered for delivery yet.
8. As the owner, I want only me to approve for now, so that an agent never decides what is final.

### Rendering

9. As the owner, I want to render any version as a Draft, so that I can check an edit as a file without approving it.
10. As the owner, I want to render an approved version as a Final MP4 with its footage, clips, captions and audio, so that I have what the audience sees.
11. As the owner, I want to render an approved version as a transparent Overlay, so that I can finish it in Premiere or Resolve.
12. As the owner, I want each preset to fill in sensible settings, so that rendering is one click.
13. As the owner, I want to change frame rate, size and quality, so that a reel shot at 60 can ship at 30, or at 4K.
14. As the owner, I want to choose smooth or hard audio at cuts, so that snips don't click unless I want an abrupt cut.
15. As the owner, I want the render settings remembered per reel, so that the next render of that reel starts where the last one did.
16. As the owner, I want a Final or Overlay of a version with contract issues refused with the issues named, so that a placeholder frame never ships.
17. As the owner, I want a render to match what Review plays, frame for frame, so that what I judged is what ships.

### Running renders

18. As the owner, I want renders to run in the background, so that I keep reviewing and editing meanwhile.
19. As the owner, I want renders queued one at a time, so that they don't fight over the machine.
20. As the owner, I want progress and a time estimate, so that I know when a render will finish.
21. As the owner, I want a running render shown in the top bar from any tab, so that I don't have to stay on Picker.
22. As the owner, I want to cancel a render, leaving no partial file, so that a wrong setting costs nothing.
23. As the owner, I want a notice when a render finishes, with Play and Show in folder, so that I get to the file at once.

### Renders on disk

24. As the owner, I want renders saved in the reel's `renders/` folder, so that a reel's videos sit beside it.
25. As the owner, I want a render's name to say its version, preset, size and frame rate, so that I can tell files apart.
26. As the owner, I want a render with the same settings to replace the old file, so that the folder doesn't fill with duplicates.
27. As the owner, I want the reel's past renders listed in Picker with Play and Show in folder, so that I find them again.

### Picker

28. As the owner, I want the Picker tab to open the reel's versions side by side, with who built each, its comment count, its contract status and its approval, so that I choose the final one in one place.
29. As the owner, I want to play a version in Picker, so that I judge it before I approve or render it.
30. As the owner, I want a code-only reel to offer Overlay only when its page is transparent, so that I'm not offered a file that makes no sense.

### Agents

31. As the owner, I want an agent to render through `kinotta render <reel> v<n>` with the same presets and settings as flags, so that its renders match mine.
32. As the owner, I want an agent's render to join the same queue and print its progress, so that we never render at once.
33. As the owner, I want `kinotta render` to refuse a Final or Overlay of an unapproved version, so that an agent can't ship what I haven't approved.
34. As the owner, I want an agent unable to approve for now, and the approval record to say who approved, so that agent approval can be allowed later without changing the format.

## Implementation Decisions

- **One render engine in the core (R1).** A render module behind the core `Project` takes a reel, a version, a preset
  and settings, and writes the file. The HTTP handler and `kinotta render` both call it. Processes start only through
  `runner.ts` (E3).
- **`render.js` is the one renderer (R14).** The skill's `engine/render.js` gains flags (scale, frame range, CRF,
  motion blur on or off) and prints JSON progress lines, like `transcript.py`. Kinotta starts it through `runner.ts`.
- **Code-only reels:** the version page is the whole picture. The engine runs `render.js`, the same frame-stepping loop
  HyperFrames uses, with a 4-subframe motion blur. Overlay is offered only when the page renders
  with a transparent background.
- **Footage reels:** the version page is a transparent overlay of clips and captions on the reel's timeline, with the
  pieces applied. A render is three steps:
  1. Render the overlay page with `render.js` (ProRes 4444 with alpha).
  2. Cut the footage by the version's pieces with ffmpeg, joining video with hard cuts and audio with about 20 ms fades
     (Smooth) or none (Hard).
  3. Overlay step 1 on step 2.

  Overlay stops after step 1 and writes ProRes. A Final pipes the overlay frames straight into step 3, with no ProRes
  intermediate (R18). The skill's `composite.py` predates pieces and is replaced by step 2 and step 3.
- **Pieces come from the version's own plan (E14, R13).** The version's plan resolver supplies the pieces, never the
  reel's current sources, so a render of a frozen version doesn't change after later edits. Final and Overlay refuse a
  version without its own `plan.json` ("built before plans were kept"); Draft uses the resolver's fallback.
- **Presets and settings (R2, R3).** A preset is a named set of defaults: codec, CRF, size, frame rate, motion blur,
  audio. Size scales the page (`deviceScaleFactor`) instead of re-laying it out, and is limited to the source's aspect
  ratio. `reels/<reel>/render-settings.json` keeps the four settings per preset (`draft`, `final`, `overlay`) (R16).
  Only Picker's Render saves it; `kinotta render` flags never change it.
- **Speed.** The engine splits the frame range across several Chromium pages, as many as the CPU allows, renders the
  segments in parallel and joins them. Workers are not a setting. Segment files live in `renders/.work-<job>/`, which
  is removed on finish, cancel or failure (R18).
- **The renderer's browser (R15).** `render.js` needs Playwright's Chromium at run time, not only in tests, so
  `playwright` moves to `dependencies`. The startup tool check (T44) adds Chromium with an install hint, and each
  missing tool's message gives its own reason.
- **Approval (R4, R5, R17).** `v<n>/approval.json` holds `{ approvedBy: "you", at }`. Writing and deleting it are core
  calls that only the editor's HTTP API exposes; `kinotta` has no approve command. An `approval-changed` event updates
  the rail and Picker, and the watcher diffs `approval.json` so a change made outside the editor raises it too. The
  version listing carries `approved`. A hand-written file passes the gate; this is accepted until agent approval.
- **Gates (R6, R10, R13).** Final and Overlay check that `approval.json` exists, that the version has its own
  `plan.json`, and that it has no contract issues, the static list `kinotta check` gives. `footageIssues` moves from
  `cli.ts` into the core so the HTTP gate sees footage issues too (R18). A refusal is a `KinottaError` `invalid` naming
  the reason. Draft skips these checks.
- **Output (R7, R18).** Files go to `reels/<reel>/renders/<reel>-v<n>-<preset>-<height>p<fps>.<mp4|mov>`, with a
  non-default quality or audio setting added to the name (for example `-high`, `-hardcuts`). Each is written to a temp
  name and renamed when complete, so a cancelled or failed render leaves nothing. A listing of `renders/` gives Picker
  its past renders.
- **The queue (R8, R12).** One queue per project, in one server process. The running editor writes a port file in the
  project; `kinotta render` reads it and enqueues over the local HTTP API. When no editor is running, `kinotta render`
  starts the same server headless (no browser), enqueues, and the server exits when the queue drains. There is no
  lock-file queue. Progress arrives as `render-progress` events, which the CLI prints. Jobs are not resumed after a
  restart. `kinotta render` and `kinotta check` take `--project`, like the editor.
- **Picker (R11).** A new phase page: the version list with approval, a player (Review's player, read only), the render
  panel (preset, four settings, Render), the queue with progress and cancel, and past renders. The top bar gains a
  render indicator; a finished render raises a "ready" notice like the version one.
- **The skill (R1).** SKILL.md replaces "no MP4 render" with "render only through `kinotta render`, Final and Overlay
  only of an approved version". It names no approval command, because an agent has none.
- **CONTEXT.md.** "Approval" becomes "Your mark that a version is final. Only an approved version gets a Final or
  Overlay render." "Render" and "preset" are added.

## Testing Decisions

- A good test drives the core `Project` or the CLI and asserts on files on disk, returned data and events, as in the
  earlier phases.
- **Core:**
  - Approve, withdraw and list approval.
  - Final and Overlay refused for an unapproved version and for one with contract issues; Draft allowed for both.
  - Output name and replace-on-same-settings.
  - Cancel and failure leave no file, including the `.work-<job>/` segment folder.
  - Final and Overlay refused for a version without its own `plan.json`.
- **Render fidelity:** a short footage sample with one snip and one clip. The rendered Final's duration matches the
  pieces, a frame at a known time matches the overlay page seeked to that time (pixel compare with a tolerance, like
  `engine-compose`), and the audio has no sample jump at the cut with Smooth.
- **CLI:** `kinotta render` with flags renders a Draft, refuses an unapproved Final, and waits in the queue behind a
  render the editor started.
- **Playwright:** approve a version in Picker, see the rail mark, render a Draft, watch progress, cancel one, and play a
  finished render.
- Renders are slow, so render tests use a few seconds of footage at a small size, and the full-length check is opt-in
  like the real-transcription test.

## Out of Scope

- Agent approval (R4: later, by allowing `approvedBy` to name an agent).
- Bitrate, codec choice beyond the three presets, GPU encoding and a worker setting.
- WebM, GIF, PNG sequences and HLS.
- Resuming an interrupted render.
- Longer audio crossfades (an edit, not a render setting).
- Uploading or sharing a render anywhere.
- Audio comments, the element library format, colour grading, Electron packaging.

## Further Notes

- The frame-stepping render and the scene markup follow HyperFrames' pattern; Kinotta does not depend on HyperFrames
  (D4, ADR 0001).
- This phase gives the third tab its meaning and closes the loop in PRODUCT.md: Storyboard, Review, then Picker.
- The deferred note "Rendering at scale" (a queue and partial renders) is met by R8 and the parallel segments; partial
  renders of a section are left for later.
