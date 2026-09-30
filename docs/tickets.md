# Tickets: Storyboard phase

Generated 2026-09-30 from issues #3 to #19. Parent spec: #1 (`docs/specs/2026-09-30-storyboard-phase.md`).
Plan: `docs/plans/2026-09-30-storyboard-phase.md`. Glossary: `CONTEXT.md`.

Status keys: **Done**, **Parked (owner)** (needs the owner, not built in the unattended run), or open.

## T1 (#3). Walking skeleton: launcher, server and editor shell — Done

**What to build:** Running `kinotta` inside a project starts the local server against that project's reels folder, prints the URL, and opens the editor shell in the Rubric world (D15-D22). The rail lists the reels found in the reels folder and opens the most recently changed one. Plain empty states cover a project with no reels folder and one with no reels. Test runners exist for core tests and one Playwright smoke test. The server keeps its logic independent of HTTP and the UI talks to it through one API client (D10).

**Acceptance criteria:**

- [x] `kinotta` run in a sample project prints a local URL and serves the editor
- [x] The rail lists every reel in the sample reels folder, newest change first
- [x] No reels folder and empty reels folder each show a clear message
- [x] Core test runner and Playwright smoke test run and pass
- [x] Shell uses the approved tokens: warm near-black ground, Outfit, ice-blue light, 0 radius, dark only

**Blocked by:** none

**Model:** `mid`

## T2 (#4). Storyboard grid with live stills — Done

**What to build:** Opening a reel shows its newest storyboard version as a grid of every shot. The core reads the version's shot list (number, start time, title, description). The stage loads the version page in a same-origin frame and jumps it to each shot's time with the page's global `seek(seconds)` (ADR 0001, D9), so each still is the live page, not a screenshot. Stills load lazily as shots scroll into view. Shots lift into stacked paper on hover and focus at Rubric speeds (D17, D19).

**Acceptance criteria:**

- [x] Grid shows every shot with number and timecode (Doto, tabular), title and description
- [x] Each still is the live page paused at the shot's start via `seek`
- [x] Stills below the fold load only when scrolled into view
- [x] Hover and keyboard focus lift a shot into stacked paper; reduced motion removes the transition
- [x] Core tests cover shot list reading against sample reels

**Blocked by:** #3

**Model:** `top`

## T3 (#5). Enlarge a shot and pin a comment to an element — Done

**What to build:** Clicking a shot opens it large in the stacked-paper sheet; arrow keys step shots and Esc or Close returns to the grid. Over the frame the hex cursor with a centre dot shows, and the element under it gets an ice-blue outline and a name tag that never covers the reel's content (D18). A click creates a pin (version, shot, time, x and y as frame fractions, element name or none) and the comment is typed right away. The core saves it; the pin shows as a numbered filled hex on the frame, the still and the comments panel as a stacked-paper card.

**Acceptance criteria:**

- [x] Clicking a named element records its name; clicking empty frame records position only
- [x] The name tag repositions or flips so it never covers content or leaves the frame
- [x] Pins persist across a browser reload
- [x] Pin numbers match between frame, still and comments panel
- [x] Arrow keys, Esc and Close work; all controls are keyboard reachable

**Blocked by:** #4

**Model:** `top`

## T4 (#6). Copy the comment batch for Claude — Done

**What to build:** "Copy all comments" writes the structured batch into the version folder and puts pasteable text on the clipboard: reel and version, each comment numbered as shot, time, element: text, then notes, and where the file was saved (D6). The button shows the comment count and confirms the copy. Copying again overwrites the saved batch (S7). An empty batch cannot be copied. This ticket adds the end-to-end browser test of the pin path (S8).

**Acceptance criteria:**

- [x] Batch file is written into the version folder and matches the comments
- [x] Clipboard text names each comment's shot, time and element
- [x] Re-copy after a new comment overwrites the batch file
- [x] Copy is disabled or clearly empty with zero comments
- [x] End-to-end test: open storyboard, enlarge, pin a named element, comment, copy, assert file and clipboard

**Blocked by:** #5

**Model:** `mid`

## T5 (#7). Edit, delete and cancel comments, and reel notes — Done

**What to build:** Comments on the newest version can be edited and deleted along with their pins (S7). A pin with no text yet can be cancelled so a stray click leaves nothing. A note on the whole reel can be written. Clicking a comment opens its shot with the pin highlighted. The empty comments panel explains how to pin.

**Acceptance criteria:**

- [x] Edit and delete persist and update pin numbering consistently
- [x] Cancelling an untyped pin removes it
- [x] Reel note saves and appears in the batch text
- [x] Clicking a comment opens its shot with the pin highlighted
- [x] Core tests cover edit and delete

**Blocked by:** #5

**Model:** `mid`

## T6 (#8). Versions, read-only history and the ready notice — Done

**What to build:** The version rail lists every version, marks the storyboard, and highlights the newest in ice blue with a non-colour cue. Only the newest version accepts comment changes, enforced in the core (S6); older versions open read-only with a line saying so. The server watches the reels folder and streams change events; when Claude writes a new version, it appears with a "ready" notice and opens on one click, never automatically (S4).

**Acceptance criteria:**

- [x] Core refuses comment changes on a non-newest version with a clear error
- [x] Older versions show shots and comments read-only
- [x] A new version folder appearing on disk shows a ready notice without reload
- [x] The editor never switches version on its own
- [x] Core tests cover newest-version detection and change events

**Blocked by:** #6

**Model:** `mid`

## T7 (#9). Broken versions open with an issue list — Done

**What to build:** A version that breaks the timing contract still opens (S5). The core's static checks (shot list validity, scene timing markup, missing or duplicate element names) and the stage's runtime checks (missing or throwing `seek`) merge into one list, such as "shot 04: no named elements". Shots that cannot render show a labelled placeholder, never a black frame. The owner can include the issue list in the copied batch.

**Acceptance criteria:**

- [x] A broken sample version opens and lists each issue in plain words
- [x] Unrenderable shots show a placeholder with the reason
- [x] Pins on unnamed elements record position only
- [x] Issue list can be added to the batch text
- [x] Core tests cover static checks on good and broken samples; the e2e test opens the broken sample

**Blocked by:** #6

**Model:** `mid`

## T8 (#10). Time lanes under the grid — Done

**What to build:** Under the grid, Shots, Pins and Overlays lanes share one time axis (D22). Each shot's width is its duration; storyboard pins sit at their shot's start, side by side; overlays sit at their real span, and an empty Overlays lane shows "None" over dot terrain. Clicking a segment or a pin opens that shot. Built to the approved mockup.

**Acceptance criteria:**

- [x] Segment widths are proportional to shot durations
- [x] Pins sit at their shot's start and stack side by side
- [x] Overlays render at their real span; none shows the empty state
- [x] Clicking a segment or pin opens the shot
- [x] Matches docs/mockups/2026-09-30-editor-visual-world.html

**Blocked by:** #5

**Model:** `mid`

## T9 (#11). Kinotta skill for code-only reels — Parked (owner)

Parked for the unattended run: the last criterion needs a real run in a client project with the owner.

**What to build:** The global Kinotta skill gives Claude the rules to write storyboard v1 under the timing contract (timed scenes, stable element names, global `seek`, deterministic rendering) with a shot list; to discover brand sources on first use and write `reels/brand.md` for one check (S2, D14); to read the global taste list and `reels/taste.md` before each build (S3); and to consume a batch into a new frozen version folder, answering each comment. The test sample reels become the skill's reference examples.

**Acceptance criteria:**

- [ ] Skill rules cover contract, folder layout, brand file, taste lists and batch consumption
- [ ] Sample reels used in tests are the skill's examples
- [ ] A real run in a client project: v1 opens in Kinotta, a batch produces v2, v1 stays unchanged

**Blocked by:** #6

**Model:** `mid`

## T10 (#12). Design the section list and transcript line — Done

Done before the run with the owner. Mockup: `docs/mockups/2026-09-30-sections-transcript.html`, option A (F10).

**What to build:** The section list and the transcript line under a shot have no mockup yet. Run a ui-preview round inside the established world (D15-D22) and save the chosen mockup to docs/mockups, linked from the grilling log. Needs the owner to choose.

**Acceptance criteria:**

- [x] Two or three options shown in ui-preview
- [x] Owner's choice saved to docs/mockups with a dated name
- [x] Grilling log links the saved mockup

**Blocked by:** none

**Model:** `small`

## T11 (#13). motion-broll engine adopts the shared contract — Parked (owner)

Parked for the unattended run: the change lands in `~/.agents/skills/motion-broll`, which is not under version control.

**What to build:** motion-broll's engine adds Kinotta's element names and scene timing markup so every clip it builds opens in Kinotta as-is (F7, ADR 0001). Its global `seek(t)` already matches. The change lands in the motion-broll skill, not this repo.

**Acceptance criteria:**

- [ ] Clips built by motion-broll carry scene timing and stable element names
- [ ] A motion-broll clip opens in Kinotta with no contract issues
- [ ] motion-broll's own render and stills still work

**Blocked by:** #4

**Model:** `mid`

## T12 (#14). Sections for long reels — Done

**What to build:** The core reads sections (name and time span) from the shot list (F2). A section list shows each section's name, span, shot count and pin count. The grid shows one section's shots at a time; the lanes span the whole reel with section bands and the current section highlighted. Built to the mockup from the design ticket.

**Acceptance criteria:**

- [x] Section list switches the grid to that section
- [x] Lanes show section bands with the current one highlighted
- [x] A reel with one section behaves exactly as before
- [x] Core tests cover section reading

**Blocked by:** #10, #12

**Model:** `mid`

## T13 (#15). Transcript and footage stills — Done

**What to build:** For footage reels the core reads the transcript (timed words) and the footage reference, which stays in the project (ADR 0002). Each shot shows its type (cutaway or panel) and the spoken line it covers. The stage draws a panel clip over the real footage frame at the same second, and shows a cutaway alone (F8). A click on the footage part records only a position; a click on the clip resolves its element.

**Acceptance criteria:**

- [x] Panel stills show the clip over the footage frame at that time
- [x] Cutaway stills show the clip alone
- [x] Each shot shows its type and transcript line
- [x] Clicks on footage record position only; clicks on the clip record the element
- [x] Core tests cover transcript and footage reference reading

**Blocked by:** #5, #12

**Model:** `top`

## T14 (#16). Word pins on the transcript — Done

**What to build:** In the enlarged shot the transcript line's words are selectable; selecting a word pins a comment to it, recording the word and its time (F5). Word pins appear in the comments panel and the batch text as "word".

**Acceptance criteria:**

- [x] Selecting a word creates a word pin with word and time
- [x] Word pins show in the panel and lanes and appear in the batch text
- [x] Keyboard can select a word
- [x] Core tests cover word pins

**Blocked by:** #15

**Model:** `mid`

## T15 (#17). Section batches and carry-forward

**What to build:** Copying hands off the current section's batch (the whole reel when it has one section) and marks that section as waiting (F3). When a newer version appears, handed-off batches freeze; unsent comments on sections the new version did not change move forward to it, and unsent comments on changed sections stay behind and are listed as not carried (F4). The core decides changed sections by comparing section contents, not only Claude's claim. The version list shows which sections each version changed.

**Acceptance criteria:**

- [ ] Batch file and text cover only the current section
- [ ] Waiting mark shows until a newer version changes that section
- [ ] Unsent comments on unchanged sections appear on the new version
- [ ] Comments on changed sections are not carried and are listed
- [ ] Core tests cover freeze, carry-forward and change detection

**Blocked by:** #8, #14

**Model:** `top`

## T16 (#18). Kinotta skill for footage reels — Parked (owner)

Parked for the unattended run: the last criterion needs a real run on a talking video with the owner.

**What to build:** The skill adds footage: transcription from the owner's SRT or a local run, splitting into sections by topic, planning b-roll through motion-broll's rules (F6), and consuming a section batch by rebuilding only that section. A short footage sample (two sections, one panel clip) joins the end-to-end test.

**Acceptance criteria:**

- [ ] Skill rules cover transcript, sections, motion-broll planning and section batches
- [ ] E2E on the footage sample: panel still over footage, word pin, section batch
- [ ] A real run on a talking video: review one section, hand it off, v2 changes only that section and carries unsent comments

**Blocked by:** #11, #13, #16, #17

**Model:** `mid`

## T17 (#19). DESIGN.md and finish review

**What to build:** Write DESIGN.md from the built Storyboard with /impeccable document, recording D19's motion override. Run /impeccable audit, check AA contrast in the dark theme, and do a keyboard-only pass. Fix what the audit flags.

**Acceptance criteria:**

- [ ] DESIGN.md exists and matches the built editor
- [ ] Audit findings resolved or recorded
- [ ] AA contrast verified
- [ ] Full keyboard-only pass completes the pin and copy path

**Blocked by:** #8, #9, #10, #14, #15, #16

**Model:** `mid`
