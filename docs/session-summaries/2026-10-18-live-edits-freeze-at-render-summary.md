# Live edits and freezing

The implementation merged into `main` through `5f3a23d` on October 15. This summary closes the original plan during the October 18 cleanup; it does not describe new editor work.

Working keeps edits and undo/redo durably. Final, Overlay and comment hand-off freeze changed content; unchanged content reuses its frozen version. Draft captures inputs for its job without adding a numbered version. Legacy pending edits migrate without double application. Agent operations name their author, and later edits replay onto the agent's next build with conflicts flagged. Review opens Working, shows frozen history and author labels, and removes Save and Discard.

The source brief records regression evidence for identity and recovery, the freeze boundary, missing sources, concurrent freezes, hand-off, authorship and all operation reversals. The October 15 integration verified Working/frozen navigation and retained the resizable viewer. See [the source run](../briefs/2026-10-14-live-edits-parts-alternates/1-chain-codex.md) and [the integration summary](2026-10-15-viewer-alternates-merge.md).

The October 18 cleanup adds owner checks for temporary Draft captures. A real second server process deleted a live capture in the failing regression; with the fix it retains the inputs and the render completes. A separate child process exits after capturing, and startup removes its abandoned capture. All 12 Working render tests pass. `DESIGN.md` now describes Working and freezing.

Native media preservation at frozen boundaries remains the existing ADR 0003 behavior. Draft video references project footage; graphics and audio are captured. The older full-suite failures were not proof of a passing suite; the cleanup's verification record supplies the new full-run result.

Current cleanup verification and UI review are recorded in [the cleanup summary](2026-10-18-codex-run-cleanup-summary.md).
