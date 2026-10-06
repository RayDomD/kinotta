# web/src/review

The Review tab: the reel playing in the Gate well, with lanes on a zoomable time axis under it.

## Public interface

`index.ts` exports `Review({ reel, state, message?, version?, comments, section?, edits?, transcription?, label?, above? })`.

- Without `edits` the reel plays read only, with no edit tools: Picker shows it this way, naming the region with `label`
  and putting its versions table in `above`, inside the same `<main>`.

- `state` is `loading`, `error`, `none` (the reel has no version, so its footage plays alone) or `ready` (then `version` is set).
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

Blade and reorder, word, clip and element edits and the hand-off are later tickets. Comments are made and
shown elsewhere; Review only draws their pins. It never reads a version page itself; that is `stage`'s job.

## Dependencies

React, `web/src/api` (the version and footage URLs), `web/src/stage` (`PagePlayer`), `web/src/timecode.ts`.
