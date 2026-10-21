---
title: Effect templates in footage reels
date: 2026-10-20
status: Approved
summary: Footage-reel plans can start a clip from an effect template and load the brand's fonts and curves natively, so every reel draws its motion from one shared library, varies it shot to shot and defaults to keynote cutaways.
spec: docs/plans/2026-10-20-talking-head-effects.md
---

## Intent

- Problem: The effect templates (`skill/kinotta/templates/effects/`) only work in parts reels. Footage reels, which simple mode and every b-roll build make, compose engine fragments (`M.scene`) with `engine/build.py --plan`, so Claude rebuilds template ideas by hand or repeats the same card. Found while building b-roll on the owner's video (`docs/notes/2026-10-20-broll-eval-findings.md` on `feat/simple-mode`, items 5 and 7).
- Why: The templates exist so Claude varies motion effects across shots; that only works if every reel type can use them natively.
- Proposed outcome: A footage-reel plan clip can name a template; the composed page plays it on the footage timeline like any clip; the skill tells Claude to vary templates across a reel.
- Affected: `skill/kinotta/engine/build.py` (`compose`), `skill/kinotta/engine/motion.js` (registering a template seek with `M.page`), `skill/kinotta/templates/effects/` (plates optional, README), `skill/kinotta/SKILL.md` section 5, `skill/kinotta/reference/engine-api.md`, engine tests.
- Constraints: The timing contract (pure `seek`, no timers). One copy of each template, not a second engine-format copy. Existing engine fragments and plans compose unchanged. Kinotta's scene markup comparison between versions keeps working.
- Out of scope: New templates; the Review "Reattach" bug (finding 1); installing the skill copy at `~/.agents/skills/kinotta` (an owner step after merge).
- Open questions: none. B2's types and treatments were settled from the research (owner, 2026-10-20).

## Decisions (owner, 2026-10-20)

- **B1. Engine defaults from our own sources.** The engine's default curves, entrance and type scale come from the owner's `DESIGN.md` (RayDom) and `~/.claude/reference/craft.md`, replacing the motion-broll defaults. A brand's `brand` field still overrides them. Only values and curves are taken into the open-source repo, not RayDom's colours, copy or logo; the default fonts must be OFL.
- **B2. Defaults depend on the kind of video.** Research which b-roll treatment fits which kind of video (explainer talk, vlog, tutorial, vertical short, product demo and others) before writing the rules. The simple-mode start asks "What kind of video are you making?" and passes the answer to the build. That question belongs to the simple-mode surface on `feat/simple-mode`, so it is a separate change there; this plan reads the answer from the plan (`videoType`).
- **B3. The check is v6 itself.** Rebuilt stills are compared with `socsci-6-final` v6, not an earlier version, to raise the first-build standard so later versions need fewer fixes.

## Goal

A plan clip `{ "id": "02", "template": "chip-tally", "fill": {...}, "in", "out" }` composes into the footage page and plays at its words; SKILL.md section 5 makes Claude pick templates per shot with no template repeated in a row.

## Approach

1. **Compose a template clip.** In `compose`, a clip with `template` reads `templates/effects/<name>/r1/` (or a copied, edited shot folder via `clip`): nests `shot.css` under the scene, places the section's inner markup, and runs `shot.js` with `export` stripped inside the same scoped `document` wrapper engine clips get. It registers `{root, seek, T: out - in}` with `M.clips`, so `M.page` drives it with no change to the page seek.
2. **Plates are optional.** In a footage reel the footage is the plate, so the composer drops `data-el="plate"` and `subject` layers unless the clip keeps them (`text-behind` still needs a supplied matte).
3. **Fill the template from the plan.** `fill` replaces placeholder copy and `data-at` times per element (`{ "chips": [{ "text": "PhD, Stanford", "at": 11.86 }] }`). Times in `fill` are **source seconds**; the composer converts them to clip-local reel time through the plan's `pieces`, so dead-air cuts inside a clip no longer shift words (finding 7).
4. **Brand tokens.** The composer writes `shared.css` and `presets.css` tokens once per page, set from the brand file's colours where the plan gives them.
5. **Brand prelude, native.** A plan field `brand` (`{ "fonts": [{ "family", "weight", "file" }], "curves": { "rise", "state", "sink" } }`, read from the brand file's sources) makes the composer embed one prelude script per page: it loads the brand's font files as `FontFace` from embedded bytes (synchronously, so the first still has them) and defines the brand's easing curves for clips and templates. This generalises RayDom's `motion/socsci-6-final/src/prelude-script.js`, which today lives only in that project. Templates read the curves when present, else their own.
6. **Engine defaults (B1).** Replace `engine/motion.js` default springs and the motion-broll style defaults with curves, entrance and type scale derived from RayDom `DESIGN.md` and `craft.md`, documented with where each value came from.
7. **Treatment by video type (B2).** From `docs/research/2026-10-20-broll-by-video-type.md`. `videoType` is one of seven; SKILL.md section 5 applies its row, and with no type it asks once:

   | `videoType` | Treatment |
   |---|---|
   | `explainer` (talk to camera) | Mostly full-frame cutaways and punch-ins, also covering jump cuts |
   | `interview` (interview or podcast clip) | Cut between speakers; show the visual when the topic is visual; split layouts |
   | `tutorial` (screen walkthrough) | Screen stays the main frame; emphasis inside it (zoom, cursor, callouts of 5 to 8 words) |
   | `demo` (product demo) | Screen or product first; the proposition in the first 3 s |
   | `short` (vertical short) | Full frame; hook in the first 3 s; text outside the top 14%, bottom 35% and sides 6% |
   | `lecture` (educational) | Talking head alternating with slides or drawing; chunks under about 6 minutes |
   | `vlog` | Sparse graphics, authentic over polished (opinion; no strong source) |

   Captions for every type: phrases of at most 42 characters per line at about 20 characters per second. The research gives no density numbers, so density stays the skill's light, medium and heavy setting. Motion style comes from B1, not the research.
8. **Variation rule.** SKILL.md section 5 steps 6 and 7: read `templates/effects/README.md` and the taste list; apply the treatment for the video type; give each clip its own device from the templates, never the same template in two adjacent clips; one signature entrance per reel from the brand curves; a real photo or logo on the word that names it, with its credit. `engine-api.md` documents `template`, `fill` and `brand`.

## Steps

0. Research B2 (background research lane) and owner review of its table; derive B1 defaults from `DESIGN.md` and `craft.md` and list them for the owner before coding.
1. Engine tests (red): a plan with a `chip-tally` clip composes; its scene seeks to the right chips at given times; a `fill` time after a snip lands at the mapped reel time; a plan with `brand` fonts renders its first still in the brand face; an existing engine-fragment plan composes byte-identical.
2. Implement 1 to 6 in `build.py` and `motion.js`.
3. Update SKILL.md, `engine-api.md` and the templates README (steps 7 and 8).
4. Rebuild the owner's FInalVid b-roll (copy in the scratch project) as a new version following the updated taste list: mostly full-frame cutaways, templates for at least four clips, RayDom fonts and curves through `brand`. Compare its stills side by side with `socsci-6-final` v6 itself (B3); list every gap; run `kinotta check`.

## Risks

- Templates use `export function seek` module syntax and module-scoped helpers; stripping `export` inside the wrapper must keep their scope private so two template clips on one page don't collide.
- A template's `exitAt` reads `root.dataset.duration`; the composer must set it to the clip's slot length.

## Checks to run

- Engine tests above; `kinotta check` on the rebuilt reel; seek forward and backward to the same DOM state at several times per template clip.

## Changelog

### 2026-10-20
- Plan created: the owner wants templates usable natively so Claude varies motion effects in every reel, footage reels included.
- Added after reviewing `socsci-6-final` v6 (the owner's preferred reel of the same speech): a native brand prelude for fonts and curves (step 5), the cutaway default and variation rules (step 6), and a side-by-side comparison with v6 as the check. Five matching rules were added to `~/.kinotta/taste.md` (backup `taste.md.bak-2026-10-20b`); alternating light and dark grounds was dropped because not every DESIGN.md has a dark theme.
- Research done (Sonnet agent, 26 sources); owner accepted the seven video types and their treatments, written into Approach step 7.
- Owner decisions B1 to B3 recorded: engine defaults from DESIGN.md and craft.md, treatment by video type after research (with a "What kind of video" question in simple mode, a separate change), and v6 itself as the check.
- Approved; dispatched to Codex. Claude runs step 4 (the FInalVid rebuild) after Codex finishes.

### 2026-10-21
- Codex finished steps 0–3 (`14b1451`, `3d23a34`). Owner approved the B1 defaults in `docs/research/2026-10-20-engine-defaults.md` as proposed: slow motion and the signature entrance capped at .5 s (not RayDom's .6 s/.75 s), Geist as the fallback face, and RayDom's width-based video type sizes (12.6vw / 5.2vw / 4.8vw).
