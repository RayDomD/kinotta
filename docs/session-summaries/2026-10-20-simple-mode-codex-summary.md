# Simple mode phases 2 and 3

Completed the [assigned brief](../briefs/2026-10-20-simple-mode/codex-phase-2-3.md) and the [execution plan](../plans/2026-10-20-simple-mode-codex.md). Approval is removed, numbered history is replaced by Current and Undo/Redo, and Simple mode supplies the local profile, Drop/Make, portrait preview, required-note timeline pins, navigation and copy-request Regenerate. The detailed editor opens the same Working reel. Animated alternatives and chosen Working playback remain verified.

The unchanged baseline had 934 passed, 2 failed and 1 skipped. The post-change full run had 918 passed, 6 failed and 1 skipped after removing 12 approval tests. Its four additional failures passed after focused fixes or an unchanged CLI rerun; the two baseline failures remain. Typecheck, build and whitespace checks pass. Twenty-four focused browser scenarios were verified across the main run and reruns. [Full results and exact failure names](../briefs/2026-10-20-simple-mode/codex-result.md).

Deviations: the default Vitest worker run stalled, so both complete runs used `--no-isolate`. Tests that previously navigated frozen history now inspect Current or the retained storage API. Review keeps its existing Undo/Redo controls; Storyboard uses the new rail controls. Profile persistence is browser-local, as in the approved mockup. Independent design-review delegation was not authorized.

Later phases remain out of scope: automatic cutting, agent launch, generated alternatives, new/changed-only dispatch and export changes. Regenerate uses existing comment batches. No push or merge.

Visual evidence: [desktop](2026-10-20-simple-mode-codex/desktop.png) and [mobile](2026-10-20-simple-mode-codex/mobile.png). Both were inspected; the portrait frame stays clear of the timeline and the mobile page has no horizontal overflow.
