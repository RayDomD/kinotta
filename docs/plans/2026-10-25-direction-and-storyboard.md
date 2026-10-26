---
title: Generate or tweak, Direction, effects library and pinned effects
date: 2026-10-25
status: Done
summary: Start a reel with Auto or Direct; Direct adds a five-step Direction with presets and a Storyboard where effects are dragged and pinned, not built.
spec: docs/mockups/2026-10-25-simple-default-direction.html, docs/mockups/2026-10-25-pinned-effect-instant-or-agent.html, docs/mockups/2026-10-25-start-generate-or-tweak.html, docs/mockups/2026-10-25-direction-step.html, docs/mockups/2026-10-25-effects-library.html, docs/mockups/2026-10-25-storyboard-pinned-effects.html
---

## Intent

- Problem: A reel's look depends on what someone types in a free-text brief and on which questions the agent happens to ask; nothing records it. The brief path for code-built reels is a name and a text box. Simple mode's type cards and dials cover footage only. Kinotta's 25 effect templates (`skill/kinotta/templates/effects`) never appear in the app, so an owner cannot ask for one by seeing it. A first draft can come out flat when the owner wanted something else, and the only fix is a comment round.
- Why: The owner's 2026-10-25 trial showed the agent can reach a much higher bar when told what is wanted (`docs/plans/2026-10-25-motion-graphic-quality.md`). The gap is capturing what is wanted before the build, without forcing one style on every reel and without slowing down people who just want their video edited.
- Proposed outcome, from the mockup session with the owner (2026-10-25):
  - Simple mode is the default. After a video is dropped, two equal choices named as a process: **Auto** (uses the saved style, or Kinotta picks for a first reel; goes straight to a first cut) or **Direct** (opens Direction). After the first cut, **Export** and **Edit** (opens the full editor) sit side by side. Auto and Export are filled buttons; Direct and Edit use a neutral raised panel with a soft border, never greyed out, because the owner wants both paths promoted. A reel with no footage starts from a short brief. (Superseded names: Generate now, Tweak first, Open in editor.)
  - **Direction** (Direct) runs as five steps with a clickable stepper, "So far" chips and "Build now with these" on steps 1–4: 1 What (form, video, What's it about?, Frame) · 2 Style (cards; the settings folded under "Fine-tune the details") · 3 Fonts and music · 4 Extras (effects to try, "Shots and details you want") · 5 Check, a visual recap with one row per decision, a thumbnail and Change, beside "What the agent is told". Contents: what you are making (Talking video, Interview, Tutorial, Product demo, Vlog, Launch, Explainer, Showreel, Let Kinotta decide); Frame detected from the video (portrait, landscape, square); Style for video forms (Clean, Creator, Editorial, Match a reference) or Look for code-built forms (Flat 2D, Layered 2D, Filmed 3D, Match a reference); settings filled in by that choice and marked "yours" when changed; Fonts in plain words; effects to try; "Shots and details you want"; "What the agent is told"; Save as my style. The brief folds into it as "What's it about?", required only without footage.
  - **Own font and music**: a drop card in the Fonts and Music rows; files dropped anywhere on Direction or Library are routed by type. A font shows a sample line and "Use it for: Words / Numbers / Both"; it is copied into the project `fonts/` with a license note. Music shows a waveform with play and seek, "Cut on its beat / Play under the cut" and "Lower it under your voice"; it is saved to project music with a rights note. Library's Sounds tab lists the 17 sounds plus "Your music". Bundled samples must be redistributable (open-source intent).
  - **Effects library**: the 25 templates by category with a looping preview, what each needs, which forms it works with, a copyable request and favourites; tabs for looks, camera moves, transitions and the 17 existing sounds.
  - **Storyboard**: drag an effect onto a frame to pin it to a spot (numbered hex pin and footprint). On a shot with alternates, the effect goes onto the alternate the card is showing; it does not change which alternate is in the reel. A gap between shots offers "Insert shot", which opens a comment describing the new shot. Each pinned effect has a note, can be deleted (card, Delete key) and undone. Agent pins and inserted shots wait for the next build and travel with it like a comment batch; instant pins are made at once (answer 3). Alternates keep the existing inline dots and come only from a comment asking for options. (Revised 2026-10-26: gap drops and drops on the alternates strip are out.)
  - **Brand and Style**, the only two ideas the app shows. **Brand** is the project's colours, fonts and logo, read from `DESIGN.md` through `reels/brand.md`; a project without `DESIGN.md` uses Kinotta's **built-in brand** (plain default fonts and colours, redistributable, for example OFL Google Fonts), so a beginner with only a video can build. **Style** is everything else: look, pace, captions, effects and rules. Every reel has its own style. A style can be saved under a name, either for you (home folder) or with the project, and reused on another reel as a **copy**, never a link, so editing one reel never changes another. One saved style is marked default and is what Auto uses. Kinotta ships **built-in styles** (the presets: Clean, Creator, Editorial; Flat 2D, Layered 2D, Filmed 3D), read-only; changing one makes your own copy. Until you save a style, Auto uses the built-in one that fits the video type. Brand and Style own different things, so they never compete: Fonts shows the brand fonts preselected ("from your brand") and a reel can change them.
  - **Rules live in a style.** A note you want kept ("Keep this note in this reel's style?") becomes a rule in that reel's style only. It reaches other reels when you reuse the style or save it as yours or the project's. The skill's taste lists move into styles: `~/.kinotta/taste.md` into your default style, `reels/taste.md` into a style saved with the project. Active rules show in Direction's Check step under "What the agent is told", each with a switch to turn it off for this reel.
  - The saved choices (`direction`) travel in the request, so the agent reads them, and only the chosen style turns on its guidance and checks (`motion-craft.md` for Filmed 3D).
- Affected: `web/src/` (New reel, Simple mode Make, Storyboard, a new Direction and Library surface), `server/core/` (reel `direction` field, request building, pinned-effect batch items, templates listing), `skill/kinotta/` (reading `direction`, the reel style and pinned effects; SKILL.md sections 2 and 3 move from the taste lists to styles and fall back to the built-in brand instead of stopping when `DESIGN.md` is missing), built-in styles and brand as shipped files, `DESIGN.md`, `CONTEXT.md`, possibly an ADR for pinned effects as batch items.
- Constraints: No style is enforced on every reel; presets are starting points and every value stays editable. Universal checks stay mechanical. An agent pin is a request, not a Working change, until the agent builds it; an instant pin changes Working when it is made, as an undoable edit; Undo, frozen versions and the existing alternates fix (Review loads the chosen Working revision) must keep working. One light rule and the existing shell. Generate now must stay one step after the drop.
- Out of scope: Word editing and exact timing in Storyboard (they stay in Review). A separate Cut step. Building portrait reels (detection only; building depends on `docs/plans/2026-10-18-portrait-reels.md`, Draft). New effect templates. Render-side motion blur.
- Open questions:
  1. Answered 2026-10-25: Simple mode is the default; Direction is a new screen reached from Direct and replaces nothing.
  2. Answered 2026-10-25 (revised the same day into Brand and Style, above): a style is saved under a name, for you (a file under the home folder, for example `~/.kinotta/styles/<name>.json`) or with the project (for example `reels/styles/<name>.json`); each reel keeps its own copy. Read and saved by a new `server/core/_internal/style.ts` in the pattern of `agent-settings.ts`, through the API client. Simple mode's profile (browser storage, `kinotta-simple-options-v1`) migrates once into your default style. Reason: browser storage is tied to the port, and Kinotta falls back to a random port when 4317 is busy, so saved defaults appear to vanish. No unmerged branch touches `simple-options.ts`, `SimpleMode.tsx`, `agent-settings.ts` or `requests.ts` (checked 2026-10-25).
  3. Answered 2026-10-25: both, decided per pin. A pin is **Instant · free** when its effect needs nothing picked from the speech (for example Title card from the reel title, Section tag from the section name) and it has no note: Kinotta fills the template with `fill`, the style's `--fx-font` and the Brand's `--fx-ink` and `--fx-accent` (clarified 2026-10-26: Brand owns colours) and runs `skill/kinotta/engine/build.py` locally, with no agent and no tokens (build.py imports only the standard library and local modules, checked 2026-10-25). A pin **Needs the agent** when the effect picks words or items from the speech (Big word, Checklist) or when it has a note; writing a note moves an instant pin to the agent, clearing it moves it back. All agent pins go in one run with the next build. Effect cards and pins show which kind they are, and Build shows the count and "1 agent run". To keep it free: instant pins go through their own server path that never reaches the agent runner, with a test that fails if an instant pin creates an agent job. Storyboard only in the first version; Direction's effects feed the first build, and Simple preview and Review pins carry notes, so they use the agent anyway.
  4. Answered 2026-10-25: Auto starts with the default style alone. Keeping a note as a rule (Simple mode flow plan, Phase 6, there written as "Always do this?" into `~/.kinotta/taste.md`) comes later and is changed by this plan: the rule goes into the reel's style, not a global file, because a global rule reaches every reel and goes wrong where it does not fit (a "under my chin" caption rule on a product demo), piles up conflicting rules, and drifts out of sight. A bare "Always do this?" also confuses. Proposed prompt, shown after a pin note has been built:
     - Heading: "Keep this note in this reel's style?"
     - The note, quoted: "Keep captions low, under my chin"
     - Explanation: "Kinotta will follow it on later versions of this reel. To use it on other reels, reuse this style or save it as yours. You can see or turn off rules in the Check step."
     - Buttons: "Always for this reel" and "Only this version" (the default; ignoring the prompt means only this version). Revised 2026-10-26 from "Keep it" and "Just this time".

## Goal

An owner can make a reel in one click (Auto) or say what they want first in five short steps (Direct), and what they chose is recorded as the reel's style and read by the agent. Kinotta works with no setup: a built-in brand and built-in styles cover a project with only a video. The 25 effect templates are visible in a Library and can be dragged onto Storyboard shots; effects that need nothing from the speech are made instantly and for free, the rest go in one agent run with the next build. Styles are saved by name, reused as copies, and hold the rules the owner chose to keep.

## Approach

Build from the data outward, so every screen reads one thing:

- **Style is one record.** A style holds the Direction choices (form, look, settings marked "yours", fonts, music, effects to try, shots wanted) and its rules. Saved styles are JSON files: yours under `~/.kinotta/styles/`, a project's under `reels/styles/`. Each reel stores its own copy beside its state. Built-in styles and the built-in brand ship as read-only files with Kinotta. One new server module, `server/core/_internal/style.ts`, reads, validates, saves and copies them, following `agent-settings.ts` and `make-options.ts` (runtime validation at the boundary, atomic writes). The web app reaches it only through `web/src/api/_internal/client.ts`.
- **Make takes a style.** Today Simple mode's Make sends `MakeOptions` (`videoType`, `broll`, `captions`, `pace`, `notes`) to `POST /api/reels`. Auto sends the default style; Direct sends the style built in Direction. `MakeOptions` stays accepted so nothing breaks; a style maps onto it for the footage build, and the full style goes into the agent request so "What the agent is told" is exactly what the agent receives.
- **Pinned effects reuse comments.** A comment already has a frame or word pin and goes to the agent in a batch (`batch.ts`). A pinned effect is a comment with an `effect` id. Agent pins ride the existing batch, so Undo, frozen versions, carry-over and the alternates fix keep working. Instant pins take a separate server path that fills the template and runs `skill/kinotta/engine/build.py`; it never imports the agent runner.
- **The skill reads styles.** SKILL.md section 2 falls back to the built-in brand instead of stopping when `DESIGN.md` is missing; section 3 reads the reel's style and its rules instead of the taste lists. Existing taste lists are migrated, not deleted.
- **UI follows the saved mockups** in `spec`, on the existing shell and one light rule. Auto and Export are filled buttons; Direct and Edit use the neutral raised style.

Each phase below is its own branch and PR, shippable alone, in this order because later phases read what earlier ones store.

## Steps

### Phase 1: Style storage, built-ins and brand fallback
1. Define the style shape and its validator in `server/core/_internal/style.ts`; export it through `server/core/index.ts`.
2. Ship built-in styles (Clean, Creator, Editorial; Flat 2D, Layered 2D, Filmed 3D) and a built-in brand with redistributable fonts; record each font's license.
3. Read, list, save by name (you or project), copy onto a reel, and mark a default. Routes in `server/http/_internal/handler.ts`; calls in the API client.
4. Migrate once: Simple mode's browser profile (`kinotta-simple-options-v1`) into your default style; `~/.kinotta/taste.md` into your default style's rules; `reels/taste.md` into a project style. Old files stay in place, marked migrated.

### Phase 2: Auto and Direct
5. Make screen: Auto and Direct, as in `2026-10-25-simple-default-direction.html`. Auto uses the default style, or the built-in that fits the video type.
6. Simple preview: Export and Edit side by side, Edit opening the full editor.
7. `POST /api/reels` accepts a style; the reel stores its copy; the agent request includes it.

### Phase 3: Direction
8. The five steps with stepper, "So far" chips and "Build now with these"; Style step with built-in and saved styles, "Start from another reel" (copy), and "Fine-tune the details".
9. Fonts and music: brand fonts preselected, own font and music drop with license and rights notes, music fit and ducking options.
10. Check step: the visual recap, "What the agent is told" including active rules with a per-reel switch, and Save as my style (for you or this project).

### Phase 4: Effects library
11. A templates listing on the server from `skill/kinotta/templates/effects`, marking each effect instant or agent (instant when its `fill` needs nothing picked from the speech).
12. Library page: categories, looping previews, what each needs, forms it fits, copyable request, favourites; Sounds tab with the 17 sounds and your music.

### Phase 5: Storyboard pinned effects
13. Drag an effect onto a frame, per `2026-10-25-storyboard-pinned-effects.html` for appearance and `2026-10-26-pinned-effects-behaviour.html` for behaviour, where this step overrides it: no drops on gaps or the alternates strip; on a shot with alternates the effect goes onto the alternate the card is showing. A gap between shots offers "Insert shot", which opens a comment describing the new shot, always sent to the agent with the next Build and never followed by "Keep this note". Pins with notes, Delete and Undo. On a phone, pins show and can be deleted and undone, but adding a pin needs a computer.
14. Instant pins: their own server path fills the template in the reel's style and runs `build.py` locally. Agent pins and any pin with a note: saved as comments with an `effect` id and sent in the next batch. The build button shows the count and "1 agent run", as in `2026-10-25-pinned-effect-instant-or-agent.html`.

### Phase 6: Skill and rules
15. SKILL.md sections 2 and 3: built-in brand fallback, reel style and rules in place of the taste lists; `direction` and pinned effects read from the request.
16. "Keep this note in this reel's style?" after a built pin note, with the wording above; rules added to the reel's style. Point the Simple mode flow plan's Phase 6 at this plan.
17. Update `CONTEXT.md` (glossary: Brand, Style, built-in style, rule, pinned effect, instant pin) and `DESIGN.md`; an ADR for pinned effects as comments with an `effect` id.

## Risks

- **Migration loses taste.** Moving browser profiles and taste lists could drop a setting. Mitigation: copy, never delete, and a test per source.
- **A "free" pin quietly costs tokens.** Mitigation: the instant path cannot import the agent runner, and a test fails if an instant pin creates an agent job.
- **Instant output looks worse than agent output.** Template fill only sets words, font and colours. Mitigation: pins show which kind they are; a note always routes to the agent.
- **Built-in fonts we may not redistribute.** Mitigation: OFL or similar only, license recorded in Phase 1.
- **Style drift between the request and the UI.** Mitigation: "What the agent is told" is rendered from the same style record that goes into the request.
- **Comment batch changes break alternates or carry-over.** Mitigation: run the existing alternates and batch suites in Phase 5.

## Checks to run

- Per phase: `npm run typecheck`, `npm test`, and the relevant `npm run test:e2e` specs.
- Phase 1: unit tests for validation, save, copy, default and each migration; a project with no `DESIGN.md` builds with the built-in brand.
- Phases 2 and 3: browser checks of Auto, Direct, every Direction step, Save as my style, and Start from another reel at desktop and phone width.
- Phase 5: the instant-pin no-agent test; `tests/core/batch.test.ts` and the `alternates-*` suites; Undo and Delete on pins in the browser at desktop width, and pins shown with Delete and Undo at phone width.
- Phase 6: a footage reel and a code-built reel built from a style, with the request showing the style and rules.

## Result

Shipped as planned, phase by phase: style storage, built-in styles and built-in brand (#68), Auto, Direct and Direction (#69), the skill reading styles and rules (#70), the effects library (#71), Storyboard pinned effects with "Keep this note" (#77), and the Phase 6 check, #69 nits and `DESIGN.md` sections on the closing branch. This answers the Intent: a reel starts in one click or after five short steps, its style is recorded and is exactly what the agent is told, and effects can be seen and pinned.

Deviations, all owner decisions: no effect drops on gaps or the alternates strip (a gap offers Insert shot instead); adding an effect is drag only, with a keyboard path left as a follow-up; Library's "Your music" and "Add to this reel" are deferred, and the Looks, Camera moves and Transitions tabs are placeholders; the Phase 6 check is request-only, without a real agent build.

Checks: each phase's PR records its own. The last runs were the verify gate on #77 (Playwright 162 passed, typecheck and mojibake ok, one `render` load flake that passed alone 9/9) and, on the closing branch, typecheck, `check:docs`, `check:commits` and the unit project (113 files, 986 passed, 6 skipped).

## Changelog

### 2026-10-25
- Plan created as Intent only, from the mockup session with the owner. Four mockups saved under `docs/mockups/2026-10-25-*`. Waiting for approval of the Intent before the rest is filled.
- Intent approved by the owner. Goal, Approach, Steps (six phases), Risks and Checks written; waiting for approval of the plan.
- Brand and Style: the app shows only Brand (`DESIGN.md`, or a built-in brand when missing) and Style (per reel, saved by name, reused as a copy, one default for Auto, built-in read-only styles). Rules live in a style; the taste lists move into styles. Q2 and Q4 revised to match.
- Q4 answered: Auto ships with the saved style alone; "Always do this?" gets a fuller prompt (what it does, the note, where to undo) when it ships.
- Q3 answered: instant and free pins when nothing is needed from the speech and there is no note, otherwise one agent run with the next build; Storyboard only. Mockup `docs/mockups/2026-10-25-pinned-effect-instant-or-agent.html`.
- Q2 answered: personal and project style as files; Simple mode's browser-stored profile folds into the personal style.
- Second mockup session: Q1 answered; Direction split into five steps with a visual Check; own font and music; entry choices renamed Auto / Direct and Export / Edit with both paths promoted. Saved `docs/mockups/2026-10-25-simple-default-direction.html`.

### 2026-10-26
- Phase 1 merged: style storage (#68).
- Phases 2 and 3 merged: Auto, Direct and Direction (#69). Review nits left open: `server/core/_internal/direction.ts:99` asserts a frame match with `!`, and line 101 prints `undefined` for an unknown settings key.
- Built-in brand (Phase 1 step 2) and the skill reading styles and rules (Phase 6 steps 15 and 17) merged as one cleaned branch (#70). Both fonts are OFL 1.1.
- Phase 4 effects library open as #71. On narrow screens a rail Library button pushed Current out of the rail; removed, the top bar Library button is the entry point. The owner deferred "Your music" in the Sounds tab and "Add to this reel"; the Library wording now promises only Copy request.
- Seven Playwright tests fail on `main` independent of this plan: `brief-reel:59`, `drop-video:19`, `new-reel:21`, `section-batches:62`, `snip-save:55`, `snip-save:271`, `snip-save:379`. Needs its own fix.
- #71 merged; the test fixes (#74) and two-worker local runs (#75) merged after it.
- Phase 5 decisions with the owner, tried in a behaviour mockup (`docs/mockups/2026-10-26-pinned-effects-behaviour.html`): effects drop on a frame only. A gap offers "Insert shot", a comment describing the new shot, always sent with the next Build and never asking "Keep this note". There is no drop on the alternates strip, because alternates come only from a comment asking for options; on a shot with alternates the effect goes onto the alternate the card shows. An instant pin is made and put in Working at once, as an undoable edit, not on Build. The "Keep this note" buttons are "Always for this reel" and "Only this version". On a phone, pins can be seen, deleted and undone, not added.

- Step 13 (2026-10-26): implemented frame-only Storyboard effect drops on the shown alternate, pin notes/Delete/Undo, Insert shot comments and 390px deletion/Undo without adding controls. Desktop/phone pin checks and all 15 alternate browser checks pass; ordinary comment/section compatibility checks pass. Complete branch verification is recorded in the pinned-effects brief.
- Step 14 (2026-10-26): instant output uses an agent-free build-runner shared with the existing runner, Style fonts and Brand colour tokens. Only instant pins change Working; agent pins and inserted shots stay ordinary comments. Hand-offs exclude instant pins, preserve effect ids, and show the waiting count with one agent run. No-agent, note-transition, batch and non-resurrection checks pass.
- Step 16 (2026-10-26): implemented the exact keep-note prompt for built effect notes only. Accepted rules enter the reel's private Style copy; Only this version and ignoring through the next Build add no rule and do not repeat the prompt. Decisions live at reel level, never in a version folder. Prompt, persistence and ordinary/inserted-comment exclusion checks pass.

- Follow-up (owner decision, 2026-10-26): adding an effect stays drag only in this PR. A keyboard way to add one, like "Pin an element" for comments, is left for a later change.

- Found during this work (2026-10-26), owner-approved reel-listing fix: a temporary file disappearing between directory enumeration and stat no longer prevents the reel list from loading. Only ENOENT is skipped; other stat errors still surface, and a reel with no remaining files uses its folder timestamp. Added a regression that deletes a real file during the scan and a permission-error check; final verification is recorded in the pinned-effects brief.

- Phase 6 check (2026-10-26): run as request-only by owner decision; no real agent build. Test: `Phase 6 request-only: footage and brief requests carry every style line and rule from one saved project style` in `tests/core/reel-style.test.ts`. Both reels start by the id of the same saved project style; each request contains every `agentTold` line for its reel copy. Footage also verifies the persisted job's style and told lines and reaches `copy-ready` with provider `copy`.
  - Footage request excerpt: `Form: vlog. Sparse graphics; keep it real over polished.` / `Style: clean. The speaker stays the picture; tags small and brief.` / `Frame: Landscape 16:9, found in the video.` / `Rule: "Keep captions low".`
  - Brief request excerpt: `Form: vlog. Sparse graphics; keep it real over polished.` / `Style: clean. The speaker stays the picture; tags small and brief.` / `Rule: "Keep captions low".` The brief path deliberately reuses the same saved style unchanged.
- #69 review nits fixed (2026-10-26): an unknown frame omits the Frame line without throwing; an unknown setting label falls back to its key. Each regression failed before its fix and passed afterwards. Scoped unit suite: 8 tests passed.
- `DESIGN.md` gains Auto and Direct, Direction, Library and Pinned effects sections, from the shipped code and the mockups (step 17's missing half; owner decision to add it before closing). Plan closed as Done; Result filled.
- Follow-up, not fixed (owner decision 2026-10-26): agy's final review of pinned effects left three nits. `server/core/_internal/instant-effect.ts:40` style; `savePinComment` takes the same lock key twice (`comments.ts:167`, `edit-list.ts:133`); "+ Insert shot" lacks an aria-label naming the transition (`web/src/Storyboard.tsx:238`).
