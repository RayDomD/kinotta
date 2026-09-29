# web/src/stage

The only module in the UI that touches a version page. It loads the page in a same-origin frame and drives it
through the page's global `seek(seconds)` (ADR 0001, D9).

## Public interface

`index.ts` exports:

- `PageStill({ pageUrl, time, title })`, a live still. The frame is created only once the still scrolls into
  view (IntersectionObserver, 100px margin). It loads `index.html?render` at a fixed 1920x1080 viewport scaled
  to fill a 16:9 box, then `await Promise.resolve(seek(time))` and two animation frames. `data-state` on the
  root is `idle` (not in view yet), `loading`, `ready` or `failed`. A missing or throwing `seek` shows a plain
  labelled placeholder with the reason, never a black frame. Stills take no focus and no pointer events.
- `seekPage(window, seconds)`, the seek-and-wait step on its own, for the enlarged frame in T3.
- `renderUrl(pageUrl)`, `PAGE_WIDTH`, `PAGE_HEIGHT`.

## Does not handle

Hit-testing on `data-el` elements, playback, the issue list for broken pages (T7). Later tickets add them here.

## Dependencies

React, and a version page URL from `web/src/api`.
