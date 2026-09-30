# Storyboard phase: build run summary

Date: 2026-09-30. Branch: `feat/storyboard-phase` (local, not pushed). Plan:
`docs/plans/2026-09-30-storyboard-phase.md`. Tickets: `docs/tickets.md` (issues #3 to #19). Spec: #1.

## Outcome

Every buildable ticket shipped: T1 to T8 and T12 to T15 were built by Sonnet executor lanes and
reviewed and integrated by the orchestrator; T17 (design review) was run by the orchestrator.
T10 was done before the run. T9, T11 and T16 are parked for the owner, as planned. No ticket was
halted. Nothing was pushed and no PR was opened.

Final full suite on the branch (after the last commit): `npm run typecheck` clean, core tests
123/123 across 12 files, Playwright end-to-end 70/70, run twice back to back.

## Run report

| Ticket | Model | Retries | Review outcome | Commit |
|---|---|---|---|---|
| T1 (#3) Walking skeleton | Sonnet | 0 | Pass; orchestrator fixed a duplicate landmark label | `eedde19` |
| T2 (#4) Grid with live stills | Sonnet | 0 | Pass (top depth); button-wraps-iframe carried into T3 | `b91a31b` |
| T3 (#5) Enlarge and pin | Sonnet | 0 | Pass (top depth); Esc-drops-draft carried into T5 | `d2e4c1a` |
| T4 (#6) Copy the batch | Sonnet | 0 | Pass; orchestrator fixed the Copy button's accessible name | `b7a9bf3` |
| T8 (#10) Time lanes | Sonnet | 0 | Pass; orchestrator scoped a test lookup after lanes shared shot names | `f9bc5fe` |
| T6 (#8) Versions and ready notice | Sonnet | 0 | Pass | `23f782e` |
| T13 (#15) Transcript and footage stills | Sonnet | 0 | Pass (top depth); 10 additive merge conflicts with T6 resolved | `0bccc26` |
| T5 (#7) Edit, delete, cancel, notes | Sonnet | 0 | Pass; 5 additive conflicts with T13 resolved | `5b4fba3` |
| T12 (#14) Sections | Sonnet | 0 | Pass; merged with T5 (section filter moved into the comments panel, reveal index fixed) | `bd6ccf7` |
| T14 (#16) Word pins | Sonnet | 0 | Pass; merged with T12 (context words from the whole reel, duplicate spoken line removed per F10) | `fc99773` |
| T7 (#9) Broken versions | Sonnet | 0 (first lane lost to the session usage limit, restarted fresh; not a review retry) | Pass | `fe5e2c7` |
| T15 (#17) Section batches and carry-forward | Sonnet | 0 | Pass (top depth); merged with T7 into one `copyBatch` options object | `4e324d6` |
| T17 (#19) DESIGN.md and finish review | Opus (orchestrator) | 0 | Critique 28/40, audit 14/20; fixes applied | `d90c1e9` |
| Windows write fix (found by the final suite) | Opus (orchestrator) | n/a | EPERM on rename during a save; atomic writes now retry | `8ed5008` |

Docs commits: `4f0786a` (tickets file), `03711d5` (plan In Progress), and this summary.

## Shipped versus planned

Planned steps 1 to 6, 8, 9 and 13 of the plan shipped: scaffold and launcher, reels core, comments
and batches, HTTP layer with change events, the stage, the Storyboard UI (grid, lanes, enlarge and
pin, comments panel, version rail, broken-version list), footage in the core, stage and UI
(transcript, sections, word pins, per-section batches, waiting marks, carry-forward), and
`DESIGN.md` with the finish review. The end-to-end tests cover the code-only sample, the footage
sample and the broken samples.

Not shipped, by plan: step 7 and 11 (the Kinotta skill, T9 and T16), step 10 (motion-broll engine,
T11), and the real runs in a client project (step 12's second half).

## Deviations and decisions made during the run

- Engine: `/orchestrate` parallel mode with the owner's overrides: Sonnet only, at most two lanes,
  one ticket per lane, each lane stopped when it reported, retries as fresh lanes. The Agent tool
  has no effort parameter, so lanes were told "medium effort" in their prompt.
- Lane worktrees are created from `main`, not the feature branch; each lane fast-forwarded to
  `feat/storyboard-phase` first. Parallel lanes also shared Playwright ports; lanes waited and reran.
- Conventions fixed by the orchestrator and followed by every lane: the reels format
  (`shots.json`, `reel.json`, `transcript.json`), editor working state in `reels/.kinotta/` (the
  editor writes only batch files into version folders), pins numbered by the core (shot start,
  then creation) so every surface shows the same number, a keyboard "Pin an element" control, and
  pages loaded as `index.html?render` with `seek` awaited whether it returns a promise or not
  (motion-broll's engine is synchronous and only stops its preview loop with `?render`).
- Batch files: `vN/comments.json` for a one-section reel, `vN/comments-<section>.json` per section
  on a multi-section reel. The reel note goes into every section's batch.
- Changed sections are computed by comparing each section's fields, shots and the markup of the
  scenes over it with the version before; Claude's `changedSections` claim can add a changed
  section but never clear one.
- Commit messages carry no AI signature, per the owner's global instructions.
- The critique's closing questions and `/impeccable document`'s qualitative questions were not
  asked (unattended run). The North Star "The Light Table" and the colour names in `DESIGN.md` are
  the orchestrator's, derived from D15 to D22; revise freely.

## Finish review (T17)

- Critique (dual assessment, snapshot in `.impeccable/critique/`): 28/40, Good. Design specificity:
  authored, not interchangeable.
- Audit: accessibility 3, performance 3, responsive 1 (desktop-only by product decision), theming
  4, implementation integrity 3: 14/20, Good.
- AA contrast measured in the browser on every surface: 0 failures (tightest pass 5.21:1).
- Keyboard-only pin and copy path completes; Copy now keeps focus.
- Fixed: save confirmation in the sheet, Copy focus and a lasting "…again" label, pin-count
  plural, "Untitled shot" fallback, raw colours moved into tokens, inactive phases say "Not built
  yet".
- Recorded, not changed (would alter the approved mockups' layout, owner's call):
  - dead space on short reels, and a long issue list pushes the lanes below the fold;
  - keyboard-chip pins land on the element's centre and cover it, and pin numerals on grid stills
    are about 6px;
  - the enlarged sheet is modal and hides the comments column while you write;
  - there is no Copy keyboard shortcut.
- The detector's `dark-glow` and `flat-type-hierarchy` findings are false positives against D16
  and the operate-mode scale. The CLI detector ran degraded (its HTML parser modules are missing).

## Parked tickets: what the owner has to do

- T9 (#11) Kinotta skill for code-only reels: write the skill rules (contract, folder layout,
  brand file, taste lists, batch consumption) with the test fixtures as its examples, then do the
  real run in a client project: v1 opens in Kinotta, a batch produces v2, v1 stays unchanged.
- T11 (#13) motion-broll engine: decide where the change is committed (for example put
  `~/.agents/skills/motion-broll` under git), then add `data-scene`, `data-start`,
  `data-duration` and `data-el` to its engine output; its `seek` already matches.
- T16 (#18) Kinotta skill for footage reels: after T9, T11 and this branch, add transcription,
  section splitting and motion-broll planning to the skill, then a real run on a talking video.

## Notes for the owner

- T15's scene-overlap rule marks both sections changed when one scene spans a section boundary.
  That errs toward carrying fewer comments; assigning scenes by start time is the alternative.
- `/footage/%2E%2E` returns the app's index page (the URL parser normalises it to `/`); no file
  outside the project is served.
- One e2e assertion waits for the 1.4s "Copied" confirmation; it failed once under full parallel
  load and passed in every other run.
- The GitHub profile README and issue #1 embed images from the `docs/foundation` branch; if that
  branch is deleted, point them at `main`.

## Checks run

- Per ticket: `npm run typecheck`, core tests, full Playwright suite, and the Impeccable detector
  on changed UI files, on the integrated branch before each commit.
- End of run: typecheck clean; core 123/123; Playwright 70/70 twice.
