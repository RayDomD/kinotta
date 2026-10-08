# web/src/review

The Review tab: the reel playing in the Gate well, with lanes on a zoomable time axis under it.

The newest saved reel uses `MediaEditor`, including single-source and code reels adapted in memory. Native saved
versions use it directly. Older versions without a media model and footage awaiting its first version retain the
legacy player. Frozen versions are never rewritten by opening Review.

## Media editor

`MediaEditor` shares the three-column `EditorWorkspace`: the collapsible Reel/Media rail, the frame and timeline,
and the Clip/Edits/Comments panel. Surviving section spans sit in the Reel rail. The middle column can shrink, the
transport wraps, and only the timeline pans and zooms.

- `NativeLanes` draws Footage, Inserts and named audio owners. Track gain and Mute are saved and rendered. Solo is
  preview only. Footage sound stays locked to its picture. Dragging an insert's sound to an owner detaches it.
- `EditorialLanes` draws graphics, captions, words and pins. Words and captions edit inline. Broken attachments
  retain Reattach markers and explicit repair choices in Clip settings. Graphic drag drafts update the preview
  before release, and only the committed gesture enters the edit list.
- `TimelineOverview` keeps the whole reel above Footage. Its draggable window and keyboard slider pan the same
  time window used by every detailed lane without moving the playhead.
- `ClipSettings` holds applicable Sound, Timing, Picture and Placement controls. Double-click or Enter on a bar
  opens it. Right-click exposes settings, Mute, Split, Duplicate, Replace and Remove.
- `MediaLibrary` is one path list with search and type filters. Preview uses the main frame. Plus adds at the
  playhead, and dropping chooses a lane or owner. First use registers a project path and reuses identical content.
  Failed rows expose Retry or Relink.
  A failed frame preview offers Retry without closing the frame.
- `EditorToolbar` and the keyboard handlers consume one registry. Settings rebinds every shortcut and persists
  editing defaults, rail/label/timecode preferences and full theme/accent per viewer in browser storage.
- `useMediaPlayback` uses Web Audio for the shared mix, including live unsaved envelopes, track controls and
  seeking. The picture follows that clock and holds it while loading. Failed sound, picture or speech has Retry
  on its clip and a frame note inside the affected span. A selected snip auditions a lead-in and excludes the
  selected interval from both sound and picture before any edit is stored.

Each meaningful component has DOM verification attributes and a `.verify.ts` companion. Browser tests run live
invariants and deliberate invalid states, including the retained A6 harness.

## Public interface

`index.ts` exports `Review({ reel, state, message?, version?, comments, section?, edits?, transcription?, actions? })`.

- Without `edits` the reel plays read only, with no edit tools.
- `actions` sits at the end of the heading row: the app puts Approve or Withdraw and Render ▾ for the version on show
  there (`web/src/Renders.tsx`, mockup `docs/mockups/2026-10-06-review-picker-merge.html` option C). Picker is part of
  Review: the queue and past renders are in the top bar's render menu, and a finished render plays in Review's place.

- `state` is `loading`, `error`, `none` (the reel has no version, so its footage plays alone) or `ready` (then `version` is set).

## Legacy player

These controls apply to older versions without a native media model and footage awaiting its first version.

- The player stacks the footage `<video>` under the version page (`stage`'s `PagePlayer`). The video's clock drives the
  reel: playback follows the version's `pieces` in order and jumps over snipped stretches; without footage (a code-only
  reel) a clock drives it. Each animation frame the timeline time is set and the page is seeked to it.
- Space plays and pauses, Left and Right step a frame (Shift: a second), Home and End jump to the ends, `+` and `-`
  zoom. Typing in a field and a focused button's own Space are left alone. Dragging along the lanes scrubs.
- Lanes: Reel (an overview of the whole reel with the zoom window and the playhead; drag it to move the window),
  Footage (pieces, with snips and cuts marked), Clips, Captions (the page's own phrases), Words, Pins, axis. The window
  follows the playhead.
- The timecode reads `mm:ss.ff` in Doto with the reel's length.

- Editing (the newest version of a footage reel): `useEdits(slug, refresh)` holds the reel's edit list from the API and adds,
  removes one, undoes, redoes, discards and saves. Ctrl or Cmd with Z undoes, with Shift+Z or Y redoes (not while typing in a field);
  the Undo and Redo buttons sit above the cards, and each card has a Remove button. The unsaved operations are applied over the version's pieces with the core's own model, so the player,
  the Footage lane (SNIP joints with their length), clips, captions, words and pins show the edited reel; the page is the saved
  version's, seeked to the matching saved time. Select (V) and Snip (S) tools: with Snip on, dragging the lanes selects a
  stretch, then Snip (or Enter) adds the operation. Until then the selection plays as if snipped: the picture pauses on its end (the
  frame the snip would join to), and Play or Space starts 2 s before it and goes straight on past it (`usePlayback`'s `skip`). `ReviewSide` is the right column: Edits (numbered cards, Save as
  v<n+1>, Discard) and Comments (the comments panel, passed in).
- Captions in the frame: double-click the caption on show (or Enter on its handle) to retype the whole phrase, adding or
  removing words; Enter adds a `phrase-text` operation. Word fixes and retyped phrases show in the page, the Captions lane
  and the Words lane before Save (`phraseTexts` works out each phrase's words; `PagePlayer` swaps them in).

## Does not handle

Recording, free layout and automatic ducking are outside this editor change. Saving and rendering belong to the
server. Reading and interacting with an authored page belongs to `stage`. Network calls go through `web/src/api`.

## Dependencies

React, `web/src/api` (the version and footage URLs), `web/src/stage` (`PagePlayer`), `web/src/timecode.ts`.
