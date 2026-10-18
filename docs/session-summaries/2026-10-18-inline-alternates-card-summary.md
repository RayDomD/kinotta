# Session Summary: Inline alternates card (2026-10-18)

Plan: `docs/plans/2026-10-18-inline-alternates-card.md` (status: `Done`)
Tickets: `docs/tickets-inline-alternates.md` (T1, T2, T3 — all acceptance criteria ticked)
Branch: `feat/inline-alternates-card` (merged `--no-ff` from `agent-loop/inline-alternates-card/card`)

## Run Report

| Ticket | Model | Escalations | Review outcome | Commit |
|---|---|---|---|---|
| **T1: Preview an alternate on the card** | `gemini-3.8-flash-high` | None | Passed | `2fd80c0` |
| **T2: Play the shown alternate on hover or focus** | `gemini-3.8-flash-medium` | None | Passed | `b8c1318` |
| **T3: Use and Not this on the card** | `gemini-3.8-flash-high` | None | Passed | `c2a3d60` |
| **Merge to `feat/inline-alternates-card`** | Orchestrator | — | Passed | `91c35d4` |

## Shipped vs. Planned

- **T1 (G2, G5):** `ShotCard` in `web/src/Storyboard.tsx` maintains `shownRevision` (defaulting to the in-reel alternate and resetting when `shot.revision` or the undismissed alternates list changes). Clicking a dot button (`aria-label="Show alternate <label>"`, `aria-pressed`) or pressing `ArrowUp`/`ArrowDown` on the focused card steps through undismissed alternates without scrolling the page or modifying server state. The card's line reads `"N alternates · X in the reel · previewing Y"` while previewing another option, frame pins filter by the shown revision, and opening `ShotSheet` passes `initialRevision={openRevision}` so the sheet opens on the previewed alternate. `Storyboard.verify.ts` checks `data-verify-shown` against `.shown` and the undismissed markers.
- **T2 (G1, G6):** `Storyboard` holds a single `playingKey`. Hovering (`mouseenter`) or focusing (`focusin`) a card with alternates mounts one `PagePlayer` (`[data-card-player="true"]`) looping `time` over `[shot.start, shot.start + duration)` via `requestAnimationFrame`, and tears it down on `mouseleave`/`focusout` so every other card keeps `PageStill`. Switching alternates while playing resets playback to `shot.start`. Under `prefers-reduced-motion: reduce`, cards keep `PageStill` and never loop.
- **T3 (G3, G4):** On Working versions (`edits` present), `ShotCard` renders `Use` and `Not this` buttons above `button.open` (`z-index: 3`), visible on `:hover`, `:focus-within`, and `.dismissing`. `Use` dispatches `shot-alternate` and updates subsequent shot start times; `Ctrl+Z` / `Meta+Z` on the Storyboard grid undoes it. `Not this` opens an inline reason form (`Reason for Not this`) that submits `shot-alternate-dismiss`, resets the card to the in-reel alternate, and restores focus to `button.open` (or cancels on `Escape` and restores focus). Both buttons are disabled for the in-reel alternate and absent on frozen versions.

## Impeccable Critique of the Card States

- **Mechanical detector (`detect.mjs --json web/src/Storyboard.tsx`):** `0` findings (`[]`).
- **Heuristic & visual review (`36/40`, Excellent):**
  - **The Light Table & One Light Rule:** `.shot.has-alternates` remains the sole stacked paper at rest on the grid. The in-reel dot uses neutral `var(--ink-2)` fill while the Tally accent (`var(--light)`) is reserved strictly for the active shown-dot outline ring and the `Use` action border/text.
  - **Progressive disclosure & layout stability:** `.shot-alternate-actions` reserves its row height (`min-height: 28px`) with `opacity: 0; pointer-events: none` at rest and reveals on `:hover`, `:focus-within`, `.dismissing`, and `@media (pointer: coarse)`, avoiding layout shift on hover while keeping controls reachable by keyboard (`Tab`) and assistive technology.
  - **Minor P3 observation:** The dot buttons (`13px × 13px`) match `docs/mockups/2026-10-18-inline-alternates-card.html` visually; keyboard users also have `ArrowUp`/`ArrowDown` on the stretched card button so fine pointer targeting is never required.

## Checks Run

- `npm run typecheck`: Passed (0 errors).
- `npm run build`: Passed (`dist/web` built in 459ms).
- `npx playwright test -c tests/e2e/alternates.config.ts --workers=1`: **9/9 passed** (including dark/light × 5 viewport widths `390, 768, 1024, 1272, 1600`, T1 preview/pins/sheet handoff, T2 hover/focus loop & reduced motion, and T3 Use/Undo/Not this/Escape/frozen).
- `npx playwright test -c tests/e2e/parts.config.ts --workers=1`: **6/6 passed**.
- `npx playwright test -c tests/e2e/working.config.ts --workers=1`: **2/2 passed**.
- `npx vitest run tests/web`: 4/5 files passed (50 tests); 1 pre-existing failure in out-of-scope `tests/web/editor-settings.test.ts` (`actionForKey(DEFAULT_SETTINGS.keys, 'M')` expecting `'rail'` vs `'marker'` from commit `877982aafea2`).

## Deviations

- None on the inline alternates card scope. Out-of-scope `tests/web/editor-settings.test.ts` was left untouched per the brief's file fence.
