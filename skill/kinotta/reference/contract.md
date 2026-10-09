# The timing contract

Every version is one HTML page the editor controls through time (ADR 0001 in the Kinotta repo).
The editor loads `v<n>/index.html?render` in a 1920x1080 frame, calls `seek(t)` for each shot's
start, waits two animation frames (or 500ms, whichever comes first), and shows the result as that shot's still. A click on a still
lands on the `data-el` element under it.

## Folder layout

```
reels/
├── brand.md                 brand file (checked once)
├── taste.md                 optional project taste list
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

At the reel level, `edit-list.json` (the owner's unsaved edits), `handoff.json` (a batch is out) and
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
