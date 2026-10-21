# Brief: impeccable polish pass on simple mode (agy)

Worktree: `C:/FIles/Projects/Apps/Kinotta/.worktrees/simple-mode`, branch `feat/simple-mode`. Commit here; do not push.
Start only after codex's frame/timer commits are in (`docs/plans/2026-10-21-simple-frame-and-run-timer.md` status Done).

## Goal
Impeccable Lane B pass on the simple-mode surface only: `/impeccable critique` -> `/impeccable audit` -> only the verbs those flag -> `/impeccable polish`. If you cannot run the impeccable skill, apply its checklist by hand from the files below.

Read first: `~/.claude/reference/ui.md`, `~/.claude/reference/craft.md`, `DESIGN.md`, `PRODUCT.md`, and `docs/mockups/2026-10-2*-simple-*.html`. A mockup is the decision: refine, don't redesign. If the critique says the look itself is wrong (Lane C), stop and report instead of redesigning. Use Gemini 3.8 sub-agents to parallelize the run (e.g. critique reviewers, audit, screenshots) so it finishes faster; you integrate and commit. Record each sub-agent and its model in your report.

## Files in scope
`web/src/SimpleMode.tsx`, `web/src/simple.css`, `tests/e2e/simple-mode.spec.ts` (only to keep tests in step with markup).

## Do not touch
`server/**`, `web/src/review/**`, `web/src/styles.css`, the editor, `skill/**`, plan files. Keep the 16:9 frame, the run timer, and the scroll fix (`.sm-app` owns scrolling).

## Notes
Live app: http://localhost:5174 (API 127.0.0.1:4317). Don't kill those servers. Conventional Commits (`style:`/`fix:`), no AI signature, no `--no-verify`.

## Acceptance checks
- `npm run typecheck`, `npm run build` pass.
- `npm run test:e2e -- tests/e2e/simple-mode.spec.ts tests/e2e/review.spec.ts` pass.
- Before/after screenshots at 1280x800 and 390x844 of the make screen and the studio, in `tests/artifacts/simple-impeccable/`.
- Page still scrolls at a 500px-tall window.

When finished, append to the end of this brief: findings (fixed vs left, with reason), commits, checks with results, deviations.


## Execution Report

### Sub-agents Recorded
- **Sub-agent A (Design Critique Reviewer):** ID `a6f90bf8-3b22-4bf9-984f-3d49782bbe9b`, Model: Gemini 3.8 Flash (inherited). Conducted heuristic scoring, visual hierarchy assessment, and "Light Table" design system compliance audit.
- **Sub-agent B (Technical Quality Auditor):** ID `27bb7b9a-6f47-48b6-a572-b2e543167789`, Model: Gemini 3.8 Flash (inherited). Evaluated WCAG 2.1 AA accessibility, motion tokens, zero-radius invariants, mobile reflow, and CSS cleanup.

### Findings

#### Fixed
1. **Zero-Radius Invariant Violations:**
   - Removed `border-radius: 3px` from `.sm-preview-clip` (`simple.css`); reset to `0`.
   - Removed `border-radius: 50%` from `.sm-seg button.mine::after` (`simple.css`); reset to `0` with a 4×4px sharp square indicator.
2. **The One Light Rule Restorations:**
   - Replaced decorative ice-blue accent border on `.sm-preview-note` (`border-left: 2px solid var(--light)`) with `var(--hairline)` so ice-blue strictly denotes active state.
   - Replaced `.sm-type-card.on` tinted wash fill with `var(--card-raised)` and focused border glow.
3. **Accessibility & ARIA States:**
   - Added `aria-pressed={isSelected}` to `.sm-type-card` buttons in `SimpleMode.tsx`.
   - Added `aria-pressed={options[dial] === level}` to all segmented dial buttons (B-roll, Pace, Captions).
   - Added `role="region"` to `.sm-preview-lane` containers so container `aria-label` is valid.
   - Enhanced `.sm-pin-jump` `aria-label` to include comment note text so screen readers announce both coordinate and content.
   - Added `onKeyDown` `Escape` handlers to `.sm-composer` and pin note edit forms.
4. **Motion & Performance Standards:**
   - Replaced arbitrary transitions with Rubric tokens (`var(--ease, cubic-bezier(.2,.8,.2,1))`, `var(--t-lift)`, `var(--t-color)`).
   - Added `@media (prefers-reduced-motion: reduce)` block in `simple.css` to eliminate transitions for users requesting reduced motion.
5. **Theming & Color Tokens:**
   - Replaced un-themed hex `#e06c75` fallback with `var(--warn, oklch(.72 .18 35))` on `.sm-agent-error`.
   - Replaced raw `oklch(.42 .02 106)` background on `.sm-clip-talk` with `var(--card-raised); border: 1px solid var(--rule);`.
   - Replaced `.sm-preview-frame span` raw black background with `var(--scrim, oklch(.12 .003 106 / .86))` and added Doto tabular font numbers.
6. **Machine Numbers Rule Alignment:**
   - Replaced `<span className="num">[</span>` and `]` shortcut hints in `.sm-pins p.meta` with semantic `<kbd className="sm-kbd">` styled in Outfit font, eliminating Doto machine font misuse for keyboard shortcuts.
   - Aligned `.sm-agent-timer .num` font size to 14px.
7. **Mobile Responsiveness (390px):**
   - Added `flex-wrap: wrap; gap: 6px 14px;` to `.sm-preview-ph` to prevent header stat collisions.
   - Added `.sm-dial-why { grid-column: 1 / -1; }` under `@media (max-width: 850px)` so dial descriptions are not squashed into a 90px column.
   - Adjusted mobile preview frame gap and label sizing.
8. **Test Alignment:**
   - Updated status selector in `tests/e2e/simple-mode.spec.ts` to `.sm-message[role="status"]` to avoid strict-mode ambiguity when `MediaEditor` mounts its own loading status.

#### Left (with reason)
1. **Multi-track review piercing (`.sm-preview .rv-main > ... { display: none; }`):** Left intact as `web/src/review/**` is explicitly prohibited by brief scope ("Do not touch: server/**, web/src/review/**").
2. **Dual New Reel controls in header:** Left `<button className="btn quiet">New reel</button>` alongside the select dropdown because `tests/e2e/simple-mode.spec.ts:154` asserts `getByRole('button', { name: 'New reel', exact: true })`.
3. **SSE and polling coexistence:** Retained 3s polling fallback alongside SSE for agent job progression to ensure robust connection recovery across network interruptions without altering API contracts.

### Commits
- `43f0421`: `style: polish simple mode craft, tokens, and zero radius`

### Checks with Results
- `npm run typecheck`: **PASS** (0 errors)
- `npm run build`: **PASS** (client built cleanly in 501ms)
- `npm run test:e2e -- tests/e2e/simple-mode.spec.ts tests/e2e/review.spec.ts`: **PASS** (11/11 tests passed in 48.9s)
- **Before/After Screenshots** in `tests/artifacts/simple-impeccable/`: **PASS**
  - `make-1280x800-before.png` / `make-1280x800-after.png`
  - `make-390x844-before.png` / `make-390x844-after.png`
  - `studio-1280x800-before.png` / `studio-1280x800-after.png`
  - `studio-390x844-before.png` / `studio-390x844-after.png`
- **500px-tall window scroll check:** **PASS** (`scrollHeight: 579px`, `clientHeight: 500px`, `scrollTop: 79px`, `canScroll: true`)

### Deviations
None. All edits strictly respected scope limits (`web/src/SimpleMode.tsx`, `web/src/simple.css`, `tests/e2e/simple-mode.spec.ts`), preserved the 16:9 frame, timer, and `.sm-app` scroll ownership, and did not touch `server/**`, `web/src/review/**`, `styles.css`, or plan files.
