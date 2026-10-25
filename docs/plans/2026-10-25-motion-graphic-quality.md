---
title: Motion graphic quality in Kinotta
date: 2026-10-25
status: In Progress
summary: Close the quality gap between reels an agent builds in Kinotta and Opus's standalone Light Table film, starting with agent guidance, then render features.
spec:
---

## Intent

- Problem: A reel built inside Kinotta (`reels/kinotta-pin`, v3 draft) is flat: a locked camera, one plane per shot, almost no colour. Opus's standalone film (`docs/motion/kinotta-light-table-3d.mp4`) has a moving camera on every beat, depth, persistent objects, post-processing and motion blur.
- Why: The owner says the gap is in the quality of the output, not in Kinotta's structure. Reels made in Kinotta should reach that bar.
- Proposed outcome: An agent building a motion reel in Kinotta follows the process that produced the better film, and the render path stops blocking the look (blur, bloom). A new reel built this way is judged against the Light Table frames by the owner.
- Affected: `skill/kinotta/` docs (SKILL.md and a new motion reference), later the render path and Review preview. No change to the nine-step footage plan.
- Constraints: Keep Kinotta's shot model (independent, revisable shots, frozen versions). The timing contract stays seek-driven. Finish the Storyboard gate (step 5) and skill-docs step 8b first.
- Out of scope: Shared-world sequences that own one camera across shots, and shipping libraries such as Three.js inside shots. Both are deferred until the owner wants continuous films as a product line. Sound.
- Open questions:
  - Where should Opus's debrief point 9 (a "design language only" mode, no full `brand.md`) land: this plan or step 6, the design kit?
  - Can motion blur and bloom live in the render path only, so Review preview stays light?
  - Is the owner's bar "looks like the Light Table" or "close with Kinotta's constraints"?

## Goal

An agent-built motion reel is visibly closer to the Light Table than `kinotta-pin` v3, confirmed by the owner comparing frames, with the process written down so any session repeats it.

## Approach

Draft, not approved.

Phase 1, agent guidance only (no code). Add `skill/kinotta/reference/motion-craft.md`, linked from SKILL.md. It records the process behind the Light Table, from Opus's own debrief and the frame comparison:
1. A written treatment first: concept line, beats with seconds, a camera move and a transition for each beat, one signature move. Agree it before building.
2. Every frame is a pure function of time: no timers, no randomness.
3. The camera keeps moving; vary angle and depth; no static hold over about 1.5 seconds.
4. Build a world with depth and persistent objects, not one plane per shot.
5. Only the state colour glows (Kinotta's one-light rule).
6. Transitions are events (iris, whip, flash), not plain cuts.
7. Check one still per beat, mid-move frames, both ends of each shot and a backward seek. Fix what the stills show.
8. Label invented copy and numbers as illustrative, and ask about sound.

Phase 2, render features, each needing its own approved approach before code:
- Click-to-pin on canvas and WebGL content, through a function that returns a named element's screen rectangle at time t. Small, high value.
- A render-side motion blur and post-process hook (sub-frame sampling at render time).
- A cheaper preview quality mode for heavy shots.

Phase 3, proof. Rebuild the `kinotta-pin` idea using Phase 1 and any Phase 2 features, and compare frames with the Light Table with the owner.

Deferred: shared-world sequences and transitions as their own objects; libraries in shots.

### Trial first: `kinotta-pin` v4 (owner approved 2026-10-25)

Before writing `motion-craft.md`, apply the process by hand to one reel and compare. Same story and the same five shot names as v3, so the difference is the craft, not the script. The owner relaxed the "finish steps 5 and 8b first" constraint for this trial only, since it touches no app code.

Inside Kinotta's limits: no Three.js (shot modules take no imports), so the world is a hand-rolled perspective camera per shot. A canvas draws the floor, light and glow; DOM planes under a CSS `matrix3d` camera carry the text and every `data-el`, so pins still land. No bloom or motion blur from the render path; glow is faked with canvas and CSS shadows, whips use a directional SVG blur. Camera continuity comes from matching each shot's end pose to the next shot's start pose.

Concept: vague feedback is fog; one pin turns it into a precise answer and a new version. World: a dark floor with a dot grid to the horizon; the hex, the comment slates and the version plates persist; only ice glows.

| Shot | Time | Action | Camera | Out |
|---|---|---|---|---|
| noise | 0–4.0 | Vague phrases float as slates at depth; far ones out of focus | Low crane forward through them, slight roll | Hex cursor streaks in (whip) |
| lock | 4.0–8.5 | Hex lands on the floor; a ripple aligns the dots; phrases strike through and fall flat | Orbit about 40° rising to a high angle | Ripple flash |
| pin | 8.5–14.0 | Signature: the hex becomes a lit pin, a "headline" slate stands up, the readout counts to 03.60 | Dive from high to pin level, accelerating into the glow | Iris closes on the pin |
| versions | 14.0–18.0 | Plates v1, v2, v3 in depth; an ice edge runs along them as "One pin. One answer. One new version." lands | Lateral track along the plates | Whip pan |
| mark | 18.0–21.5 | Plates fold into the hex mark; KINOTTA in layered depth; "Pin it. Don't describe it." | Pull back to frontal; only the last 1.5 s holds | End |

Illustrative: the "headline" tag, the 03.60 readout and the phrases. No sound.

Checks: a still per beat, mid-move frames, both ends of each shot, a backward seek, `kinotta check`, a draft render, and a side-by-side contact sheet against the Light Table for the owner.

### Spike: Three.js in one shot (owner approved 2026-10-25)

Question: can a shot use WebGL with real bloom inside Kinotta, and does `kinotta render` draw it? Rebuild only `pin` as revision r6 with Three.js r170 (MIT, vendored in `docs/motion/vendor/three`), keep the other shots at r5, and build `kinotta-pin` v6 to compare against v5.

- The build rejects `import` in `shot.js`, so the shot is bundled with esbuild into one file: the library and scene sit in a module-scoped closure, and `shot.js` ends with `export async function seek`. No Kinotta code changes.
- WebGL draws the floor, prism, light and bloom (UnrealBloomPass with a high threshold, so only ice blooms). Text and every `data-el` stay DOM planes under the same camera, so pins still land; an invisible DOM face carries `pin`.
- One camera: the v5 key path, with the Three.js camera set from the same basis as the DOM `matrix3d`.

Pass: `kinotta check` clean, the built page passes the v5 browser checks, the draft render shows the WebGL frames with bloom. Record the page size and render time against v5.

## Steps

1. Owner approves the Intent and open questions.
2. After step 8b is committed, write `motion-craft.md` (agy or Claude); test it by having a fresh session build a short motion reel from it.
3. Decide Phase 2 order with the owner. Write a short approach for each feature before any code.
4. Build features one at a time, each with tests and a commit.
5. Phase 3 comparison with the owner.

## Risks

- Guidance alone may not close the gap if the page-based shot contract cannot express the look. Phase 1's test reel will show this early.
- Motion blur and bloom inside `seek` can make Review playback slow.
- Scope creep into sequences. Keep them deferred unless the owner decides otherwise.

## Checks to run

- `motion-craft.md` exists, is linked from SKILL.md, and any test that reads `skill/kinotta` passes.
- A fresh-session test reel: `kinotta check`, a still per beat, a backward seek check, a draft render.
- Owner compares frames with the Light Table.

## Changelog

### 2026-10-25
- Plan created as a Draft from Opus's debrief and a frame comparison of `kinotta-pin` v3 against the Light Table. Not approved. Notes also saved in memory as `motion-graphic-craft-gap`.
- Owner approved a hand-applied trial first: `kinotta-pin` v4 with the treatment above, inside Kinotta's shot limits. Status In Progress for the trial; the Phase 2 features and the bar question stay open.
- Trial built as shot revisions r5 → `kinotta-pin` v5 (v4 was an intermediate build with a visibility leak: planes set `visibility: visible` showed through hidden sections; r5 inherits instead). `kinotta check`: no contract issues. Browser checks on the built page: backward seek identical, a moved scene shows only in its new range, clicks land on `phrase-1`, `tag`, `timecode`, `plate-v2`, `wordmark`; no page errors. Draft render `renders/kinotta-pin-v5-draft-540p30.mp4` (21.5 s). Awaiting the owner's frame comparison against the Light Table.
- `skill/kinotta/reference/motion-craft.md` written and linked from SKILL.md, commit df33098 on `docs/motion-craft` (not merged). Skill doc tests: 15 passed on two runs (one earlier run had a single failure that did not recur).
- Three.js spike passed. `pin` r6 bundled with esbuild (497 KB `shot.js`, no import keyword) → v6. `kinotta check` clean; same browser checks pass as v5; `kinotta render` draws the WebGL and bloom (draft render 2 m 29 s vs 1 m 31 s for v5; page 582 KB vs 89 KB). Gotcha: the composer encodes to sRGB once more, so the clear and fog colours are given pre-linearised. Pin source lives only in the scratchpad build; keep a copy with the reel if this route is adopted.
- Owner adopted the WebGL route. On `docs/motion-craft`: fab27c0 vendors three.js r170 (core plus bloom pipeline, MIT) in `skill/kinotta/vendor/three` and adds `engine/bundle_shot.js`; 0615a37 adds section 5 "WebGL shots" to `motion-craft.md` and names it in SKILL.md. The bundler rebuilt the pin from `reels/kinotta-pin/sources/pin-r6.src.js` pixel-identical to the spike. Skill tests: 27 passed. Not merged.
- Findings for `motion-craft.md`: parts shots take their Storyboard still at local 0, so a shot must not open on black or an empty frame (plan transitions so frame 0 has content); set planes to inherit visibility, never `visible`; reserve swing blur for fast moves only.
