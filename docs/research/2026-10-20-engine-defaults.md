# Proposed engine defaults (B1)

Saved execution plan: `docs/plans/2026-10-20-templates-in-footage-reels.md`, approved steps 0–3. Implement template composition, optional plates, source-time fill, tokens and brand prelude in test-first slices; apply the values below last; update the three authoring documents; run typecheck, focused tests and the full suite. Step 4 and editor changes are excluded. This record holds the implementation plan without changing the owner's approved plan or dashboard.

## Values and sources

Source paths below are read-only; only numeric values and curves enter the engine. No RayDom colours, copy, logo or font bytes are copied.

| Default | Proposed value | Source line |
|---|---|---|
| Rise curve | cubic-bezier(.16, 1, .3, 1) | RayDom `DESIGN.md:74`; `motion/socsci-6-final/src/prelude-script.js:21` |
| State curve | cubic-bezier(.65, 0, .35, 1) | RayDom `DESIGN.md:75`; prelude `:21` |
| Sink curve | cubic-bezier(.5, 0, .75, 0) | RayDom `DESIGN.md:76`; prelude `:21` |
| State duration | .267 s | RayDom `DESIGN.md:67`; prelude `:22` |
| Fast / land | .233 s | RayDom `DESIGN.md:68`; prelude `:22` |
| Slow / soft / camera | .5 s, bounded state interpolation, no overshoot | RayDom `DESIGN.md:65` has .6 s rise; craft `:43` caps at .5 s. These presets use that cap. Explicit spring pairs remain supported. |
| Signature entrance | Rise curve, .5 s, opacity 0→1, translateY 26→0 px, scale 1.07→1, blur 20→0 px | `motion/socsci-6-final/src/make_v2.py:27–31` hero uses these values with .75 s; craft `:43` caps at .5 s. The named prelude contains the curves, not the hero helper. |
| Exit | .333 s, sink curve; blur 12 px and upward 14 px | RayDom `DESIGN.md:72`; prelude `:22`; hero `make_v2.py:29–30` |
| Display / headline | 80 px / 36 px, weight 800, leading 1 / 1.1, tracking -.04em / -.034em | RayDom `DESIGN.md:26–35` (rem values at 16 px; display upper bound) |
| Title / body / label / figure | 20 / 16 / 13 / 72 px; leading 1.25 / 1.55 / 1.3 / .9; weight 700 / 500 / 700 / 800 | RayDom `DESIGN.md:38–59`; craft `:67` body floor |
| Video title / row / minimum | 12.6vw / 5.2vw / 4.8vw | RayDom `DESIGN.md:231–232`; use as explicit video tokens, not a web body size |
| Default family | Bundled Geist; Geist Mono for code only | Existing `engine/fonts/OFL-Geist.txt`; no brand font bytes copied |

Brand `curves`, embedded `fonts` and CSS `tokens` override page defaults. Templates use the shared rise/state/sink curves when available and retain their standalone fallbacks. Existing engine fragments keep their authored markup and explicit values; byte compatibility excludes only the named B1 engine/base stylesheet replacements. The compatibility test must compare every other byte.
