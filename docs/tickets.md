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

## T9 (#11). Kinotta skill for code-only reels — Done

Parked for the unattended run: the last criterion needs a real run in a client project with the owner. Everything else
shipped on 2026-10-03 (plan `docs/plans/2026-10-03-kinotta-skill.md`, owner checklist inside).

**What to build:** The global Kinotta skill gives Claude the rules to write storyboard v1 under the timing contract (timed scenes, stable element names, global `seek`, deterministic rendering) with a shot list; to discover brand sources on first use and write `reels/brand.md` for one check (S2, D14); to read the global taste list and `reels/taste.md` before each build (S3); and to consume a batch into a new frozen version folder, answering each comment. The test sample reels become the skill's reference examples.

Grilled 2026-10-03 (K1 to K12 in the grilling log): the skill lives in `skill/kinotta/` and is linked into the skills folder; the brand file is checked before any build and points at `DESIGN.md`; answers go to `v<n+1>/answers.md`; a `kinotta check` command verifies the static contract; every version stays unanimated in this phase.

**Acceptance criteria:**

- [x] Skill rules cover contract, folder layout, brand file, taste lists and batch consumption
- [x] Sample reels used in tests are the skill's examples, labelled as format only (K2)
- [x] `kinotta check <reel> [version]` prints contract issues and exits non-zero on any, with a test (K7)
- [x] README documents the install: `npm link` and the skill junction (K8)
- [x] `~/.kinotta/taste.md` seeded with the K11 rules
- [x] A real run in Aroma: v1 opens in Kinotta, a batch produces v2 with `answers.md`, v1 stays unchanged (K10)

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

## T15 (#17). Section batches and carry-forward — Done

**What to build:** Copying hands off the current section's batch (the whole reel when it has one section) and marks that section as waiting (F3). When a newer version appears, handed-off batches freeze; unsent comments on sections the new version did not change move forward to it, and unsent comments on changed sections stay behind and are listed as not carried (F4). The core decides changed sections by comparing section contents, not only Claude's claim. The version list shows which sections each version changed.

**Acceptance criteria:**

- [x] Batch file and text cover only the current section
- [x] Waiting mark shows until a newer version changes that section
- [x] Unsent comments on unchanged sections appear on the new version
- [x] Comments on changed sections are not carried and are listed
- [x] Core tests cover freeze, carry-forward and change detection

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

## T17 (#19). DESIGN.md and finish review — Done

**What to build:** Write DESIGN.md from the built Storyboard with /impeccable document, recording D19's motion override. Run /impeccable audit, check AA contrast in the dark theme, and do a keyboard-only pass. Fix what the audit flags.

**Acceptance criteria:**

- [x] DESIGN.md exists and matches the built editor
- [x] Audit findings resolved or recorded
- [x] AA contrast verified
- [x] Full keyboard-only pass completes the pin and copy path

**Blocked by:** #8, #9, #10, #14, #15, #16

**Model:** `mid`

## Footage reels: T11 and T16 split (2026-10-03)

T11 (#13) and T16 (#18) split into tracer-bullet tickets. The Kinotta skill takes its own copy of
motion-broll's engine; the standalone motion-broll skill is not changed. Footage versions carry real
animations (an exception to K9 for footage reels), and v1 is reviewed in Kinotta with no plan approval
in chat. Explainer: `docs/explainers/2026-10-03-footage-tickets.html`.

## T18 (#21). Bring a copy of motion-broll into the Kinotta skill

Part of T11 (#13).

**What to build:** The Kinotta skill gains its own copy of motion-broll's engine, scripts, reference, templates and examples, so footage-reel work lives in this repo's history. The skill's description adds b-roll for review in Kinotta, worded so a plain b-roll request with no Kinotta involved still reaches the standalone motion-broll. ADR 0001 records that the engine is now part of Kinotta rather than a separate tool sharing the format. The standalone motion-broll skill is not changed.

**Acceptance criteria:**

- [x] The engine, scripts, reference, templates and examples are in the Kinotta skill, with the Geist fonts' OFL notice beside the fonts
- [x] The skill's description covers b-roll for review in Kinotta, and the skill points footage requests at the new material
- [x] ADR 0001 says the engine is part of Kinotta
- [x] The copied engine builds and renders an example clip from its new place
- [x] The standalone motion-broll skill is unchanged

**Blocked by:** none

**Model:** `small`

## T19 (#22). One engine clip opens in Kinotta

Part of T11 (#13).

**What to build:** The engine's build step wraps a clip as one timed scene and gives the shape, and each part a reviewer could point at, a stable element name. The authoring reference gains the naming rule. An example clip opens in Kinotta as a one-clip reel: stills draw at shot times, a click pins a named element, and `kinotta check` passes. The engine's own render and contact sheets still work.

**Acceptance criteria:**

- [x] A built clip carries scene timing and stable element names
- [x] An example clip opens in Kinotta with no contract issues, and a click pins a named element
- [x] The engine's render and contact sheets still work on that clip
- [x] A test builds a clip and checks it

**Blocked by:** #21 (T18)

**Model:** `mid`

## T20 (#23). Many engine clips on one reel page

Part of T11 (#13).

**What to build:** The engine runs several clips on one page, each scoped to its own scene instead of page-wide element ids and one global `seek`. The build step composes a whole b-roll plan into one version page: each clip is a scene at its in-point on the video's timeline, a page `seek` hands each clip its local time, and panel clips stay transparent over the footage. The bundled six-clip example opens in Kinotta as a footage reel.

**Acceptance criteria:**

- [x] Two clips on one page don't interfere: each draws correctly at its own time
- [x] A plan builds into one version page whose scenes match the plan's in and out points
- [x] The six-clip example opens as a footage reel with no contract issues, and panel stills show the footage around the clip
- [x] Single-clip build, render and contact sheets still work

**Blocked by:** #22 (T19)

**Model:** `top`

## T21 (#24). A real engine clip in the footage tests

Part of T11 (#13).

**What to build:** The footage sample's hand-written panel is replaced by a panel built and composed by the engine, so the end-to-end footage tests run against real engine output.

**Acceptance criteria:**

- [x] The footage sample's panel is engine-built
- [x] The footage, word pin and section batch end-to-end tests pass against it
- [x] A click on the clip pins its element, and a click on the footage pins a position only

**Blocked by:** #23 (T20)

**Model:** `mid`

## T22 (#25). kinotta check covers footage reels

Part of T16 (#18).

**What to build:** On a reel whose reel.json names footage, `kinotta check` also reports a missing footage file, a missing or unreadable transcript, and shots with no type or no spoken line, alongside the timing contract issues, and exits non-zero on any. Claude runs it before saying a footage version is ready.

**Acceptance criteria:**

- [x] Each footage problem prints on its own line with its code, with a test for each
- [x] The footage sample passes
- [x] Code-only reels are checked as before

**Blocked by:** none

**Model:** `mid`

## T23 (#26). Footage reel v1 from a video

Part of T16 (#18).

**What to build:** Asked for a b-roll reel on a video in the project, the skill takes the owner's SRT or transcribes locally and saves the transcript with the reel, points reel.json at the footage where it already sits, splits the reel into sections of a few minutes by topic, plans clips with the engine's rules (density; cutaway, panel or nothing; changes on words), builds the clips, composes v1, writes the shot list with each shot's section, type and spoken line, and runs `kinotta check`. There is no plan approval in chat: v1 is the plan the owner reviews. Footage versions carry the real animations, an exception to K9 for footage reels; Kinotta shows stills until the Review phase.

**Acceptance criteria:**

- [x] Skill rules cover the transcript, the footage reference, sections, planning, building and composing v1
- [x] No plan approval step in chat when building for Kinotta
- [x] The K9 exception for footage reels is recorded in the grilling log and the skill
- [x] A v1 built from the footage sample passes `kinotta check` and opens with panel stills over the footage

**Blocked by:** #23 (T20), #25 (T22)

**Model:** `top`

## T24 (#27). Next footage version from a section's comments

Part of T16 (#18).

**What to build:** Given a section batch, the skill rebuilds only that section's clips, carries the other sections over unchanged, handles element pins, footage position pins and word pins, writes answers.md and changedSections, and runs `kinotta check`.

**Acceptance criteria:**

- [x] Skill rules cover section batches on footage reels and all three pin kinds
- [x] Sections outside the batch are unchanged in the new version
- [x] answers.md answers every comment and note in the batch

**Blocked by:** #26 (T23)

**Model:** `mid`

## T25 (#28). Real run on a talking video — Closed (owner)

Part of T16 (#18).

Closed without a run on 2026-10-04: the owner was satisfied by the sample-project loop
(`kinotta-test`, reel `sample-broll`, v1 to v2 from a section batch) and has no talking video to run on.
The criteria below stay unticked because they were not run on a real talking video.

**What to build:** On one of the owner's talking videos: v1 opens in Kinotta, the owner reviews one section and hands it off, and v2 changes only that section and carries the unsent comments on the other sections forward. Done with the owner.

**Acceptance criteria:**

- [ ] v1 of a real talking video opens in Kinotta with panel stills over the footage
- [ ] A section batch produces v2 with answers.md, changing only that section
- [ ] Unsent comments on the other sections move forward to v2, and v1 stays unchanged

**Blocked by:** #24 (T21), #27 (T24)

**Model:** owner

## T26. States per clip

Decision K15. Mockup: `docs/mockups/2026-10-04-stills-per-clip.html` (grid B, sheet Y). No GitHub issue yet.

**What to build:** A footage clip with `stills` in the plan gets one shot per state (`05a`, `05b`, …, each with `"clip": "05"`). The grid card shows which part of its clip a shot is ("2 of 3"); the enlarged shot shows a strip of the clip's states under the frame, and clicking one opens it. Arrow keys still step through every shot.

**Acceptance criteria:**

- [x] `shots.py` writes one shot per state, with its still, spoken line and clip; a clip without `stills` is unchanged
- [x] Shots split this way pass `kinotta check`
- [x] The grid card shows "n of m" for a clip's states
- [x] The enlarged shot shows the clip's states and switches to the one clicked
- [x] Skill rules say when to split a clip and how a batch maps `05b` back to clip 05

**Blocked by:** none

**Model:** `mid`

## T27. Captions on footage reels

Decisions C1 to C6; look picked in the sample pass (B, active word lit). No GitHub issue yet.

**What to build:** A footage reel's plan turns captions on (`"captions": true`, or a look and colour). `build.py --plan` writes each caption phrase from the transcript as its own scene with a pinnable `caption` element; the page shows the phrase under way and marks the spoken word. The shot list adds one Captions overlay. The skill turns captions on by default and fixes misheard words in the transcript.

**Acceptance criteria:**

- [x] Each phrase is a scene `cap-001`… with a `caption` element, in the plan's look and colour
- [x] The page shows the phrase under way at any second and marks the word being said
- [x] A plan without captions builds the same page as before
- [x] The shot list has one Captions overlay
- [x] Skill rules cover turning captions on, the look, and fixing misheard words
- [x] The sample reel passes `kinotta check` with captions

**Blocked by:** none

**Model:** `mid`

## T28. Each version keeps the transcript it was built with

Found checking the sample's v2 (2026-10-04). No GitHub issue yet.

**What to build:** The transcript belongs to the reel, so a word fixed for `v2` ("Vidal" to "Dela") also changes `v1`'s spoken lines and word row in the editor, while `v1`'s page still shows the old word. A version should show the transcript it was built with.

**Acceptance criteria:**

- [ ] A version folder may hold its own `transcript.json`, which Kinotta reads before the reel's
- [ ] The skill copies the transcript into the version when it corrects a word, leaving older versions as they were
- [ ] `v1` keeps its spoken lines after `v2` corrects a word

**Blocked by:** none

**Model:** `mid`
