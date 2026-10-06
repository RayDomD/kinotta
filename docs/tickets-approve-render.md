# Tickets: Approve and Render phase

Generated 2026-10-05 from spec #52 (`docs/specs/2026-10-05-approve-and-render.md`). Plan:
`docs/plans/2026-10-05-approve-and-render.md`. Decisions R1 to R18: `docs/2026-09-30-grilling-decisions.md`. Look:
`docs/mockups/2026-10-05-picker-layout.html` (layout), DESIGN.md (visual world). Glossary: `CONTEXT.md`. Numbering
continues from `docs/tickets-review-edit.md` (T29 to T47).

Work the **frontier**: any ticket whose blockers are all done. T48 and T49 are the first slice: approve a version and
see it in the rail, then render a Draft of a code-only reel through the core engine and `kinotta render`. T57 can run
alongside.

Status keys: **Done**, **Parked (owner)**, or open.

## T48. Approve and withdraw a version — Done

**What to build:** Core calls write and delete `v<n>/approval.json` (`{ approvedBy: "you", at }`), exposed only by the
editor's HTTP API. The version listing carries `approved`. An `approval-changed` event updates the rail, and the
watcher diffs `approval.json` so a file created or removed outside the editor raises the same event (R17). The rail
marks approved versions. Approving a version with contract issues succeeds and returns a warning naming them (R10).
No `kinotta approve` command.

**Blocked by:** None. Can start immediately.

**Model:** mid

- [x] Approve writes `approval.json`; withdraw deletes it and leaves `renders/` untouched
- [x] More than one version of a reel can be approved
- [x] Approving leaves every other file in the version unchanged
- [x] The version listing carries `approved`; `approval-changed` fires from the HTTP call and from an outside file change
- [x] Approving a version with contract issues returns a warning naming them
- [x] The rail marks approved versions on every tab
- [x] `kinotta` has no approve command

## T49. Draft render of a code-only reel, from the core and the CLI — Done

**What to build:** The skill's `engine/render.js` gains flags (scale, frame range, CRF, motion blur on or off, output
path) and prints JSON progress lines (R14). Kinotta starts it only through `runner.ts`. A core render module takes a
reel, a version, a preset and settings and writes the file. A one-job-at-a-time queue lives in the core `Project`, with
`render-progress` events. Output goes to `reels/<reel>/renders/<reel>-v<n>-<preset>-<height>p<fps>.mp4` through a temp
name and a rename; the same settings replace the file. `kinotta render <reel> v<n> --preset draft` hosts the server
headless in its own process (no browser), enqueues, prints progress and exits when the queue drains (R12, the
single-process half). This slice covers code-only reels and the Draft preset only.

**Blocked by:** None. Can start immediately.

**Model:** top

- [x] `render.js` accepts the new flags and prints JSON progress lines; its default run is unchanged for the skill
- [x] A Draft of a code-only version renders to the named file at half size, CRF 28, no motion blur
- [x] Rendering again with the same settings replaces the file
- [x] A failed render leaves no file in `renders/`
- [x] `kinotta render <reel> v<n> --preset draft` prints progress and the output path, then exits
- [x] The render process starts only through `runner.ts` (boundary test passes)

## T50. Final and Overlay of a footage reel — Done

**What to build:** The footage pipeline (spec, R13, R18). `render.js` renders the version's overlay page. ffmpeg cuts
the footage by the version's own pieces, joining video with hard cuts and audio with about 20 ms fades (Smooth) or none
(Hard). A Final pipes the overlay frames straight into the composite step with no ProRes intermediate. An Overlay
writes ProRes 4444 with alpha and no audio. Pieces come from the version's own plan. `composite.py` is retired. A
code-only reel offers Overlay only when its page renders with a transparent background.

**Blocked by:** T49

**Model:** top

- [x] A Final's duration matches the version's pieces
- [x] A frame at a known time matches the overlay page seeked to that time, within the `engine-compose` tolerance
- [x] With Smooth, the audio has no sample jump at a cut; with Hard, the cut is direct
- [x] An Overlay is ProRes 4444 with alpha and no audio track
- [x] No ProRes intermediate is written for a Final
- [x] A later edit and Save on the reel doesn't change a render of an earlier version
- [x] Overlay is refused for a code-only page that isn't transparent

## T51. The render gate — Done

**What to build:** Final and Overlay check that the version is approved, has its own `plan.json` and has no contract
issues (R6, R10, R13). `footageIssues` moves from `cli.ts` into the core, so the HTTP path and `kinotta check` share
one list (R18). A refusal is a `KinottaError` `invalid` naming every reason. Draft skips all three checks. The CLI
refusal tells an agent to ask the owner to approve in Kinotta.

**Blocked by:** T48, T49

**Model:** mid

- [x] Final and Overlay are refused for an unapproved version, naming the reason
- [x] Final and Overlay are refused for a version without its own `plan.json` ("built before plans were kept")
- [x] Final and Overlay are refused for a version with contract issues, naming them, including footage issues
- [x] Draft renders in all three cases
- [x] `kinotta check` output is unchanged after `footageIssues` moves to the core
- [x] `kinotta render` refuses an unapproved Final with the "approve it in Kinotta" message

## T52. One queue across processes, and cancel — Done

**What to build:** The running editor writes a port file in the project and removes it on exit. `kinotta render`
reads it and enqueues over the local HTTP API, printing the `render-progress` events; without a live editor it hosts
the server headless as in T49 (R12). A stale port file is detected and ignored. Cancel kills every render process for
the job and removes the temp output and `renders/.work-<job>/`. `kinotta render` and `kinotta check` take `--project`.

**Blocked by:** T49

**Model:** top

- [x] With the editor running, `kinotta render` joins its queue and waits behind a render the editor started
- [x] Without the editor, `kinotta render` renders on its own and exits
- [x] A stale port file doesn't block a render
- [x] Cancel leaves no output file and no `.work-<job>/` folder
- [x] `kinotta render --project <dir>` and `kinotta check --project <dir>` act on that project

## T53. Presets and the four settings — Done

**What to build:** The three presets as named defaults (R2). The four settings (R3): frame rate (source, 24, 25, 30,
60), size (source, 1080p, 4K) scaled through `deviceScaleFactor` and limited to the source's aspect ratio, quality
(Standard, High) and audio at cuts (Smooth, Hard). A non-default quality or audio setting is added to the file name
(R18). `reels/<reel>/render-settings.json` keeps the settings per preset; only the HTTP render call from Picker saves
it, and `kinotta render` flags never change it (R16). The CLI takes the four settings as flags.

**Blocked by:** T50

**Model:** mid

- [x] Each preset renders with its R2 defaults
- [x] Each setting changes the output as described; size keeps the source's aspect ratio
- [x] A High-quality or Hard-cut render gets its own file name and doesn't replace the default one
- [x] Settings saved from the HTTP call come back per preset for the next render of that reel
- [x] A `kinotta render` with flags leaves `render-settings.json` unchanged

## T54. Parallel segments and the estimate — Done

**What to build:** The engine splits a render's frame range across several Chromium pages, as many as the CPU allows,
renders the segments in parallel in `renders/.work-<job>/` and joins them. Progress combines the segments and gives a
time estimate. Workers are not a setting.

**Blocked by:** T50

**Model:** top

- [x] A render split into segments matches the single-page render frame for frame, within tolerance
- [x] Progress events carry a combined percentage and an estimate
- [x] `.work-<job>/` is removed on finish, cancel and failure

## T55. Picker page — Done

**What to build:** Picker becomes the third phase page, built to `docs/mockups/2026-10-05-picker-layout.html` in the
DESIGN.md visual world. The main column holds the versions table (version, built by, comment count, contract status,
approval with Approve or Withdraw) and, under it, Review's player read only for the selected row. The right column
holds the render panel for the selected version (preset, four settings prefilled from `render-settings.json`, Render)
and the reel's past renders with Play and Show in folder. Final and Overlay show the gate's reasons when refused.

**Blocked by:** T48, T51, T53

**Model:** top

- [x] The Picker tab lists the reel's versions with built by, comments, contract status and approval
- [x] Approve and Withdraw work from the table and the rail follows
- [x] Selecting a row plays that version
- [x] The render panel prefills from the preset and saved settings and starts a render
- [x] A refused Final or Overlay shows the reasons in the panel
- [x] Past renders list with Play and Show in folder
- [x] Playwright: approve a version, see the rail mark, render a Draft, play the finished file

## T56. Renders in the background, everywhere

**What to build:** The queue in Picker's right column with progress, estimate and cancel. A render indicator in the
top bar on every tab. A finished render raises a "ready" notice with Play and Show in folder, like the version notice.

**Blocked by:** T52, T54, T55

**Model:** mid

- [ ] The queue shows the running job's progress and estimate, and the waiting jobs
- [ ] Cancel from Picker removes the job and leaves no file
- [ ] The top bar shows a running render on every tab
- [ ] A finished render raises a notice with Play and Show in folder
- [ ] Playwright: start a render, switch tabs, see progress, cancel one

## T57. Chromium in the tool check — Done

**What to build:** `playwright` moves from `devDependencies` to `dependencies`. The startup tool check (T44) adds
Chromium, found through Playwright's executable path rather than a PATH probe, with the hint
`npx playwright install chromium`. Each missing tool's message gives its own reason (reels from video, or rendering)
(R15).

**Blocked by:** None. Can start immediately.

**Model:** mid

- [x] `playwright` is a runtime dependency
- [x] A missing Chromium is reported with its install hint
- [x] The message for a missing render tool names rendering; the one for transcription tools names reels from video
- [x] The New reel "Needs on this machine" row still reads correctly

## T58. Skill and glossary

**What to build:** SKILL.md replaces "no MP4 render" with "render only through `kinotta render`, Final and Overlay
only of an approved version" and names no approval command (R1). References to `composite.py` go. CONTEXT.md updates
"Approval" and adds "Render" and "Preset".

**Blocked by:** T51, T52

**Model:** small

- [ ] SKILL.md tells an agent to render only through `kinotta render` and never to approve
- [ ] No skill file references `composite.py`
- [ ] CONTEXT.md defines Approval, Render and Preset as the spec gives them

## T59. Finish pass on Picker

**What to build:** Lane B finish on the Picker page, the rail mark, the top bar indicator and the ready notice:
`/impeccable critique`, `/impeccable audit`, the verbs they flag, then `/impeccable polish`. DESIGN.md records the
Picker components.

**Blocked by:** T55, T56

**Model:** top

- [ ] Critique and audit run; their P1 and P2 findings are fixed or recorded with the owner's call
- [ ] DESIGN.md describes the Picker components
- [ ] Full e2e suite passes
