---
target: Working, Storyboard and ShotSheet cleanup review
total_score: 25
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 1
timestamp: 2026-10-18T15-38-26Z
slug: web-src-storyboard-tsx
---
Method: dual-agent (A: /root/ui_design_assessment · B: /root/ui_technical_assessment); parent live completion documented below.

Evidence archive: [assessment files and fresh checks](../review/2026-10-18-codex-run-cleanup/completion.md). The unchanged independent reports describe their original evidence scope; the completion section supplements it.

# Assessment A: independent design review

Reviewer: `/root/ui_design_assessment`. Target: Working Review, Storyboard and ShotSheet on `fix/codex-run-cleanup`. This is the isolated design assessment for the parent critique; no detector results or prior critique reports were read.

**Status: complete artifact-based assessment.** This review combines independent source analysis with earlier same-code runtime captures and exact passing test assertions. It is not a fresh live interaction pass. Scores are final for that evidence scope; fresh browser checks remain optional follow-up.

## Evidence and limits

Read `PRODUCT.md`, `DESIGN.md`, the Impeccable critique playbook, global UI and craft references, the entire `docs/mockups/` file inventory, the original alternates mockup, the newer inline-card mockup, Working mockup option A, and the relevant Working/alternates plans. Inspected `App.tsx`, `Storyboard.tsx`, `ShotSheet.tsx`, stage still/pin components, comments, Working edits, Review/MediaEditor, toolbar/transport/workspace/settings and styles. `context.mjs --target web/src/Storyboard.tsx` ran once. No application files were edited, no tests were rerun, and no git operations were performed.

The fixture URL supplied was `http://localhost:54518`. CUA attempts to create a new Edge tab and a new in-app browser tab returned `Browser is not available: edge` and `Browser is not available: iab`. `cua.getState()` returned `apps: [], browsers: []`. No alternate UI automation was used.

The parent supplied earlier screenshots generated at 17:41 on this cleanup branch, with confirmation that subsequent changes were documentation/test synchronization only. I independently inspected one bounded batch of ten captures: `tests/artifacts/working/{working-1440,working-768,working-390,frozen-desktop}.png`, `tests/artifacts/alternates/storyboard-dark-1600.png`, `sheet-dark-1272.png`, `storyboard-light-390.png`, `sheet-light-390.png`, `sheet-light-1600.png`, and `storyboard-light-1024.png`. These establish appearance of those fixture states, not animation, focus behavior or arbitrary content.

I read `tests/cleanup-e2e-alternates.log` (5 passed) and `tests/cleanup-e2e-working.log` (2 passed) and their exact test sources. Prior assertions establish keyboard alternate switching, choosing B changing its Working revision and moving the later shot, correct chosen revision in Review and its still, frozen history retaining the original revision, returning to Working, pin visibility/identity, Enter saving, author names, render labels and persistence after reload. **Important limits:** alternate Undo in those tests calls `server.project.undoEdit`, so it does not establish a user-accessible Storyboard Undo interaction. The Review revision assertions do not demonstrate advancing animated playback. The fit test asserts horizontal bounds; it enlarges viewport height before capturing the complete sheet (`alternates.spec.ts:139`), so that screenshot does not prove the sheet fits a normal-height viewport without scrolling. No fresh keyboard navigation, screen-reader, contrast measurement, induced-error or motion pass was performed.

The owner is the only current user. Alex and Sam below are testing lenses for the owner's efficiency and accessibility, not invented customer segments. Full-screen desktop is the product's documented target; absence of a phone editing layout is not itself a defect.

## Design specificity verdict

The implementation is authored for Kinotta rather than interchangeable dashboard chrome. Shot stills, one time axis, element-aware pins, Doto time/count numerals and the restrained square paper/hex vocabulary follow the actual review work. The neutral frame and single state accent protect judgement of a client's reel. The most valuable specificity is behavioral: a comment can identify an element inside the authored page, not just a pixel.

The weak point is the expression of that model across surfaces. Working and frozen history are distinct internally, yet some content still speaks in numbered-version terms, and the persistent Working row is hidden by Review's default collapsed rail. The owner must translate between current picture, numbered base, edit history and comment location. Improve that continuity before introducing more visual character.

## Design health score

Operate mode: all ten heuristics apply. Scores combine observed artifacts, source and the explicitly limited prior interaction assertions above.

| # | Heuristic | Score | Reason |
|---|---|---:|---|
| 1 | Visibility of system status | 2 | Frozen Review has an explicit banner and errors/status exist; Working identity disappears with the collapsed rail and Storyboard names its base version. |
| 2 | Match between system and real world | 3 | Shots, elements, pins and Working fit the owner's job. Numbered-version copy on Working creates a translation step. |
| 3 | User control and freedom | 2 | Undo/redo is durable in Review and the sheet has Escape/cancel/focus return, but the sheet can change Working without exposing the same recovery controls. |
| 4 | Consistency and standards | 2 | Shared visual tokens and controls are coherent; Storyboard comment submission and Review's explicit Save pin use different visible conventions. |
| 5 | Error prevention | 3 | Frozen editing is blocked, busy states and nonempty comment validation exist, and the in-reel alternate cannot be dismissed. |
| 6 | Recognition rather than recall | 2 | Element chips and contextual shortcuts help. Alternate identity is omitted from comment cards and saving a sheet comment relies on discovering implicit Enter submission. |
| 7 | Flexibility and efficiency | 3 | Customizable shortcuts, frame/shot stepping, transport entry, focus mode, timeline fit/pan and keyboard element chips are substantial accelerators. |
| 8 | Aesthetic and minimalist design | 3 | Captures show the picture leading, calm chrome and coherent panels. The large chooser and always-present dismissal field add secondary weight. |
| 9 | Error recognition and recovery | 3 | Inline comment errors, retry states and actionable flagged-edit messages preserve context. Network/error recovery was not induced. |
| 10 | Help and documentation | 2 | Shortcuts sheet, tooltips and contextual hints exist. Sheet submission and cross-surface undo have no nearby explanation. |
| **Total** | | **25/40** | **Acceptable: significant usability improvements remain** |

## What's working

1. **The reel remains the subject.** Working's 1440 capture visibly gives the frame the largest region; the Storyboard desktop capture keeps stills primary while lanes and chrome recede. The quiet frame, constrained state color, domain-specific numerals and flat shell regions are cohesive in both inspected themes. Paper depth belongs to shots/comments in hand rather than every panel.
2. **Precise feedback has a keyboard path.** ShotSheet provides named-element chips and a position-only fallback, not just a pointer hit layer. Source implements return of focus to the originating word/sheet after saving, focus to the opener when closing, and successful-save status semantics. Sources: `ShotSheet.tsx:183`, `:323`, `:352`; `Storyboard.tsx:122`. These focus behaviors were not exercised afresh.
3. **Working history is useful evidence.** The 1440 capture clearly shows Working, its edit count and separate Codex/Claude authors; frozen desktop clearly displays the banner and Back to Working. Passing `working.spec.ts:12` assertions establish the labels and persistence after reload. Sources: `App.tsx:171`; `review/_internal/EditsPanel.tsx:90`.

## Priority issues

### 1. [P1] Working is not continuously identifiable

**Source evidence:** `editor-settings.ts:62` defaults `railOpen` to false. `EditorRail.tsx:12` hides the Reel drawer when collapsed. Working's explicit name and edit count live in that drawer (`App.tsx:171`). The native Review heading contains only the reel title and version actions (`MediaEditor.tsx:512`); the top bar does not print a visible Working label (`App.tsx:76`). Storyboard's heading and comments header instead print `v{number}` (`Storyboard.tsx:166`, `CommentsPanel.tsx:232`).

**Why it matters:** The owner can be looking at a changed Working picture while the screen either omits its state or names the frozen base. That weakens confidence before rendering or handing off feedback, the two moments where exact content identity matters most. Frozen Review's clear banner makes the asymmetry more noticeable.

**Recommendation:** Preserve chosen Working mockup option A as the primary navigation model. Keep its current-state information discoverable when the rail collapses, and make Working content headings/comments accurately distinguish the live reel from its frozen base. This is a consistency improvement to the chosen design, not a recommendation to replace it with unchosen option B.

**Artifact proof:** `storyboard-dark-1600.png` visibly has Working selected but says “Storyboard, v1” and “Comments v1”. `working-1440.png` confirms Working is identified in the open rail, while the main heading has no Working label. `frozen-desktop.png` confirms history receives an explicit banner. The test deliberately opens the Reel rail before capturing; default collapsed appearance is a source inference, not a captured state.

**Suggested command:** `$impeccable clarify`.

### 2. [P2] The ShotSheet comment form has no visible save action

**Source evidence:** `ShotSheet.tsx:240` renders the comment form with one text input, Cancel and Ask for options. It has `onSubmit`, but no submit button or Enter-to-save hint. The native Review pin form explicitly renders Save pin and Cancel pin (`MediaEditor.tsx:542`). The earlier alternates mockup also illustrates an explicit Save action.

**Why it matters:** After clicking an element and writing feedback, the visible action is Cancel. The owner must remember that Enter implicitly submits the form. This adds avoidable uncertainty at the product's central pin-and-comment interaction and gives pointer use a weaker completion path than Review.

**Recommendation:** Give the existing form a visible Save action with the same empty/busy rules as its submit handler. Retain Enter as the accelerator and show it concisely where useful. This changes comment-saving affordance only; it does not change Working's no-Save model.

**Prior interaction proof and limit:** `alternates.spec.ts:105`–`:109` selects Frame centre, fills the textbox and presses Enter, then asserts the saved pin's revision. This proves the Enter path worked in the prior run. No inspected artifact shows an open draft, so the missing visible submit affordance is established by the complete form source, not a screenshot observation.

**Suggested command:** `$impeccable clarify`.

### 3. [P2] Choosing or dismissing an alternate has no local undo path

**Source evidence:** ShotSheet's Use/Not this buttons call the durable edit operations (`ShotSheet.tsx:301`). The sheet key handler handles Escape and shot/alternate stepping, but no edit history (`ShotSheet.tsx:131`). Undo/redo buttons are in Review's Edits tab (`EditsPanel.tsx:90`), and edit-history key handlers are mounted in the Review implementations, not Storyboard (`MediaEditor.tsx:482`; `Review.tsx:389`).

**Why it matters:** These actions alter Working from the Storyboard sheet, while recovery asks the owner to leave the sheet and switch surfaces. Dismissing the wrong alternate is particularly disorienting because the target disappears from the strip. The operation is reversible internally, but that freedom is not available where the mistake happens.

**Recommendation:** Make existing Working undo available in the Storyboard/ShotSheet context, with feedback that names the selected/dismissed alternate. Reuse the existing history operation and avoid extra confirmation dialogs for an undoable choice.

**Artifact/prior interaction proof:** The complete `sheet-dark-1272.png` and `sheet-light-1600.png` show Use and Not this, with no Undo, while `working-1440.png` shows Undo in Review. `alternates.spec.ts:69` chooses B and `:74` dismisses C; its restoration at `:76` uses the server API. This corroborates that the operations are reversible without proving a Storyboard keyboard recovery path. Missing local Ctrl+Z handling remains source-established; I did not personally press it in a fresh browser.

**Suggested command:** `$impeccable harden`.

### 4. [P2] Alternate-specific comments lose their alternate identity in the comments list

**Source evidence:** ShotSheet saves a frame pin's `alternate` (`ShotSheet.tsx:206`) and resolves that revision when a comment is revealed (`ShotSheet.tsx:106`). `CommentCard` renders shot number, time and element but does not display the alternate (`CommentsPanel.tsx:86`).

**Why it matters:** Two comments on the same shot/element can refer to different visual answers but look identical in the list. The owner must reopen them to recover the missing context, weakening the purpose of precise feedback.

**Recommendation:** Resolve the revision to its human label and include that label in the existing comment location line and accessible open name. Keep the existing saved revision identity and reveal behavior.

**Prior interaction proof and limit:** `alternates.spec.ts:87` asserts that A and B pins are separated correctly and a new B pin persists `alternate: r2`. This establishes that the distinction matters and exists in saved data. Missing human-readable alternate identity in the comments list is established by its render source; the inspected empty-list captures do not demonstrate a populated card or its reveal behavior.

**Suggested command:** `$impeccable clarify`.

## Cognitive load

The task has unavoidable intrinsic complexity: time, element, alternate and frozen identity all matter. The interface generally groups these rather than adding explanatory onboarding, appropriate for the sole owner.

Checklist: single focus, chunking, grouping, visual hierarchy and one-thing-at-a-time pass for the inspected fixture states. The large picture/shot region leads; transport, tools, timeline and right panel form recognizable groups. Working memory fails because alternate identity and current Working state must be recovered across views. Progressive disclosure fails locally because the optional dismissal reason field is always in the chooser actions, including when its action is unavailable; both full sheet captures show this. Minimal choices passes for primary choices in these fixtures: toolbar actions are grouped and there are only three alternates. **Two failures: moderate local cognitive load.** This does not establish the entire editor is overloaded.

Decision points with more than four controls: Review's toolbar has eight actions, but they are grouped 3/3/2, so raw count alone is not a defect. Transport combines play, four stepping controls, playhead entry/scrub, Marker and Focus; these are different operations, and live hierarchy matters more than counting them as a menu. The element-chip row scales to the reel's named elements and can exceed four; test a dense shot before prescribing additional hiding. Alternate choice itself is constrained to two through four answers, which is appropriate.

## Emotional journey

The strongest functional peak is precise pinning: the owner identifies an element and records a short comment in context. Source supports explicit success feedback and focus return, and prior test assertions support saved alternate identity. Frozen Review's visibly clear Back to Working banner provides reassurance when history is opened.

The likely valley is committing a choice from the sheet, then searching for recovery elsewhere or remembering whether the pictured content is Working or v1. The ending of a review sitting should leave certainty about what was chosen and what the hand-off contains. Working identity and alternate labels are more useful reassurance than celebratory motion. Emotional reactions are design interpretation of observed artifacts and source, not measured owner responses.

## Persona red flags

**Alex, the owner working quickly:** Existing shortcuts and numerical transport are strong. Selecting an alternate in the Storyboard sheet then needing Review for Undo interrupts the same decision. Enter-only comment saving is fast once learned but offers no recognition cue after an interruption. No timing claim such as “under 60 seconds” was measured.

**Sam, the owner using keyboard/zoom:** Named-element chips, dialog semantics, focus return and aria-pressed alternate selection are good foundations; the previous test asserts ArrowDown changes the alternate. Source indicates tablists in the rail and right panel use ordinary buttons without the full roving-tab/arrow-key pattern; this is a convention issue to verify, not proof the flow is inaccessible. Captures show tiny Doto timecodes and dense Undo shortcut badges; at 1440, “Ctrl Z” wraps across two lines inside the Edits row. CUA was unavailable, so focus visibility, 200% zoom and actual screen-reader announcements were not tested. Do not treat source ARIA attributes or 390px screenshots as those tests.

## Separate follow-up: owner-approved inline animated cards

This branch's `ShotCard` remains a `PageStill` with decorative alternate indicators and a stretched Open button (`Storyboard.tsx:50`, `:73`). `ShotSheet` also uses a seeked `PinFrame` and `PageStill` previews; that source does not establish animated playback. The owner decision requires hover/focus playback, inline switching and explicit Use/Not this in one stacked card, while pinning stays in the sheet. Keep that work under `docs/plans/2026-10-18-inline-alternates-card.md` and its newer mockup rather than folding it into cleanup or claiming the original chooser satisfies it. The plan's latest changelog references implementation on another branch; that does not establish implementation on the reviewed branch. This follow-up is separate from the four current-implementation issues above.

## Minor observations

- The dismissal reason input is displayed even for the in-reel alternate, where it is disabled; reveal it when dismissal is invoked in the separate inline-card design.
- The 390/768 Working captures place the open navigation above the picture and push editing below the first viewport. This is an efficiency tradeoff, not a mobile-release blocker: full-screen large-monitor operation is the declared target.
- The complete sheet captures are tall; tests expand the viewport to include them. The design's “fit without scrolling” promise is not established by those captures. A later normal-height check should include the full alternate strip plus an open comment draft.
- In `working-1440.png`, Undo/Redo shortcut badges split their final Z onto a second line. Keep a chord together so the hint scans as one instrument label.
- `CommentsPanel.tsx:12` limits delete Undo to six seconds. This is a source-only recovery concern for Sam; no permanent-data-loss claim was tested.
- Some old Review/source helper copy still says Save or unsaved edits. Confirm which branch is actually rendered before elevating it; the native Working route takes a different component path.
- `context.mjs` reported `.impeccable/design.json` stale relative to `DESIGN.md`. Treat the document as authority; refresh through `$impeccable document` only if requested.

## Questions and recommendations for synthesis

Prioritize persistent Working identity first, then give pin submission and alternate recovery the same clarity on both surfaces. The separate inline-card plan already settles its interaction choices; do not ask the owner to decide them again. The 25/40 score is usable as an artifact-based critique with the stated limits. A fresh live pass is useful for Ctrl+Z in the sheet, a normal-height draft layout, focus visibility and animated playback, but no further live work is required to support the static findings recorded here.

Questions for the parent synthesis: Which should lead the next focused plan: Working identity or the comment/alternate completion-and-recovery controls? A useful design question is how to keep the chosen Working rail model recognizable while collapsed. Reusing the existing global Ctrl+Z path is an implementation recommendation, not a request to reopen the settled alternate-card behavior.

Questions skipped in this sub-assessment: the parent is responsible for the combined report and final targeted question; no independent user question is needed here.


## Live completion and synthesis, 2026-10-18

The owner approved the UI reviewers and then said “continue please” after the proposed Playwright fallback. CUA had no connected browser. The two independent source/artifact assessments are preserved unchanged; the parent completed these fresh headless Chromium checks on isolated cleanup commit `78db54a`. This is not two independent live reviews. The technical reviewer saved its full report before a quota interruption. No new agents or UI fixes were needed.

The design score remains **25/40** and the technical score remains **14/20, provisional**. Fresh evidence strengthens specific findings without establishing full accessibility or performance compliance. See `assessment-a.md`, `assessment-b.md`, `font-disposition.md`, `live-results.json`, and `layout-results.json` beside this report.

### Exact fresh evidence

- Storyboard displayed “Storyboard, v1” while Working was selected. Review's collapsed rail omitted a persistent Working label. The default Review capture confirms the identity gap.
- Viewing alternate B left Working at `r1`; choosing B returned HTTP 201 and changed Working to `r2`.
- Enter saved “Fresh B identity check” with pin alternate `r2`. The draft's visible text/buttons contained Cancel and Ask for options but no submit button or Enter hint. The comment card omitted the alternate label despite preserving it in data.
- The sheet had zero Undo buttons. Ctrl+Z on the focused sheet left Working at `r2`.
- Review loaded `r2`; playback reached 1.86 seconds, proof local time 0.864, with label transform `translateX(17.28px)`. This establishes advancing playback of the chosen revision, rather than appearance alone.
- ArrowRight on the Edits tab retained both Edits selection and focus, confirming the missing tab-keyboard contract.
- At 1600×1000, the desktop sheet measured 900×999.05 at y=37, bottom=1036.05, with scrim scroll height 1031 versus client height 948. Scrolling remains necessary. The separate light-theme pass measured the same sheet size.
- Light Storyboard had no document horizontal overflow at 1600 or 390px. At 390px the sheet measured x=16, width=358, height=794.31 at y=128.84, fitting horizontally and vertically in that fixture state. This is not a certification for arbitrary content or phone editing.
- Frozen v1 loaded `r1`. Returning to Working timed out waiting for `r2` in this custom pass. The earlier passing regression verifies that path, so preserve this as an unresolved discrepancy rather than declaring either a new product bug or a fresh pass. The independent layout script then completed successfully.

### Detector and typography decision

Reuse the independent CLI scan: **58 advisories**, comprising **55 font-size** and **3 literal-color** occurrences. The original 39 are exactly the shared stylesheet subset; Review adds 16. Every font occurrence is adjudicated in `font-disposition.md`. Retain documented Review 11–14px and Doto numeral 10–14px roles. Record actual body-role drift at shared styles lines 268/303/384/410 and undersized Review library metadata/filter tabs at Review CSS lines 278/271. No blanket 16px conversion, detector ignore, UI change or design-sidecar repair is authorized by this review.

Mutable injection preflight succeeded and `detect.js` ran on Storyboard, ShotSheet and Working Review, logging respectively 1, 3 and 1 browser advisories. These runtime checks differ from the CLI rules/counts. The flat-type-hierarchy warning requires contextual adjudication because dense editor roles intentionally occupy a small range. This was headless; no owner-visible overlay remains. The first pass was interrupted when the injected banner intercepted navigation; removing that diagnostic banner allowed navigation. The preserved interruption log describes tooling interference, not a product failure.

### Recorded follow-ups

Design: P1 continuous Working identity; P2 visible sheet submission, local Undo and alternate labels on comments. Technical: P2 desktop sheet height, focused typography role reconciliation, tab semantics/keyboard behavior, source-only nested audio controls and timeline pin silhouette/type; P3 warning tokens/shadow ink. No P0 was found. Suggested later sequence: `$impeccable clarify`, `$impeccable harden`, `$impeccable adapt`, `$impeccable typeset`, then `$impeccable polish`. These are recommendations, not work performed.

The owner targets a desktop editor. Small touch targets and narrow-view rough edges do not create a new mobile feature mandate. Screen-reader behavior, induced network errors, browser zoom, performance traces and the nested audio fixture remain untested. The stale `.impeccable/design.json`, legacy Save hint and newer inline-card implementation remain separate follow-ups.

### Verification and shutdown

Production build at `78db54a` passed with the existing 500 kB advisory. No application code changed, so the previously recorded 811-pass core result, typecheck and 46 browser tests were not rerun. Both new scripts close their browser and fixture server in `finally`; both processes exited. The review-only Impeccable server on port 8400 was stopped with `live-server.mjs stop`. It reported a missing live-injection config during tag cleanup; injection was browser-only, no source tag was written, and the browser was closed.

The shared checkout advanced separately to `fix/render-hidden-stage`; this review and its records were completed in `.worktrees/codex-run-cleanup` on the approved cleanup branch. No merge or push occurred. `main` remains `5f3a23d`; seeds remains `367c95e`.

Questions skipped: the approved cleanup scope records findings only; UI fixes and final merges require separate owner decisions.
