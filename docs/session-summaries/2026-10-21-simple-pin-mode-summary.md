# Simple pin mode

Completed 2026-10-21 in `.worktrees/simple-mode`, branch `feat/simple-mode`. Implementation: `422a32d` (`feat: add simple pin mode with anchored note bubbles`). Local commit only; no push.

Pin mode starts off. Picture clicks leave no draft; timeline clicks seek. The pin icon beside the transport or P toggles pin mode. In pin mode, the existing hex cursor and element hover appear, and a picture or timeline click pauses and drops a draft hex with a small, autofocused note bubble beside it. Timeline pins retain their centre position. Enter saves a required note to Your pins, Shift+Enter inserts a newline, and Esc cancels. Empty click-away cancels; nonempty click-away retains the draft. Pin mode remains on after saving or cancellation until toggled off.

Removed the lower `sm-composer` and Simple playhead range input. The timeline supports arrows, Shift+arrows, Home and End for seeking. Bubble placement uses the existing content-aware helper, falls back to keeping the draft hex visible over dense graphics, and stays inside the frame on desktop and mobile. Simple pins add no Working operations. Detailed editor pin behavior is unchanged.

Verification:

- `npm run typecheck`: passed.
- `npm run build`: passed, with the existing Vite chunk-size advisory. The final e2e run rebuilt the final source successfully.
- `npm run test:e2e -- tests/e2e/simple-mode.spec.ts tests/e2e/review.spec.ts tests/e2e/pins.spec.ts tests/e2e/alternates.spec.ts`: **40 passed** in 1.5 minutes. Coverage includes mode off/on, icon/P, anchored bubble/autofocus, Enter/Shift+Enter, required notes, Escape, empty/nonempty click-away, desktop/mobile edge placement, saved pins, brackets, timeline pins, footage-only picking and detailed editor regressions.
- The initial run passed 39/40; its failure was a test helper querying the timeline's previous accessible name after switching modes. Corrected the helper before the passing final run. Visual review also prompted the draft-anchor visibility fallback.
- `git diff --check`: passed. Before/after screenshots are in `tests/artifacts/simple-pin-mode/`, including live app and isolated fixture evidence at 1280x800 plus a 390px edge check. Live drafts were cancelled without saving. No e2e `start-server.mjs` processes remained; live app/API left running.

Scope: changed only the plan's affected implementation/test files, this plan's completion artifacts and requested screenshots. No server, detailed pin-flow, other-plan or protected PNG edits. The completion note is appended to the original brief at the main workspace's `.herdr/briefs/2026-10-21-simple-pin-mode-codex.md`. No scope deviations.
