---
title: Generate or tweak, Direction, effects library and pinned effects
date: 2026-10-25
status: Draft
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
  - **Storyboard**: drag an effect onto a frame to pin it to a spot (numbered hex pin and footprint), onto a gap to plan a new shot, or onto the strip under a frame to try it as an alternate. Each pinned effect has a note, can be deleted (card, chip, Delete key) and undone. Nothing is built until the next build; pinned effects travel with it like a comment batch. Alternates keep the existing inline dots with a larger preview.
  - The saved choices (`direction`) travel in the request, so the agent reads them, and only the chosen style turns on its guidance and checks (`motion-craft.md` for Filmed 3D).
- Affected: `web/src/` (New reel, Simple mode Make, Storyboard, a new Direction and Library surface), `server/core/` (reel `direction` field, request building, pinned-effect batch items, templates listing), `skill/kinotta/` (reading `direction` and pinned effects), `DESIGN.md`, `CONTEXT.md`, possibly an ADR for pinned effects as batch items.
- Constraints: No style is enforced on every reel; presets are starting points and every value stays editable. Universal checks stay mechanical. A pinned effect is a request, not a Working change, until the agent builds it; Undo, frozen versions and the existing alternates fix (Review loads the chosen Working revision) must keep working. One light rule and the existing shell. Generate now must stay one step after the drop.
- Out of scope: Word editing and exact timing in Storyboard (they stay in Review). A separate Cut step. Building portrait reels (detection only; building depends on `docs/plans/2026-10-18-portrait-reels.md`, Draft). New effect templates. Render-side motion blur.
- Open questions:
  1. Answered 2026-10-25: Simple mode is the default; Direction is a new screen reached from Direct and replaces nothing.
  2. Answered 2026-10-25: both. "Save as my style" asks "for me" or "this project only". Your style is the starting point for every new reel; a project style overrides it there. Your style is a file in the home folder (for example `~/.kinotta/style.json`); a project style is a file in the project, read and saved by a new `server/core/_internal/style.ts` in the pattern of `agent-settings.ts`, through the API client. Simple mode's profile (browser storage, `kinotta-simple-options-v1`) folds into your style, migrated once on first load, so there is one personal style. Reason: browser storage is tied to the port, and Kinotta falls back to a random port when 4317 is busy, so saved defaults appear to vanish. No unmerged branch touches `simple-options.ts`, `SimpleMode.tsx`, `agent-settings.ts` or `requests.ts` (checked 2026-10-25).
  3. Answered 2026-10-25: both, decided per pin. A pin is **Instant · free** when its effect needs nothing picked from the speech (for example Title card from the reel title, Section tag from the section name) and it has no note: Kinotta fills the template with `fill` and the style's `--fx-font`, `--fx-ink` and `--fx-accent` and runs `engine/build.py` locally, with no agent and no tokens (build.py imports only the standard library and local modules, checked 2026-10-25). A pin **Needs the agent** when the effect picks words or items from the speech (Big word, Checklist) or when it has a note; writing a note moves an instant pin to the agent, clearing it moves it back. All agent pins go in one run with the next build. Effect cards and pins show which kind they are, and Build shows the count and "1 agent run". To keep it free: instant pins go through their own server path that never reaches the agent runner, with a test that fails if an instant pin creates an agent job. Storyboard only in the first version; Direction's effects feed the first build, and Simple preview and Review pins carry notes, so they use the agent anyway.
  4. Answered 2026-10-25: Auto starts with the saved style alone; the "Always do this?" rules (Simple mode flow plan, Phase 6, `~/.kinotta/taste.md`) come later and add to it. When they ship, the bare "Always do this?" is not enough on its own: the prompt names what will happen, quotes the note, and says where to undo it. Proposed wording, shown after a pin note has been built:
     - Heading: "Use this note on every reel?"
     - The note, quoted: "Keep captions low, under my chin"
     - Explanation: "Kinotta will follow it on every new reel, as part of your style. It won't change reels you've already made. You can see or remove it anytime in Your style → Rules."
     - Buttons: "Yes, every reel" and "Just this reel" (the default; ignoring the prompt means just this reel).

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-25
- Plan created as Intent only, from the mockup session with the owner. Four mockups saved under `docs/mockups/2026-10-25-*`. Waiting for approval of the Intent before the rest is filled.
- Q4 answered: Auto ships with the saved style alone; "Always do this?" gets a fuller prompt (what it does, the note, where to undo) when it ships.
- Q3 answered: instant and free pins when nothing is needed from the speech and there is no note, otherwise one agent run with the next build; Storyboard only. Mockup `docs/mockups/2026-10-25-pinned-effect-instant-or-agent.html`.
- Q2 answered: personal and project style as files; Simple mode's browser-stored profile folds into the personal style.
- Second mockup session: Q1 answered; Direction split into five steps with a visual Check; own font and music; entry choices renamed Auto / Direct and Export / Edit with both paths promoted. Saved `docs/mockups/2026-10-25-simple-default-direction.html`.
