# The timing contract

Every version is one HTML page the editor controls through time (ADR 0001 in the Kinotta repo).
For code-built reels, each scene is a movable shot on the Picture row. On every `seek(t)`, read
its current `data-start` and `data-duration`, and animate using `t - start`. Keep scene names
stable. A scene shows only during its own range, gaps show the page background, and overlapping
scenes paint in document order. Exit animations belong to their scene and work independently of
the next scene. Sound stays on the shared mix's reel time. Derive animation bounds from the
current scene attributes so a shot moved beyond the original reel length still plays.

Before handing off a page, change one scene's timing in the browser and seek inside and outside
its new range. Restore the original attributes afterward. A cached or hard-coded schedule fails
this check. `kinotta check` validates timing markup, but cannot prove arbitrary script behavior.

The editor loads `v<n>/index.html?render` in a 1920x1080 frame, calls `seek(t)` for each shot's
start, waits two animation frames (or 500ms, whichever comes first), and shows the result as that shot's still. A click on a still
lands on the `data-el` element under it.

## Folder layout

### Parts reels (new code-built reels)

Write the authored input at `reels/<slug>/shots.json`, with `contract: 2`, `duration`, `shared: "r1"` and ordered `shots` containing `{ name, revision, duration, title, description }`. Names are fixed portable folder names. Starts are computed, so omit `start` and `number`.

For a transparent reel, set `alpha: true` and keep the shared background transparent. The assembler emits the existing alpha page contract so Overlay uses the unchanged render engine.

Write each new revision at `shots/<name>/r<n>/` with `shot.html`, `shot.css`, `shot.js` and optional `assets/`. The fragment has one root `<section data-scene="<name>">` with named `data-el` elements. Every shot CSS selector starts under its own `[data-scene="<name>"]`. Put global styles in `shared/r<n>/shared.css`, with fonts and assets beside it. Dependencies stay inside their revision folder. Modules are self-contained, export `seek(local)`, and have no imports or global variables. Use `transform` for animation, reserving individual `translate` and `scale` for the owner's offsets.

Run `kinotta build <slug> --by <your name>`, then `kinotta check <slug>`. Kinotta generates `v<n>/index.html` and `shots.json`. Published revision folders are immutable, including assets. Change only the shots named by `Rebuild:` and reuse every other revision in the authored manifest. A shared revision change counts as changing every shot. A duration change moves later shots, while only attached sound follows. A sound attachment uses the shot name as `attachment.placement` and a local `attachment.time`. Kinotta generates the media anchor positions.

`parts-files` reports missing revision files, missing local dependencies and changed published bytes. `parts-name`, `parts-revision`, `parts-shared`, `parts-duration` and `parts-start` report malformed manifest values. Keep contract 1 reels in their existing layout unless the owner asks to convert them. An options request on a contract 1 reel is that ask.

### Converting a single-page reel to parts

For alternate requests, follow [alternates.md](../stages/alternates.md).

Convert the same reel. Never create a new reel to hold the alternates: the owner's comments, Working edits and version history stay with the reel they were made on. The conversion is the reel's next version, so a reel at v18 becomes parts at v19.

1. Start from the newest version's `index.html` and `shots.json`. Give each scene a fixed portable `name`, using its `data-scene` value.
2. Move each scene's markup, styles and script into `shots/<name>/r1/` as the fragment rules above describe, and the page's global styles, fonts and assets into `shared/r1/`. Keep every `data-el` name, so pins and the owner's offsets still find their elements.
3. Write the root `reels/<slug>/shots.json` with `contract: 2`, one entry per scene in play order with its current duration, title and description.
4. For the shot the batch heading names (`Shot 03 · 3 alternates` under `Convert to parts:`), write one further revision per extra answer and add `alternates` to that shot as described below.
5. Run `kinotta build <slug> --by <your name>` and `kinotta check <slug>`. Build publishes `v<n+1>` in the same reel. Never edit or remove the single-page `v<n>` folders.

Unsent comments carry onto the parts shot playing at their time and follow its name from then on.

For a parts options request, add two to four `alternates` to that shot: each `{ revision, label, title, note, duration }`. Give labels such as A, B and C, a distinct title, and a one-line note explaining the difference. Write one immutable revision per answer. List the recommended answer first and use its revision and duration on the shot. Omit `choiceMade` on a new options answer so the Storyboard reminds the owner to choose. The manifest's total duration follows the revision in the reel.

The batch names the alternate in the reel, each dismissed alternate with its reason and alternate-specific pins. Answer those labels explicitly. When a later manifest leaves `alternates` out, build preserves undismissed options from Working. An explicit list replaces the answer. Keep the list within four entries. Published fingerprints, dismissals and owner choices are Kinotta's metadata, carried by build and freeze.

Alternatives include finished motion by default. Supply each revision's animation in its self-contained `shot.js`, driven entirely by `seek(local)`. The same local time must reproduce the same frame after forward or backward seeking and replay. Use `transform` for authored motion, leaving individual `translate` and `scale` for owner edits. Avoid timers, autonomous CSS animations and animation loops. Still-only concepts require an explicit request.

Keep the shot's fixed `name` and retain existing `data-el` names for equivalent components, so swapping preserves editing and feedback targets. Prefer the current duration unless the alternative needs a different length; declare that length accurately. Reuse unaffected shot and shared revisions, and keep sound on Kinotta's shared mix. Each label describes both the visual treatment and its motion. Before delivery, check every revision, compare early and later frames, and seek backward to confirm repeatability. Verify that Use replaces the shot in Working Review and Undo restores it. Storyboard thumbnails remain still previews of these animated revisions.

### Existing single-page reels

```
reels/
├── brand.md                 brand file (checked once)
├── taste.md                 legacy project taste list (fallback, migrated into styles)
└── <slug>/
    ├── reel.json            { "title": "Brand intro" }
    ├── v1/
    │   ├── index.html       the page
    │   ├── assets/          logos, images, fonts the page uses (copies)
    │   ├── shots.json       the shot list, written last
    │   └── comments.json    written by the editor when the owner copies a batch
    └── v2/
        ├── ...
        └── answers.md       your answers to the v1 batch
```

Files you may find or write inside a version folder, besides the page and `shots.json`:

| File | Who writes it | Meaning |
|---|---|---|
| `transcript.json`, `plan.json` | whoever built the version | The transcript and the plan it was built from. Every footage version keeps its own copy (copy them in when you build one; see `SKILL.md` section 6). |
| `kinotta-edits.css` | Kinotta | A code-only reel's moved and scaled elements. Copy it into your next version and keep the `<link>` to it in the page. |
| `edits.json` | Kinotta | The operations a Kinotta save applied. Never copy it into a new version. |
| `answers.md`, `comments*.json` | you, the editor | As above. |

At the reel level, `edit-list.json` (durable Working history), `handoff.json` (a batch is out) and
`.save/` are Kinotta's. Never read, write or delete them.

`reels/.kinotta/` is the editor's working state. Never read or write it.

## The page

- **Scenes.** Every timed piece of the page is an element with `data-scene="<name>"`,
  `data-start="<seconds>"` and `data-duration="<seconds>"`. Names are short kebab-case and unique.
  Every shot's start must fall inside a scene (`start <= t < start + duration`).
- **Elements.** Everything a reviewer could point at (headline, logo, card, button) carries
  `data-el="<name>"`, unique within its scene. Every scene that covers a shot needs at least one.
- **`window.seek(seconds)`.** A global function that shows the page exactly as it is at that
  second. It may return a promise. It must not throw for any time from 0 to the duration.
- **`window.DURATION`.** The reel's length in seconds, equal to `duration` in `shots.json`. The
  editor doesn't read it yet (it takes the length from `shots.json`); set it anyway so the page
  states its own length for the later render.
- **Deterministic.** The same `t` gives the same frame on every call and every load: no
  `Math.random()` without a fixed seed, no `Date.now()`, no network requests. Fonts and images
  load from `assets/` with relative paths; wait for them (`document.fonts.ready`) inside `seek` if
  the first frame depends on them.
- **Unanimated.** No CSS animations or transitions, no `requestAnimationFrame` loops, no timers.
  A scene is shown or hidden by `seek`, nothing else.
- **1920x1080.** Lay out for that viewport. `html` and `body` fill it with `overflow: hidden`.

A minimal page:

```html
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Brand intro v1</title>
<style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
  [data-scene] { position: absolute; inset: 0; display: none; }
  [data-scene].active { display: grid; place-items: center; }
</style></head>
<body>
<section data-scene="logo" data-start="0" data-duration="3"><img data-el="logo" src="assets/logo.svg" alt=""></section>
<section data-scene="promise" data-start="3" data-duration="4"><h1 data-el="headline">…</h1></section>
<script>
window.DURATION = 7;
const scenes = [...document.querySelectorAll('[data-scene]')];
window.seek = async (t) => {
  await document.fonts.ready;
  for (const s of scenes) {
    const start = Number(s.dataset.start);
    s.classList.toggle('active', t >= start && t < start + Number(s.dataset.duration));
  }
};
window.seek(0);
</script>
</body></html>
```

## shots.json

```json
{
  "contract": 1,
  "duration": 7,
  "shots": [
    { "number": "01", "start": 0, "title": "Logo", "description": "The logo sits centred on the dark ground." },
    { "number": "02", "start": 3, "title": "Promise", "description": "The headline fades up word by word." }
  ]
}
```

- `builtBy` (optional but write it): the name of the agent that built the version, lowercase (`claude`).
  Kinotta's own saves write `you`.
- `contract` is `1`. `duration` is a number in seconds.
- Each shot has a unique `number` (two-digit string), a numeric `start`, a `title` and a
  `description` of what happens, including the motion the storyboard doesn't show yet.
- Set `scene` to its page scene's stable `data-scene` name. Kinotta uses it to keep titles with
  their shots when scenes overlap or change order. Older shot lists are matched by scene timing.
- Starts are ascending and every start is before `duration`.
- `changedSections` goes in v2 and later only: the ids of the sections this version changed, such as
  `"changedSections": ["reel"]`. A reel with no `sections` has one section with id `reel`.
- Long reels may declare `sections` (`[{ "id", "name", "start", "end" }]`). A 15-second reel doesn't.

## What `kinotta check` reports

The static rules, each with the code it prints in brackets:

| Code | Problem |
|---|---|
| `shots-file` | `shots.json` is missing, not valid JSON, or not an object |
| `no-duration` | `shots.json` has no numeric `duration` |
| `no-shot-list` | `shots.json` has no list of shots |
| `shot-field` | a shot has no number, no start time, or no title |
| `duplicate-shot` | two shots share a number |
| `shot-order` | shot starts are not ascending |
| `shot-after-end` | a shot starts at or after the reel's duration |
| `no-page` | the version has no `index.html` |
| `no-scenes` | the page has no scene with numeric `data-start` and `data-duration` |
| `scene-timing` | a scene's `data-start` or `data-duration` is missing or not a number |
| `scene-gap` | no scene covers a shot's start |
| `no-named-elements` | the scenes covering a shot have no `data-el` |
| `duplicate-element` | a `data-el` name is used twice in one scene |
| `page-sound` | the page plays sound of its own: an `<audio>`, a `<video>` without `muted`, or `new Audio`, `AudioContext` or `speechSynthesis` in an inline or readable local script, including literal module imports. Sound belongs in the plan's `media` as a source and placement, so it joins the one mix the owner hears, edits and renders (ADR 0005) |

On a footage reel (its `reel.json` names footage) it also reports, after those:

| Code | Problem |
|---|---|
| `footage-missing` | the footage file `reel.json` names is not in the project |
| `transcript` | the reel's `transcript.json` is missing or not valid |
| `shot-type` | a shot's `type` is not `cutaway` or `panel` |
| `no-spoken-line` | a shot has no `line`, or its `line` holds no transcript words |

The check can't see runtime problems: a missing `window.seek`, a `seek` that throws, or a page that
draws differently on each load. The editor shows those on the still and in its issue list, so keep
`seek` simple enough to be right by reading it.
