# Simple picture pins

Completed 2026-10-21 in `.worktrees/simple-mode`, branch `feat/simple-mode`. Implementation commit: `5f06048` (`feat: add simple picture pins and shared frame hover`). Committed locally; no push.

Simple mode keeps the picture picker active. Clicking pauses playback at the displayed moment and opens its required-note composer with the clicked coordinates and element name. Saved pins name the element in Your pins, draw the existing hex overlay, persist after reload and remain reachable through `[` / `]`. Timeline pins keep their centre position and null element. Browser checks confirm Simple pins add no Working operations.

The shared `PagePlayer` uses the existing hex cursor with centre dot, outlines the element under the pointer with ice glow and places its name tag outside the element using the existing content-aware placement helper. All feedback stays in the editor DOM. Hover follows keyboard seeks with a stationary pointer and clears on leave, blur, pick or mode/page change. The detailed editor gets the feedback and retains its pin-save flow.

Checks and evidence:

- `npm run typecheck`: passed.
- `npm run build`: passed. Vite reports its existing large-chunk advisory. The final e2e run also rebuilt the final source successfully.
- `npm run test:e2e -- tests/e2e/simple-mode.spec.ts tests/e2e/review.spec.ts tests/e2e/pins.spec.ts tests/e2e/alternates.spec.ts`: **39 passed** in 1.5 minutes. This includes the existing Review frame-pin save flow in alternates, storyboard/sheet pin regressions, and three new tests for Simple mode, shared editor hover/save and footage-only picking.
- Initial new-test failures were assertions: comparing rounded slider time with stored time, device-pixel click rounding, and measuring the frame after composer autofocus scrolled the page. Final tests measure at click time with pixel/serialization tolerance. Existing tests passed; no comparison run on `5f10f91` was needed.
- Before/after PNGs at 1280x800 are in `tests/artifacts/simple-picture-pins/`. Fixture captures show Simple hover, composer, saved pin/list and editor hover. Live-app after captures show Simple hover/composer and editor hover after page load. Live drafts were cancelled; saved-pin verification used isolated test projects.
- `git diff --check`: passed. No `start-server.mjs` processes remained after Playwright completed. Live app/API left running.

Footage-only finding: verified with a newly built footage reel, captions off and no generated graphics. Clicking at a quarter-frame horizontal position and 30% vertical saves those coordinates with element `null` and displays the hex. No centre fallback or `PictureLayers` change was necessary.

Scope: the owner widened the original brief after investigation found the missing shared hover. Reused existing styles/helpers, with no extra helper or CSS file. No server, skill, editor toolbar or detailed pin-save behavior changes. Protected modified PNGs were not edited or staged. The approved Goal still meets the Intent; plan marked Done and dashboard regenerated.
