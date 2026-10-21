# Brief: finish the simple-mode impeccable pass (codex)

Worktree: `C:/FIles/Projects/Apps/Kinotta/.worktrees/simple-mode`, branch `feat/simple-mode`. Commit here; do not push.
agy's pass is `43f0421`; its report is at the end of `.herdr/briefs/2026-10-21-simple-impeccable-agy.md`. Read it first, plus `~/.claude/reference/ui.md`, `~/.claude/reference/craft.md`, `DESIGN.md`, `PRODUCT.md`, `docs/mockups/2026-10-2*-simple-*.html`. A mockup is the decision: refine, don't redesign. Do not spawn reviewer sub-agents; single-context review.

## Goal
1. Fonts in dev: Vite refuses the Outfit/Doto files because the worktree resolves `node_modules` from the main checkout. Fix in `vite.config.ts` (`server.fs.allow`, dev-only) so the real fonts load. Verify in the browser.
2. Critique with the real fonts: give an overall verdict and scores (impeccable critique format), then fix what it flags within scope.
3. agy's leftovers:
   - Simple mode hides Review internals from `simple.css` (`.sm-preview .rv-main > ... { display: none; }`). Replace it with a proper prop/flag on the Review component if small and clean; otherwise leave it and explain.
   - Duplicate "New reel" button vs reel dropdown: decide against the mockups; if removing, update the test.
   - `var(--warn)` is undefined: use an existing token or define it with the theme tokens.
4. `/impeccable polish` over the result.

## Files in scope
`web/src/SimpleMode.tsx`, `web/src/simple.css`, `web/src/simple-options.ts`, `tests/e2e/simple-mode.spec.ts`, `vite.config.ts` (fs.allow only), and for 3a only the smallest change in `web/src/review/**` plus tokens in `web/src/styles.css`.

## Do not touch
`server/**`, the editor beyond 3a, `skill/**`, plan files, the two modified PNGs under `docs/session-summaries/2026-10-15-viewer-transport-clips/`.

## Notes
Live app http://localhost:5174 (API 127.0.0.1:4317). Don't kill those servers; if you restart Vite, keep port 5174. Clean up any e2e `start-server.mjs` processes your test runs leave behind. Conventional Commits, no AI signature, no `--no-verify`.

## Acceptance checks
- `npm run typecheck`, `npm run build` pass; `npm run test:e2e -- tests/e2e/simple-mode.spec.ts tests/e2e/review.spec.ts plus any e2e spec covering files you change under `web/src/review/`` pass (note any failure that also fails on `43f0421`).
- Real before/after screenshots in `tests/artifacts/simple-finish/` at 1280x800 and 390x844 of the make screen and the studio, taken only after the reel has finished loading (no "Loading…"), with real fonts. Before = `43f0421`.
- Page still scrolls at a 500px-tall window; 16:9 frame and run timer intact.

When finished, append to the end of this brief: verdict and scores, findings fixed vs left (with reason), commits, checks with results, deviations.

## Saved execution approach

1. Preserve the existing UI and fix only Vite's dev filesystem allow list. Verify successful Outfit/Doto font responses and capture the `43f0421` UI before refinement at both requested sizes.
2. Review the make/studio surfaces against the saved mockups with real fonts, record a single-context critique and detector evidence, and select only scoped fixes.
3. Resolve the three named leftovers where the existing components permit small changes. Preserve playback, timeline pinning, the 16:9 frame, timer and scroll ownership; none of this changes Working.
4. Apply the targeted fixes and polish, then check the exact UI paths, capture after screenshots, run typecheck/build and relevant browser tests, clean up test-owned servers, and commit locally.

## Execution report

DEGRADED: single-context review, explicitly required by this brief. No reviewer sub-agents were spawned.

### Verdict and scores

Lane B remains appropriate. With Outfit and Doto loaded, the Light Table identity is coherent: the reel leads, the neutral chrome recedes, and the treatment picker matches the approved pace/type mockups. No redesign was needed. The strongest parts are the neutral landscape frame, distinct numeric readouts, and visible treatment/dial selection. The first-time-user friction was duplicate creation controls; the keyboard/maintenance concern was mounting editor controls and hiding them through CSS.

| Nielsen heuristic | Before / 4 | Finished / 4 | Evidence |
|---|---:|---:|---|
| Visibility of system status | 3 | 3 | Live timer and completed totals retained; error banner wraps on mobile |
| Match to the real world | 4 | 4 | Reel/pin/treatment vocabulary stays concrete |
| User control and freedom | 3 | 3 | Editor switch, cancellation, retries and copy paths retained |
| Consistency and standards | 2 | 3 | Agent label/selector now align; Simple mode owns its rendered chrome |
| Error prevention | 3 | 3 | Required pin notes and existing disabled actions retained |
| Recognition rather than recall | 3 | 4 | One New reel action in the Reel dropdown |
| Flexibility and efficiency | 3 | 3 | Keyboard pin navigation and persisted treatment settings retained |
| Aesthetic and minimalist design | 3 | 4 | Duplicate button removed; no added containers or decoration |
| Error recovery | 3 | 3 | Retry/copy remain accessible; long error text stays within the viewport |
| Help and documentation | 3 | 3 | Existing hints and treatment descriptions preserved |
| **Total** | **30 / 40** | **33 / 40** | **Good; scoped refinement complete** |

Cognitive load: the eight treatment choices remain because the saved type-picker mockup explicitly chooses that set, and Make already has defaults. The review path stays watch → pin → describe → regenerate. Questions skipped: this execution brief already authorizes the scoped decisions and fixes.

Technical audit: accessibility 3/4, performance 3/4, responsive behavior 3/4, theming 4/4, implementation integrity 4/4 = **17/20**. This is a scoped assessment, not an exhaustive WCAG certification. Existing dense time-axis labels and the wider editor are outside this finish pass.

### Findings fixed

- **P1 — Dev fonts denied.** The worktree's local `node_modules` exists but does not contain Outfit/Doto; resolution falls back to the main checkout. `vite.config.ts` now retains Vite's workspace allowance and adds the actual resolved dependency root to `server.fs.allow`. No production settings or API proxy behavior changed. Browser evidence records HTTP 200 for Outfit 400/500/600 and Doto 700/800, with loaded FontFace entries for every family/weight.
- **P2 — Review internals hidden by descendant CSS.** Reused Review's existing `simple` flag to omit its duplicate heading, divider, marker panel, toolbar and native tracks. Added a small `Transport.compact` flag for play/timecode/status only and passed it through both player paths. Removed the corresponding `display: none` rules from `simple.css`. Defaults retain the detailed editor. The Simple timeline and caption interactions remain mounted; no Working edits are introduced by this rendering change.
- **P2 — Duplicate New reel controls.** The mockups keep the review heading quiet and do not establish two adjacent creation actions. Kept the dropdown's New reel option and removed the extra button; tests now navigate through the dropdown and verify the button is absent.
- **P2 — Agent control alignment.** The general `.sm-app label` rule overrode the lower-specificity Agent rule. Scoped the Agent override correctly, restoring its inline label/selector without changing copy or interaction.
- **P2 — Error layout and undefined warning token.** Used existing `--ink-2`, consistent with the editor's neutral error text, and retained `role="alert"` and state wording. Banner contents wrap and long unbroken details stay inside 390px. Mobile quiet actions have 44px minimum height.
- **P2 — Layout animation.** Browser detection found the b-roll preview animating `left` and `width`. Setting changes now update placement immediately; only the existing opacity transition remains, with reduced-motion handling retained.
- **Test stability.** Clock installation now starts one minute before the fixed pause time. The previous install/pause-at-the-same-instant sequence sometimes tried to fast-forward into the past under seven concurrent browser workers, before the UI had even loaded.

Targeted verbs applied: layout (header grouping), harden (mobile error text and actions), animate (remove layout-property transitions), then polish. No identity, factual copy, treatment choices or reel assets were redesigned.

### Detector evidence and findings left

- Static CLI scan of `web/src/SimpleMode.tsx`: `[]` (zero findings).
- Browser detector ran in isolated headless tabs on the real loaded make/studio surfaces. JSON is committed under `tests/artifacts/simple-finish/`. No persistent user-visible overlay or additional live service was left running.
- **Selected-card glow:** retained as a design-authorized active-state light; the detector's general glow rule is not applicable to this selected-state marker.
- **Uppercase settings sentence:** retained because it is part of the approved pace-preview mockup. No replacement copy was introduced.
- **Two gray-on-color reports:** the preview text uses the brand's near-white `--ink` (`#ededea`), which is the high-contrast near-white case allowed by the detector's own guidance, rather than washed-out secondary gray. Preserved the mockup's colored preview clips.
- **Body-level gradient-text report:** an aggregate detector warning without a matching Simple-mode element. A computed-style check found zero Simple elements with text background clipping, and source search found no gradient-text rule in `web/src`. Its precise origin was not established; no speculative style change was made.
- The final browser scan no longer reports layout transitions for the preview. No ignore rules were added.
- SSE plus polling remains unchanged; neither was a defect in this scoped pass.

### Checks and results

- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**, including after the final motion change; Vite still reports the existing >500kB chunk advisory.
- `npm run test:e2e -- tests/e2e/simple-mode.spec.ts tests/e2e/review.spec.ts tests/e2e/clips.spec.ts --workers=2`: **PASS, 14/14 in 54.8s**. Covers timer ticks/totals, omitted editor chrome, required-note pinning, clipboard fallback, dropdown creation, editor switching, playback, frame shape, short-window scrolling and clip/element manipulation in detailed Review.
- Expanded initial run also included `footage.spec.ts`, `snip-save.spec.ts`, `code-only.spec.ts` and `lanes.spec.ts`: 37 passed, three failed and two clip tests were skipped after a serial-suite failure. The rerun above passed the clock case and all clip cases. Across these runs, **41 of the 42 selected tests passed**; the one remaining snip assertion is confirmed pre-existing below.
- Baseline comparison: extracted an isolated exact `43f0421` archive into a temporary directory, using the existing dependencies without replacing pending source. The clip test passed on the baseline and on the focused current rerun. `snip-save.spec.ts:57` failed identically on both: it expects the Current reel rail to contain `you`, but receives `Current0 edits`. Left unchanged because this finish brief excludes that editor/version behavior and its test.
- `git diff --check`: **PASS**.
- Browser inspection: both fonts loaded; studio and make have no horizontal overflow at 1280px or 390px; long agent error has none at 390px. The 390px frame measures 356×200.25 (16:9). At 1280×500, `.sm-app` has 920px content and reaches scrollTop 420. Editor chrome selectors count zero in Simple mode.
- Before/after screenshots: all eight requested viewport/state images are committed under `tests/artifacts/simple-finish/`, plus treatment-picker and long-error evidence. Before images use the unchanged `43f0421` UI with only the dev font allow-list correction applied, so both sides show real fonts. Studio uses the same loaded graphics-options reel at 1s; make uses the same existing project video. No Loading screen is used as evidence.
- Cleanup: process inspection found no remaining `start-server.mjs` processes. Original live servers remain at 5174 (PID 34124) and 4317 (PID 36620).

### Commits and scope

- `29f5373` — `fix: finish simple mode fonts and review chrome` (implementation, test adjustments and evidence).
- Report closeout is the commit containing this appended execution report: `docs: record simple impeccable finish results`.
- No push. No plan files, server code, skills, reel assets or pre-existing modified PNGs changed. No theme-token additions were needed because the error uses an existing token.
- Workflow adaptations: used the owner-requested single-context review; kept the report here rather than creating out-of-scope Impeccable persistence files; injected the bundled detector directly into isolated test tabs instead of starting a separate overlay server. The only remaining acceptance failure is the baseline-confirmed snip assertion described above.
