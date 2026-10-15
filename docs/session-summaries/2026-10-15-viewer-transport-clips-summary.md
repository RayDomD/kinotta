# Viewer, transport and clips

Implemented on `codex/viewer-transport-clips`, from `0f3d452`. The owner approved the existing viewer design and the remaining additions on October 15. Their preview is saved in `docs/mockups/2026-10-15-viewer-additions.html`.

Review now has one transport for both native and retained legacy players: the hex Play button, exact Playhead entry, a keyboard and pointer scrubber, frame stepping, shot stepping, pin ticks and marker diamonds. Scrubbing sends at most one seek per animation frame and flushes the final position on release or cancellation.

The picture starts at 55% of the main column's height. A pointer or keyboard divider remembers a share from 25% to 80%; tracks scroll independently and the toolbar stays visible. F focuses the picture, F or Escape returns, and pinning works in focus. Fit moved to Shift+F. Existing saved defaults migrate without creating duplicate bindings. The page contract remains a fixed 1920 by 1080 viewport; the CSS frame sizing accepts an aspect ratio without overflowing its pane.

Footage clips request at most twelve cached stills, approximately one per 96 pixels, only while visible. Code-built picture clips use one lazy live still. Server extraction verifies the source through existing media resolvers, bounds time and width, stages cache files atomically and limits concurrent processing to two requests. The cache is keyed by source content, time and width.

The clip menu shows binding hints and Remove and close the gap (Shift+Delete). It is one operation and one undo step. Free sound ripples only on its track; inserts ripple only on their picture layer. The main sequence continues to ripple through its existing footage attachment rules. Pointer drops use stationary row bounds so a raised dragged clip cannot cover its destination.

M creates a marker and R toggles the Media rail. Markers have editable names and times, appear on the time row, overview and transport, and attract snapping. They are persisted per reel outside versions, comments and render inputs. Native and authored clip drags show their snapped position. ? opens a modal shortcut sheet populated from the action registry. Sound prompt chips append suggestions without generating anything or replacing typed text. The Sound tab is also available on newest reels that use the native adapter.

Timed frame pins on code-built reels are accepted by the core, preserving the frame chosen in focus mode rather than refusing the native adapter's pin for an empty shot identifier.

## Verification

- `npm run typecheck` and `npm run build` passed. The build retains its existing bundle-size advisory.
- Nine core files passed 194 tests: edit-model, media-model, editing, media-http, code-only-edits, code-media-save, graphic-media-save, viewer-state and media-stills.
- Seven comment/state files passed 56 tests: comments, media-pins, word-pins, batch, section-batches, media-stills and viewer-state. The latter two overlap the core run.
- New viewer browser tests cover keyboard scrubbing and stepping, settings migration, divider invariants and persistence, focus restoration, focus pinning, markers through rename/reload/removal, gap closing and undo, snapping indicators, prompt chips and lazy shot stills.
- Existing native-lanes, editorial-lanes, editor-keys-drag, review-shell, timeline-window and sound-generation checks passed. Tests use one worker. Track tests reveal more tracks with the divider and remeasure a destination after a move changes row stacking. Fit and menu expectations follow the new bindings and actions.
- All 40 requested end-to-end cases passed: editing, lanes, pins and snip-save passed 37 cases; the revised review suite passed its three cases. Its scrubbing gesture now targets the shared transport.
- Dark and light themes were measured at 390, 768, 1024, 1272 and 1600 pixels with no horizontal overflow and a visible frame. At 1440 by 900, the default frame meets the 55% check. Measurements and screenshots are under `docs/session-summaries/2026-10-15-viewer-transport-clips/`.
- `git diff --check` passed.

## Existing failures

Five tests in `render-media-preview.test.ts` failed identically in an isolated copy of the starting commit, before this implementation:

- Legacy word pinning expects a word control before opening its caption.
- Repeated-placement word pinning has the same expectation.
- Independent caption timing expects a hidden word handle.
- The Undo/Solo preview test expects a hidden word edit control.
- The speech transcription test expects its word edit control before opening the caption.

These baseline failures remain outside this plan. The old editor-key test also expected the code-built row to be named Graphics; the starting editor already names it Picture. That assertion was corrected so the keyboard and drag checks could run.

Impeccable commands are not available in this session. A manual visual and accessibility review checked neutral surfaces, pin/marker distinctions, full-frame thumbnails, keyboard controls, focus-mode pin entry and responsive overflow. The thumbnail overlay's CSS initially interfered with the insert sound handle; that was corrected and the drag test passes.

## Integration

No commits, merges or pull requests were created. The live-edits/parts/alternates chain uses the same editor files and needs reconciliation when integrated. Pre-existing changes to `skill/kinotta/SKILL.md` and untracked local reel/media data were left intact. Verification edits used copied fixtures.
