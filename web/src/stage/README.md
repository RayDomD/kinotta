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
- `PinMark({ number, x, y, marked?, text?, tagStyle?, stack? })`, a saved pin (D25): a small anchor hex on the spot and
  a numbered tag. Without `tagStyle` the tag sits below right of the anchor, flipped near the edges, stepped `stack`
  tag heights clear of nearby tags.
- `PinFrame({ pageUrl, time, title, footageUrl?, onPick, onElements, draft, draftContent, pins })`, the enlarged frame. Same
  loading and seeking as a still. A transparent layer over the frame takes the pointer (the frame itself keeps
  `pointer-events: none`). For the pointer position, the stage maps it into page coordinates, calls
  `elementFromPoint` in the page and takes the closest `[data-el]` that has a box (a named wrapper with no size of
  its own hands the hit to its nearest named ancestor). The page is only read, never changed: the
  ice-blue outline and the name tag are drawn in the parent. The tag goes above, below, right or left of the
  element, at the first spot that stays inside the frame and off the element, every other named element, every
  visible leaf element and every line of text (ancestors of the hovered element excepted); if none is clean it
  takes the least overlap, always clamped inside the frame. `onPick({ x, y, element })` reports a click as
  fractions of the frame and the element name or null. `onElements` reports the visible named elements
  (`{ name, x, y }`, centre as fractions) after each draw, for a keyboard pin path. `draft` draws the pin being
  placed and floats `draftContent` (the comment input) beside it by the same placement rule. `pins` (`FramePin`:
  `{ id, number, x, y, element, text, marked? }`) draws each saved pin as a `PinMark` whose tag goes beside its
  element (or its anchor) by the same rule, clear of every anchor and earlier tag, with a hairline to the anchor. `data-state` is
  `loading`, `ready` or `failed`.
- `footageUrl` on both (a panel shot of a footage reel): a muted, paused `<video>` of the footage (`preload="auto"`,
  `playsInline`) is stacked under the clip frame and seeked to the same `time` (`currentTime`, `seeked`, two animation
  frames). The clip page has a transparent background so the footage shows through; the frame element carries
  `color-scheme: normal` so Chrome paints no opaque backdrop behind it. Without `footageUrl` (a cutaway) the clip is
  shown alone. The video has `data-footage` `loading`, `ready`; a file that fails to load is replaced by a labelled
  placeholder (`.footage-failed`), never black. Hit-testing is unchanged: a click over footage finds no named
  element and reports a position only.
- `unavailable` on both: a reason the shot is known not to render (found statically); the page is not loaded and the same
  labelled placeholder shows it.
- `PagePlayer({ pageUrl, time, title, className?, onPhrases? })`, the page while a reel plays (Review). Loads the page like a
  still, then calls its global `seek(time)` on every change of `time` without waiting for the frame to draw, so the
  caller can drive it once per animation frame. Seek problems are reported like a still's. On load it reports the
  caption phrases the page holds (`{ start, end, text, spoken }` from its `[data-caption]` scenes, `spoken` running from the first word's start to the last word's end), so the editor shows the
  engine's own phrase breaks. The page is only read. The caller sizes the box (`className`); the frame fills it.
- `PagePlayer` also takes `clipTiming` (`ClipTiming`: `clipOf(scene)`, `spans` by clip id in reel seconds, `offset` of page
  seconds over reel seconds). Before each seek it sets each listed clip's scene `data-start` and `data-duration` to its
  new times and puts every other clip scene back to its built ones. The engine reads those on every seek, so a clip slid
  or trimmed before Save, or being dragged, plays at its new time with no rebuild.
- `PagePlayer` also takes `captionWords` (per caption scene, the words to show in reel seconds, or null for the built
  ones). Before each seek it swaps an edited caption's word spans (an empty list hides the caption) and restores the
  rest. The engine keeps the spans it found at load, so the player marks `said` and `now` on swapped spans itself after
  each seek, with the engine's hold. With `onCaptionText`, a double-click or Enter on the caption handle opens a field
  over the caption with its text; Enter reports `{ index, text }`, Escape or leaving the field cancels.
- `PagePlayer` also takes `elements` (`ElementEditing`: `offsets` by clip id and element name, `clipOf(scene)`, optional `onChange`). The offsets are applied to the page as inline CSS `translate` and `scale` (the page is changed only by that, like the caption preview). With `onChange` set, a click on an element selects it (Alt: the whole clip, `CLIP_ROOT`), a drag moves it, the corner grip scales it about its centre, and `onChange({ clip, element, x, y, scale })` reports the result. The outline, grip, name tag and ghost of the original place are drawn over the frame, never in the page. Offsets are in the element's parent px (a drag is divided by the ancestors' scale, so a camera zoom does not skew it).
- `useSeekProblems(pageUrl)`, the runtime contract issues seen while driving that page (`{ kind: 'no-seek' }` or
  `{ kind: 'seek-threw', time, detail }`), each once however many stills hit it. Stills and frames report their seeks here.
- `seekPage(window, seconds)`, the seek-and-wait step on its own.
- `renderUrl(pageUrl)`, `PAGE_WIDTH`, `PAGE_HEIGHT`.

## Does not handle

Playback timing (the Review module decides when to seek; the player only seeks) and word pins. The issue list itself is drawn by the app.

## Dependencies

React, and a version page URL from `web/src/api`.
