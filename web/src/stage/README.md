# web/src/stage

The only module in the UI that touches a version page. It loads the page in a same-origin frame and drives it
through the page's global `seek(seconds)` (ADR 0001, D9).

## Public interface

`index.ts` exports:

- `PageStill({ pageUrl, time, title, footageUrl? })`, a live still. The frame is created only once the still scrolls into
  view (IntersectionObserver, 100px margin). It loads `index.html?render` at a fixed 1920x1080 viewport scaled
  to fill a 16:9 box, then `await Promise.resolve(seek(time))` and two animation frames. `data-state` on the
  root is `idle` (not in view yet), `loading`, `ready` or `failed`. A missing or throwing `seek` shows a plain
  labelled placeholder with the reason, never a black frame. Stills take no focus and no pointer events.
  `PageStill` also draws its `children` (the still's pins) over the page.
- `PinFrame({ pageUrl, time, title, footageUrl?, onPick, onElements, draft, draftContent, children })`, the enlarged frame. Same
  loading and seeking as a still. A transparent layer over the frame takes the pointer (the frame itself keeps
  `pointer-events: none`). For the pointer position, the stage maps it into page coordinates, calls
  `elementFromPoint` in the page and takes the closest `[data-el]`. The page is only read, never changed: the
  ice-blue outline and the name tag are drawn in the parent. The tag goes above, below, right or left of the
  element, at the first spot that stays inside the frame and off the element, every other named element, every
  visible leaf element and every line of text (ancestors of the hovered element excepted); if none is clean it
  takes the least overlap, always clamped inside the frame. `onPick({ x, y, element })` reports a click as
  fractions of the frame and the element name or null. `onElements` reports the visible named elements
  (`{ name, x, y }`, centre as fractions) after each draw, for a keyboard pin path. `draft` draws the pin being
  placed and floats `draftContent` (the comment input) beside it by the same placement rule. `data-state` is
  `loading`, `ready` or `failed`.
- `footageUrl` on both (a panel shot of a footage reel): a muted, paused `<video>` of the footage (`preload="auto"`,
  `playsInline`) is stacked under the clip frame and seeked to the same `time` (`currentTime`, `seeked`, two animation
  frames). The clip page has a transparent background so the footage shows through; the frame element carries
  `color-scheme: normal` so Chrome paints no opaque backdrop behind it. Without `footageUrl` (a cutaway) the clip is
  shown alone. The video has `data-footage` `loading`, `ready`; a file that fails to load is replaced by a labelled
  placeholder (`.footage-failed`), never black. Hit-testing is unchanged: a click over footage finds no named
  element and reports a position only.
- `seekPage(window, seconds)`, the seek-and-wait step on its own.
- `renderUrl(pageUrl)`, `PAGE_WIDTH`, `PAGE_HEIGHT`.

## Does not handle

Playback, word pins, the issue list for broken pages (T7). Later tickets add them here.

## Dependencies

React, and a version page URL from `web/src/api`.
