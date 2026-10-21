# Simple mode frame and agent run timer

Plan: [Simple mode frame and agent run timer](../plans/2026-10-21-simple-frame-and-run-timer.md).

## Changes

- Simple mode uses a shared 16:9 frame ratio for the studio and b-roll plan preview. The client has no per-reel dimensions, so this uses the plan's fallback matching the current 1920×1080 render format.
- The agent banner has a separate Doto `m:ss` elapsed timer. A local one-second tick derives from `createdAt`, with server `elapsedSeconds` as its minimum. Only the timer component rerenders on each tick; polling remains every three seconds.
- Every completed state retains the server's final duration, including succeeded, failed, cancelled, interrupted and copy-ready. The timer uses non-announcing timer semantics to avoid repeated screen-reader announcements.
- Simple mode uses block flow within its existing scrolling container. The wider frame otherwise caused studio content to overlap the copy-request disclosure below it.
- The owner-authorized portrait props in `Review.tsx` and `MediaEditor.tsx` no longer request a portrait page. Live browser inspection confirms the iframe uses 1920×1080.

## Verification

- Typecheck and production build pass. Vite reports its existing bundle-size warning.
- `npm run test:e2e -- tests/e2e/simple-mode.spec.ts tests/e2e/review.spec.ts`: all 11 tests pass (55.9s).
- Timer coverage passes for all four active states, advancement between polls without another request, final totals in five terminal states, and retention after reload.
- Existing pin, navigation, clipboard and editor-switch coverage passes. The 500px viewport scroll check passes.
- The clipboard fallback is clickable after the layout correction. Its new iframe-dimension assertion exposed a second forced-portrait prop in `MediaEditor.tsx:568`; the owner explicitly approved changing only that prop, and the assertion now passes.
- Live screenshot inspection confirms the complete landscape graphics composition and the separate timer. At 1280×500, the scrolling container has 1017px of content and reaches scrollTop 517.
- `git diff --check` passes.

## Scope and evidence

- The owner removed Goal 2; the Impeccable pass is left to AGY. No critique, audit, polish or delegation was performed.
- Screenshots are under `tests/artifacts/simple-polish/`. The before captures are actual pre-edit captures at 1280×800 of the default reel; its footage did not render reliably. After captures use the available graphics options reel. Agent banners use an intercepted local response, not a launched agent run.
- Automatic approval review rejected temporarily restoring old source files for improved baseline captures because an interruption could discard pending edits. The action was not executed; the original captures were retained.
- No server, stage, shared editor styles, skill or pre-existing PNG changes were made.

## Commits

- `1a8d3da` — `feat: match simple preview frame and show agent run timer`.
- Documentation closeout: `docs: complete simple frame and timer plan` (this summary, the plan, regenerated dashboard, and brief execution record).
