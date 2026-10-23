---
title: Motion taste and templates from Prompt Motion
date: 2026-10-23
status: Approved
summary: Turn what prompt-motion.com's gallery analysis shows about strong AI motion graphics into Kinotta taste rules, a reel brief shape, and a few new clean-room effect templates.
spec: docs/research/2026-10-23-prompt-motion.md
---

## Intent

- Problem: Kinotta's taste list (`~/.kinotta/taste.md`) and its 17 effect templates (`skill/kinotta/templates/effects/`) already cover a lot of what makes AI motion graphics good: easing, staggers, one peak, no repeated device. They miss several lessons from prompt-motion.com's analysis of about 230 public Opus 5.5 motion videos and their prompts:
  - A ban only works with a "do this instead" beside it. A crossfade should become a morph or a recurring motif.
  - Each reel needs one governing concept named in a single line.
  - Cuts and changes should land on a beat grid.
  - Corner text and labels that carry no information should go.
  - Nothing should look like a template.
  - Before the full render, check one still per beat.
  - Brief inputs (product, promise, moments, format) should be asked for up front.
  - Explainers are best built as a process with a start and an end.
  There are also no templates for the transitions the analysis credits with avoiding the "AI look": one element morphing through states, and a motif carried between shots.
- Why: The site's own experiment shows a short, undirected prompt gives anywhere from 0 to 17,000 likes on identical text. Direction (concept, bans with alternatives, beat timing, a review step) is what narrows that. Every Kinotta build reads the taste list first, so it is the cheapest place to raise every reel.
- Proposed outcome:
  - A research note recording what the site says, with its source pages.
  - Taste-list additions for the missing rules, one line each, in the existing groups.
  - A reel brief shape the skill asks for, per video type (explainer, launch, showreel).
  - Nine new optional effect templates: shape morph, motif carry, letter swap, beat showreel, phone, chart, diagram, film look and presenter split.
  - A reference-analysis step, choice sheets for fonts and palettes, and measurable motion rules and checks (borrowed as techniques from two outside skills, added 2026-10-23).
  - The skill points to the brief shape and to a per-beat still check that uses the existing `beats.js`.
- Affected: `docs/research/2026-10-23-prompt-motion.md` (new), `~/.kinotta/taste.md`, `skill/kinotta/SKILL.md`, `skill/kinotta/reference/motion-broll.md`, `skill/kinotta/templates/effects/` (new folders plus `README.md`).
- Constraints:
  - **Clean room.** The site gives no licence and says videos and prompts belong to their creators. Copy no prompt text, video, code or asset. Write our own rules and templates from the techniques described, and credit the site as a source in the research note only.
  - **Timing contract.** All motion is computed in `seek(t)`. No CSS transitions, timers or `Math.random`. Any seek gives the same frame.
  - Templates take colour and type from the brand file, like the existing ones.
  - No engine changes (`skill/kinotta/engine/**`). Editor chrome (`DESIGN.md`) is untouched.
  - The taste list is the owner's. Codex drafts the additions in the plan; the owner approves before they are written.
- Out of scope:
  - Three.js or 3D templates, and switching render tools (Remotion, HyperFrames). Kinotta keeps its own engine.
  - Generated soundtracks. Moved to `2026-10-23-synth-score-and-effects.md`.
  - Scraping the gallery's 200 entries one by one.
- Open questions (one at a time):
  - O1: Resolved 2026-10-23. The templates are shape morph, motif carry, letter swap and beat showreel, plus phone, chart and diagram added later the same day. All are optional: a build may start from one, but the skill never requires them, and no rule or check fails a reel for not using them.
  - O3: Resolved 2026-10-23. Owner added the borrowed methods (reference analysis, choice sheets, motion rules and checks) and two templates (film look, presenter split), learned from the `editorial-film-edit` and `paper-collage-film` skills. Neither states a licence, so this is clean room: techniques only, no code, text or media from either package. Comparison: `docs/mockups/2026-10-23-skills-compare.html`.
  - O2: Resolved 2026-10-23. Beat timing applies only to reels with music. Talking-head and speech-led reels keep pacing from speech and reading time.

## Goal

1. The research note exists and lists each source page with what it claims, and separates measured findings from the site's own caveats (likes depend on audience, small samples).
2. The taste list gains only rules it lacks, each with its "instead," and nothing duplicates an existing line.
3. The skill asks for a concept line and the brief inputs for the video type before building, and checks one still per beat before a full render.
3a. When the owner gives a reference video, the skill analyses it before building: frames at 12 per second, a contact sheet, cut times, motion curves and colours, and each device mapped to a template or marked new.
3b. For an open font or palette choice, the skill renders six to eight candidates in the real treatment and the owner picks one by number.
3c. The taste list or the skill's checks carry measurable motion rules, and the build checks them before hand-over.
4. Each of the nine new templates renders in Kinotta, seeks to the same frame twice, reads brand colour and type, and is listed in the effects `README.md`.

## Approach

Research first, then rules, then templates. The site's evidence is mostly about direction, so the rules and brief shape carry most of the value. Templates come last and stay few. A template only earns a place when it gives a device the existing 17 lack, which here means designed transitions.

Draft rules, as starting points for the owner to edit:

- Name the reel's one concept in a single line before building. Every shot serves it.
- Every ban has an alternative. Use a morph or a carried motif instead of a crossfade, and a real label or nothing instead of corner text.
- On a reel with music, place cuts and state changes on a beat grid from its tempo. Hold only as long as reading needs.
- A label in the frame carries information, or it goes.
- Outgoing and incoming text get their own timing and never overlap.
- A full-frame shape extends past all four corners.
- A looping reel's last frame matches its first.
- Never `will-change` on a scaled element that holds text (it blurs the text).
- If it looks like a template, change it.

### Proposed taste additions

Step 2 draft only, pending owner approval. These are the proposed additions to `~/.kinotta/taste.md`; the earlier draft bullets are context, not an additional approved set. Evidence and limitations are in `docs/research/2026-10-23-prompt-motion.md`. No taste or skill file has been edited.

| Group | New line | Overlapping existing line (or none) |
|---|---|---|
| Shape | For an explainer, map the subject into ordered changes with a visible starting condition and result before designing shots. | "One idea per shot." applies within a shot; this adds the sequence across shots. |
| Shape | When a reel is intended to loop, return every visible element to its opening position and motion at the seam; replace a jump back with a designed return. | "The ending holds on a finished frame. Never fade to an empty stage." covers an ending, not loop continuity. |
| Motion | Replace a default dissolve between designed scenes with a changing shape or a visual detail that continues into the next scene; keep each shot's device distinct. | "Don't repeat a component across shots." still applies to layouts and devices; carrying a linking detail does not license repeating the whole component. This adds a transition choice. |
| Motion | On music-led reels, derive an event grid from the track's tempo and align cuts and state changes to it; in speech-led reels, keep speech and reading time in control even when music is present. | "Small in-shot moves (a tag, a tick, a card) finish within 500ms; scene pacing follows the reel's clock." sets duration, not musical alignment. Existing reading holds still apply; O2 protects speech-led timing. |
| Type | When replacing text inside a changing container, finish the old text's exit before revealing its replacement; use separate visibility intervals instead of superimposing both. | "Headlines arrive line by line or word by word, not as one block." governs arrival order, not replacement collisions. |
| Type | Keep `will-change` off text and its scaled ancestors; use the transform without that hint and inspect the enlarged letters for sharpness. | none; this gotcha already exists in `reference/motion-broll.md`, but not in the global taste list. |
| Refuse | Remove edge readouts and small labels that add no meaning; show a relevant name or value there only when it helps explain the scene. | "No gradient text, decorative glass, or a label above every title." and "Section numbers only when the order is information the viewer needs." address narrower cases. Informative corner overlays remain allowed. |
| Refuse | When adding a prohibition to a reel's direction, name the usable replacement beside it so the builder has an action to take. | none; several existing bans include alternatives, but the list has no general requirement to supply one. |

Duplicate review: compared every proposed line against all 50 existing taste bullets, both as normalized text (case, whitespace and punctuation ignored) and by meaning against the nearest rule shown above. No exact normalized duplicate remains. Partial overlaps are explicit in the table. The existing viewer-facing concept test already supplies a governing idea, and the existing device-variety rule already rejects repeated template structure; neither receives another line. Reading holds and decorative-effect bans are also retained without additions. The unsupported full-frame-corner draft is omitted; see the research note. Brief inputs and still-review instructions stay in step 4 rather than becoming duplicate taste guidance.

Phase 1 checks: all eight source pages loaded; the research note has a section for each, dataset dates and caveats. The proposed lines are paraphrases. Only the research note and this plan were edited in this run; pre-existing workspace changes remain outside this task. Steps 3–6 have not started. Owner approval of this table is the next gate.

- [x] Research note exists with eight source sections, dataset size, dates and caveats.
- [x] Proposed-additions table records each group, new line and nearest existing rule; prohibitions include an alternative.
- [x] Eight proposals checked against 50 existing taste bullets: zero normalized duplicates; semantic overlaps reviewed above. A sentence search across the fetched source text found no verbatim matches among 89 prose sentences of at least six words in the note and proposed subsection, excluding headings, links and table rows; the table was reviewed separately.
- [x] Scope checked against the starting workspace: the plan contains only the authorized subsection and Changelog insertions, and the research note is the only new status entry. Hashes for 133 protected files (the skill tree, taste list, dashboard and brief) are unchanged. Existing unrelated changes were left intact. The brief itself remains untouched under its two-file limit.

## Steps

1. **Research note.** Write `docs/research/2026-10-23-prompt-motion.md` from these pages: `/`, `/templates`, `/templates/showreel`, `/blog/ai-motion-graphics-prompts`, `/blog/make-ai-motion-graphics-look-less-ai`, `/blog/ai-explainer-video-prompts`, `/blog/ai-launch-video-prompts` and `/blog/remotion-vs-hyperframes`. Paraphrase only. Note dataset size and dates (about 230 prompts, Sep 23 to Oct 10, 2026) and the site's caveats.
2. **Taste diff.** Compare the note to `~/.kinotta/taste.md`. Put the proposed additions into this plan as a list of the group, the new line and the existing line it overlaps (if any). Stop for owner approval.
3. **Write approved rules** into `taste.md`, one line each, in their groups.
4. **Brief shape.** In `skill/kinotta/SKILL.md` and `reference/motion-broll.md`, add the concept line and per-type inputs:
   - Explainer: audience, ordered steps, length (about 5 s per idea), style, a fact check.
   - Launch: product and promise, 3 to 5 moments in order, brand hex and font, tempo, the ending.
   - Showreel: concept, tempo and bars, techniques.
   Ask the format (for example 9:16) when not given. Add the per-beat still check using the existing `scripts`/`beats.js` contact sheets.
5. **Templates**, one folder each under `templates/effects/`, matching existing ones' structure and `shared.css`/`presets.css`:
   - `shape-morph`: one shape moves through several states (circle → bar → frame) with position kept continuous. It is the transition between shots.
   - `motif-carry`: an element from shot A's end becomes shot B's start.
   - `letter-swap`: a word changes letter by letter, with separate exit and enter timing.
   - `beat-showreel`: a skeleton that places events on a tempo grid, takes the hook in bar 1 and ends on a frame matching the first.
   - `phone`: an app screen in a phone frame that scrolls and taps through given screens or screenshots.
   - `chart`: a bar or line chart that builds from a data list in the plan, with real labels and no made-up numbers.
   - `diagram`: a process flow whose boxes and arrows draw step by step, for explainers.
   - `film-look`: an optional finish over a shot: grain that changes every frame (computed from the frame index, never a sliding texture), light bloom and vignette, with a black-and-white option. Kept light, since heavy blur caused the v16 stutter; check playback stays smooth.
   - `presenter-split`: the insert slides in from one side and the speaker is re-cropped, never squeezed, as a sibling of `framed-speaker`.
   All nine templates are optional.
5a. **Borrowed methods** in `skill/kinotta/SKILL.md` and `reference/motion-broll.md`:
   - Reference analysis: when a reference is given, extract 12 fps frames and a contact sheet with the existing scripts, write cut times, motion curves, colours and a device map into the reel's notes, and take technique from the reference and story from the brand.
   - Choice sheets: for an open font or palette, render six to eight candidates in the real title treatment as one numbered sheet and ask the owner to pick one.
   - Motion rules, proposed as taste lines for owner approval with step 2's table: drop-ins land in about three steps plus one small settle; a push into a detail zooms exponentially toward it; transitions travel through an object rather than a plain cut or fade; no full-frame flicker.
   - Checks before hand-over: tags on screen at least 0.8 s and titles at least 1.5 s, nothing covers the speaker or key words, and a short test on a light and a dark ground before a full render.
6. **README and checks.** List the nine in `templates/effects/README.md`. Run the checks below and record results here.

## Risks

- Likes are a weak signal (audience size, timing). Rules rest on the site's reasoning and our own review, not on like counts.
- More rules can make the list long. Each added line must replace nothing that already exists and stay one line.
- A beat grid rule could make talking-head reels feel mechanical, so it applies only to reels with music (O2).

## Checks to run

- Choice sheet and reference analysis: run each once on a scratch reel and attach the sheet and notes.
- `film-look`: play the scratch reel in Kinotta Review and confirm no dropped frames compared with the same reel without it.
- Each new template: build it in a scratch reel, seek the same `t` twice and compare the frames byte for byte. Run `grep -n "Math.random\|transition:\|setTimeout\|will-change"` and expect no matches.
- Render one contact sheet per template with `beats.js` and attach the paths.
- `grep` the taste list for duplicate lines after the edit.
- Search the new files for any sentence copied from the site's pages and expect none.

## Changelog

### 2026-10-23
- Generated soundtracks now live in the synthesized score plan.
- Owner added reference analysis, choice sheets, measurable motion rules and checks, and the `film-look` and `presenter-split` templates, from comparing two outside skills (O3). The new motion rules join step 2's table for approval.
- Steps 1–2 completed: added the eight-source research note and proposed taste-additions table, checked existing-rule overlaps, and stopped for owner approval without changing taste, skills or templates.
- Plan created. Source pages read on 2026-10-23.
- O1 resolved: the four templates, all optional.
- O2 resolved: beat timing only on reels with music. Owner approved the plan.
- Owner added three optional templates: phone, chart and diagram (from the site's gallery categories). Particles, 3D and characters left out.
