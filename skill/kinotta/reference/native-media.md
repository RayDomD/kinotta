# Native media and audio tracks

Read this when a reel plan has `media`, when adding sound to any reel, or when the request changes an audio track or picture layout. This contract applies to footage and code-only reels. Use `plan.media` rather than adding sound to the HTML page.

## Find the authoritative plan

Use `reels/<slug>/plan.json` when present, otherwise the plan named by the reel in `motion/`. Read the newest saved version's own `plan.json` too. Preserve every field unrelated to the request, including unknown fields. Never replace a native media plan with legacy `video`/`pieces` fields. Paths in the authoring plan are relative to that plan, while paths in a version's plan are relative to the version folder.

## Author a track mix

`media.schema` is 1. `sources` names underlying files. `placements` names independent uses of them. `sequence` lists only main/gap placements in their playback order. Added sound uses role `audio` and starts at `at` on reel time. Main placements start where the sequence puts them. An empty sequence uses the plan's authored `duration`, which is how code-only reels add sound.

`media.tracks` contains `{ id, name, order, gain, mute }`. Identities and names are nonempty text, order is a unique nonnegative integer, gain ranges from 0 to 2 and mute is boolean. Every main or audio placement whose source has sound must name an existing `track`, even when that placement is muted. Images, silent footage (`audio: false`), inserts and gaps have no track assignment. Preserve the owner's track identities, names, order, gain and mute unless the request changes them. Add a track only when needed and never remove one that still has placements.

For an older plan without tracks, use unity-gain, unmuted defaults: main speech shares `track:speech` named Speech, and each existing sound placement gets `track:<placement-id>` named after its source. Leave the existing source and placement identities intact. Do not persist this migration into an existing frozen version.

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

## Build a new frozen version

1. Apply only the requested plan/graphic changes. Retain tracks, regions, source and placement identities, sequence, envelopes, words, attachments, graphic dependencies and all unrelated owner edits. Never touch the editor's edit-list or handoff files.
2. Create a new version folder. Copy each required source's exact bytes into it, retaining the original content hash and using distinct names for distinct content. Rewrite that version's source paths to its preserved copies. Also preserve graphic fragments and their local dependencies. Do not leave version source paths pointing at mutable authoring files or substitute transcoded playback copies for the original source. A missing source or dependency blocks publication.
3. Copy the transcript and complete plan into the new version, rewrite relative paths from its folder, and build its page with `engine/build.py --plan <new-version>/plan.json <new-version>/index.html`. `build.py` validates native media and maps occurrence timing. Keep existing caption look/positions, offsets and untouched clip states. Code-only authored pages retain their scenes and timing contract rather than being replaced with an empty generated page.
4. Write `answers.md` for the batch, then write `shots.json` last, using `scripts/shots.py` for generated footage pages. Run `kinotta check <slug> v<n>` and resolve every issue before calling the version ready. Confirm the prior version's files are unchanged.
5. If asked for a video, use `kinotta render <slug> v<n> --preset draft|final|overlay`. Draft and Final mix the tracks. Overlay has no sound. Never invoke an engine renderer or separate compositor as a substitute.
