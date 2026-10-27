# Native media and audio tracks

Read this when a reel plan has `media`, when adding sound to any reel, or when the request changes an audio track or picture layout. This contract applies to footage and code-only reels. Use `plan.media` rather than adding sound to the HTML page.

## Find the authoritative plan

Use `reels/<slug>/plan.json` when present, otherwise the plan named by the reel in `motion/`. For a picture rebuild from a batch, start with that exact frozen version's own `plan.json`. Preserve the authored plan as input history for Working. Preserve every field unrelated to the request, including unknown fields. Never replace a native media plan with legacy `video`/`pieces` fields. Paths in the authoring plan are relative to that plan, while paths in a version's plan are relative to the version folder.

## Author a track mix

`media.schema` is 1. `sources` names underlying files. `placements` names independent uses of them. `sequence` lists only main/gap placements in their playback order. Added sound uses role `audio` and starts at `at` on reel time. Main placements start where the sequence puts them. An empty sequence uses the plan's authored `duration`, which is how code-only reels add sound.

`media.tracks` contains `{ id, name, order, gain, mute }`. Identities and names are nonempty text, order is a unique nonnegative integer, gain ranges from 0 to 2 and mute is boolean. Every main or audio placement whose source has sound must name an existing `track`, even when that placement is muted. Images, silent footage (`audio: false`), inserts and gaps have no track assignment. Preserve the owner's track identities, names, order, gain and mute unless the request changes them. Add a track only when needed and never remove one that still has placements.

For an older plan without tracks, use unity-gain, unmuted defaults: main speech shares `track:speech` named Speech, and each existing sound placement gets `track:<placement-id>` named after its source. Leave the existing source and placement identities intact. Do not persist this migration into an existing frozen version.

### Source beats

An audio or audible video source can carry optional `beats` timing:

```text
"beats": { "tempo": 120, "beats": [0, 0.5, 1, 1.5], "downbeats": [0] }
```

Times are ordered, unique source seconds within the source duration. Downbeats
must belong to the beat list. Tempo is finite and nonnegative, and must be
positive for a nonempty grid. An empty grid represents no detected pulse.
A render or hand-off freeze preserves the grid with the source. A source-beats operation replaces it for
every placement of that source without changing the audio. Markers follow trim,
reel placement and loops. See `sound.md` for detection and bar-phase correction.

### Track EQ

A track may add `eq`, an ordered list of at most eight filters, and `eqBypass`
(boolean, default false). Each filter is `{ type, frequency, gain?, q?, enabled? }`.
Types are `highpass`, `lowpass`, `peaking`, `lowshelf` and `highshelf`. Frequency
is 20–20000 Hz. Gain is −24 to +24 dB, default zero, used by peaking and shelves.
Q is a linear factor from 0.1 to 10, default 0.7071067811865476, used by cut
filters and peaking. Shelves have a fixed slope and ignore Q. `enabled` defaults
to true. Bypass retains the filter settings while skipping the entire chain.

```text
{ "id": "music", "name": "Music", "order": 1, "gain": 0.5, "mute": false,
  "eq": [{ "type": "highpass", "frequency": 80 },
         { "type": "peaking", "frequency": 2500, "gain": -3, "q": 0.8 }] }
```

EQ follows the placement envelope and track gain. Every placement on the track
gets the same filter chain in preview and render. Both use 48 kHz processing.
The Sound sidebar provides presets, editable filters, per-filter On and track
Bypass. Changes use the existing track edit, Undo and automatic freezing. Preserve EQ when
copying or changing unrelated track properties. Boosts can overload the mix,
and overload measurement includes EQ. No normalization or limiter is added.

The cut-filter Q conversion follows the [Web Audio specification](https://www.w3.org/TR/webaudio/#dom-biquadfilternode-q).
Rendering uses FFmpeg's highpass, lowpass, equalizer, lowshelf and highshelf
filters in double precision. The shelf variants match the browser's response,
as verified by the sweep test, unlike bass and treble's alternate formulas.

The following valid native mix places speech and music on independent tracks. Replace the example files with actual project files and their probed durations before building. The quiet Music track combines with the bed's own gain and fades. `solo` is preview-only editor state and must not be authored into a plan.

```json
{
  "duration": 4,
  "clips": [],
  "media": {
    "schema": 1,
    "tracks": [
      { "id": "speech", "name": "Speech", "order": 0, "gain": 1, "mute": false },
      { "id": "music", "name": "Music", "order": 1, "gain": 0.5, "mute": false }
    ],
    "sources": [
      { "id": "take", "kind": "video", "path": "take.mov", "duration": 4, "audio": true },
      { "id": "song", "kind": "audio", "path": "music.wav", "duration": 2 }
    ],
    "placements": [
      { "id": "speech-take", "role": "main", "source": "take", "track": "speech", "in": 0, "out": 4 },
      { "id": "music-bed", "role": "audio", "source": "song", "track": "music", "in": 0, "out": 2, "at": 0, "duration": 4, "loop": true, "gain": 0.5, "fadeIn": 0.5, "fadeOut": 0.5 }
    ],
    "sequence": ["speech-take"]
  }
}
```

Placement gain, mute, `volume` points (`{ at, gain }` in placement-local seconds), `fadeIn`, `fadeOut` and audio looping combine with the track's gain and mute in the shared mix. Fades are shortened proportionally if they overlap. All sound ends at the reel end. Do not normalize or limit the mix. Render overload requires the owner's explicit acceptance.

Insert sound starts muted. To put it on a track, create a distinct audio placement using the same source/range and resolved timeline start, retain its envelope, then mute the insert. Never double its sound. Added sound stays at reel time unless `attachment: { placement, time, offset }` follows a specific main footage occurrence and source moment. Preserve attachments, `origin`, source words, placement word corrections, speech selection and loop-cycle choices.

## Picture regions

Video/image placements can carry `region: { x, y, width, height }` in fractions of the canvas. Positions are nonnegative, dimensions positive and the whole rectangle must fit inside the canvas. No region means full frame. `framing: { mode: "crop" | "fit", x, y }` frames the source inside that region, with x/y between 0 and 1. Sound and captions remain on the shared reel mix/timeline, independent of region size.

For side by side, give the main picture `{ "x": 0, "y": 0, "width": 0.5, "height": 1 }` and an insert `{ "x": 0.5, "y": 0, "width": 0.5, "height": 1 }`. Inserts use their own `at`, `in`, `out` and optional image duration. Several inserts may overlap. By default main pictures are behind inserts, and later inserts in `placements` draw in front. An explicit nonnegative integer `layer` on a picture overrides that default, with higher layers in front. Preserve both placement order and explicit layers unless asked to change them. Regions belong to occurrences, including repeated uses of the same source.

Follow [edit.md](../stages/edit.md) for small changes to Working.

## Build a new frozen version for a picture rebuild

1. Apply only the requested plan/graphic changes. Retain tracks, regions, source and placement identities, sequence, envelopes, words, attachments, graphic dependencies and all unrelated owner edits. Never touch the editor's edit-list or handoff files.
2. Create a new version folder. Copy each required source's exact bytes into it, retaining the original content hash and using distinct names for distinct content. Rewrite that version's source paths to its preserved copies. Also preserve graphic fragments and their local dependencies. Do not leave version source paths pointing at mutable authoring files or substitute transcoded playback copies for the original source. A missing source or dependency blocks publication.
3. Copy the transcript and complete plan into the new version, rewrite relative paths from its folder, and build its page with `engine/build.py --plan <new-version>/plan.json <new-version>/index.html`. `build.py` validates native media and maps occurrence timing. Keep existing caption look/positions, offsets and untouched clip states. Code-only authored pages retain their scenes and timing contract rather than being replaced with an empty generated page.
4. Write `answers.md` for the batch, then write `shots.json` last, using `scripts/shots.py` for generated footage pages. Run `kinotta check <slug> v<n>` and resolve every issue before calling the version ready. Confirm the prior version's files are unchanged.
5. If asked for a video, use `kinotta render <slug> v<n> --preset draft|final|overlay`. Draft and Final mix the tracks. Overlay has no sound. Never invoke an engine renderer or separate compositor as a substitute.
