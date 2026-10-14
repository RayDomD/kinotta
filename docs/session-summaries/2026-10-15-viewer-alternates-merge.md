# Viewer and alternates integration

The owner requested merging the implemented viewer/transport/clips and alternates branches on October 15, 2026. The combined checkout is `codex/viewer-alternates-merge`.

Both implementations were uncommitted. Viewer work was preserved in `e67891c` on `codex/viewer-transport-clips`. The live-edits/parts/alternates checkout was captured in `0bffa46` on `codex/alternates-integration-source`, with its original `bd31368` parent. The original alternates checkout, its branch, and its uncommitted files were left intact. Local reels, footage, server settings, and generated test logs were excluded from both snapshots.

## Reconciliation

- Resolved seven conflicting files, retaining both alternate operations and gap closing in validation, both marker and parts-page API exports, viewer focus and parts Storyboard shell attributes, and Working/frozen behavior alongside the resizable viewer.
- Gap closing now records its author, including the internal move operations. A frozen-history regression covers undoing gap closing onto the next authored version.
- Shot stills load the same Working parts page as the picture, at the Working shot start. Footage still requests use the working base version for preserved sources.
- Focus pin saving on a code-built reel with sound previously failed because the Working comment path looked for a footage plan. It now resolves sound relative to the code reel's working base. Pin errors remain visible in focus.
- The timeline keyboard check waits for editing controls to be ready after version refresh before moving a placement.
- The mobile Working check measures the visible tracks pane when checking separation from the side panel. The timeline content can be taller than the pane because it now scrolls inside it.
- Authoring guidance retains animated parts alternates and durable Working edits, with freezing at Final/Overlay render or comment handoff.

## Verification

- Typecheck and production build pass. The existing bundle-size advisory remains.
- Ten targeted core files passed 63 tests covering alternates, markers, still extraction, and Working reversals.
- Five alternates browser cases passed, including an added regression that first failed on the stale frozen clip still. It verifies the chosen revision in both picture and clip still, shot stepping, focus restoration, frozen history, and undo.
- Native lanes, editorial lanes, and keyboard/drag checks passed. The combined viewer, timeline window, and review shell run then passed all four cases, including focus pin saving, markers, gap closing/undo, sound prompt chips, and responsive dark/light checks.
- Seventeen additional core files passed 164 cases covering Working state/reversals/handoff/render, parts manifests/build/assembly/carry/batches/change detection/sound/render, code edits/media freezes, comments, edit-model operations, and author attribution. The reversal file overlaps the first core run and adds the frozen gap-closing case.
- Playwright: `working.config.ts` passed 2 cases; `parts.config.ts` passed 6; `part3-existing.config.ts` passed 33. Together with `alternates.config.ts`, these are 46 passing end-to-end cases. Tests ran with one worker.
- The first Working browser run failed its old mobile timeline-height assertion. Measuring the visible scrolling pane corrected that expectation, and both Working cases passed on rerun. No implementation change was needed for that assertion.
- Final typecheck and `git diff --check` pass. No conflict markers remain.

## Inherited limitations

This merge preserves the implemented alternates chooser. The newer inline animated Storyboard-card interaction recorded in `AGENTS.md` remains a separate pending change; merging does not implement it.

The alternates handoff records a risk that a second server on the same project can remove a live Draft's temporary capture inputs. That existing behavior was not changed by this integration.

The full core suite was not rerun for this merge. The source handoffs document their earlier full-suite failures and verification limits; the checks above establish the tested integration paths.
