# web/src/review

The Review tab: the reel playing in the Gate well, with lanes on a zoomable time axis under it.

## Public interface

`index.ts` exports `Review({ reel, state, message?, version?, comments, section? })`.

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

## Does not handle

Editing: Snip, Blade, the Edits panel, word, clip and element edits and Save are later tickets. Comments are made and
shown elsewhere; Review only draws their pins. It never reads a version page itself; that is `stage`'s job.

## Dependencies

React, `web/src/api` (the version and footage URLs), `web/src/stage` (`PagePlayer`), `web/src/timecode.ts`.
