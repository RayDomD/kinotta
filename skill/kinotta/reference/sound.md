# Sound sourcing

Read this when adding sound effects, voiceover or a generated bed. Follow
`native-media.md` for tracks, placement timing and source preservation.
Ask the owner once per reel before adding sound. Reuse their answer for that reel.
A first build is the exception: it adds sound by default (see "Sound in a first build").

## Synthesized score and effects

Kinotta writes its own beat-synced music beds and sound effects in code, with no
external samples or model weights. All synthesized sound is 48 kHz, 16-bit WAV,
generated deterministically using numpy and scipy (`skill/kinotta/scripts/synth.py`).

### Generating a score for a reel

Run the score generator on the reel's plan:

```text
python <skill>/scripts/synth.py score <plan.json> <out-dir> [--tempo 120] [--seed 42]
```

It reads cut and hit times from the plan and writes:
- A bed stem (`bed.wav`) with an exact `beats` grid, ducking under the kick drum inside the stem, and peak near −6 dBFS.
- One effect stem per cut or hit (`hit-01.wav`, `hit-02.wav`, etc.), each starting within one frame of its cut, peaked well below full scale. A hit may carry a `sound` object that picks and shapes the effect (see "Sound in a first build").
- Prints `track-add` operations for missing `music` and `sfx` tracks, then `placement-add` operations to stdout, ready to apply to Working via `kinotta edit`.

### Synthesized effects catalogue

Kinotta bundles 17 synthesized sound effects in `assets/sfx-synth/` with `manifest.json`.
To re-render the catalogue WAVs from their mathematical recipes:

```text
python <skill>/scripts/synth.py effects assets/sfx-synth
```

Choose an effect from `assets/sfx-synth/manifest.json` by its description. Copy that WAV
into the project's authoring assets. Use the manifest duration for the source and its `out`.
Add an `audio` placement on an `sfx` track at placement gain 0.35 and track gain 1. `at` is reel time.
Short effects start on the action. A riser starts its own duration before the hit,
for example `hit - 6.0` for the synthesized riser. If that would be negative,
choose a shorter effect or trim its source range to the available lead-in.
Preserve other sources, tracks and placements. Assign the next unused track order.

This four-second code-only example uses the synthesized pop copied to `assets/pop.wav`,
relative to the authoring plan. The pop starts at the reveal at one second.

```json
{
  "duration": 4,
  "clips": [],
  "media": {
    "schema": 1,
    "tracks": [{ "id": "sfx", "name": "Sound effects", "order": 0, "gain": 1, "mute": false }],
    "sources": [{ "id": "pop", "kind": "audio", "path": "assets/pop.wav", "duration": 0.1 }],
    "placements": [{ "id": "reveal-pop", "role": "audio", "source": "pop", "track": "sfx", "in": 0, "out": 0.1, "at": 1, "gain": 0.35 }],
    "sequence": []
  }
}
```

For an existing reel, add `track-add` and `placement-add` operations through `kinotta edit <slug> --by <your name> <operation json>` using the imported source identity and path. Adjust gain or mute with `placement-change`. Do not copy a version for sound changes. A render or comment hand-off preserves exact source bytes. For an initial build or a picture rebuild, follow `native-media.md` and keep the authored timing contract.

Old reels keep their copied Pixabay files and still play from those preserved files.

## Sound in a first build

Sound is part of every first build (Auto or Copy, footage or code-only) unless the request says
`Music: none` or names the owner's own music file. In those two cases skip the score. With the
owner's file, place that file on the `music` track as the request says and still add the effects.
A request with no Direction style still carries `Music: make a score that fits the cut.`

The result is ordinary placements: a `score-bed` on the `music` track and one effect per hit on
the `sfx` track. The owner can move, trim, mute and comment on each one.

### Describing each hit

Write a score input beside the authoring plan, with the plan's `duration`, `fps`, the `media.tracks`
it already has, and a `hits` list. Each hit has its reel time `at` and a `sound` object filled from
the on-screen event it lands on:

```json
{
  "duration": 12, "fps": 30, "media": { "tracks": [] },
  "hits": [
    { "at": 1.2, "sound": { "id": "send-click", "kind": "click", "pitch": 0.7, "length": 0.3, "brightness": 0.7, "weight": 0.3 } },
    { "at": 2.8, "sound": { "id": "card-land", "kind": "impact-bass-1", "pitch": 0.4, "length": 0.5, "brightness": 0.4, "weight": 0.8 } }
  ]
}
```

- `kind` is any catalogue effect in `assets/sfx-synth/manifest.json`.
- `pitch`, `length`, `brightness` and `weight` run from 0 to 1. 0.5 (or leaving one out) is the
  catalogue sound. Pitch moves the frequencies by up to half an octave either way. Length
  stretches the effect and its decay (about 0.7 to 1.4 times). Brightness trades dull for crisp.
  Weight trades thin for heavy. Values outside 0 to 1 are clamped, and every effect is
  normalised, so settings never push it past its peak.
- `id` is a short name for the event. Its seed comes from the id, so the same id and settings
  always give the same bytes. Use a different id for each distinct event.
- A hit without `sound` still works: it uses `effect` (or the default cycle) and its position.

### What each on-screen event sounds like

| On screen | `kind` | Settings to start from |
| --- | --- | --- |
| Button click | `click` | Small button: pitch 0.7, length 0.3. Large button: pitch 0.35, weight 0.6 |
| Toggle or switch | `click` or `pop` | pitch 0.3, weight 0.6, brightness 0.4 (a softer thunk) |
| Key press | `key-press` | Vary pitch 0.3 to 0.7 from key to key |
| Text typing in | `typing` | `at` is the first character. Length 0.5 for 1.5 s |
| Text reveal | `ping` or `sparkle` | Brightness 0.6 to 0.9. Higher pitch for a smaller word |
| Card or panel landing | `impact-bass-1`, `pop` for a small chip | Weight 0.3 (small) to 0.9 (full-screen). Pitch falls as it gets bigger |
| Notification or toast in | `notification` | pitch 0.5, brightness 0.6 |
| Chart rise or counter climb | `riser` | `at` is where the riser starts: the climax time minus the riser length (6 s at length 0.5, 4.2 s at 0, 8.5 s at 1) |
| Transition | `whoosh`, `whoosh-cinematic` for a scene change, `glitch-1` for a hard cut | `at` for whoosh-cinematic is the cut time minus its swell (2.4 s at length 0.5) |
| Error or wrong beat | `error` | weight 0.4 |

Vary the settings between neighbouring hits of the same kind: two clicks on different things must
not sound the same. Leave quiet stretches. Aim for a hit on the moments that matter, not on every
shot. Keep the speech clear: the bed is already near −6 dBFS and effects at −4 dBFS or below at
placement gain 0.35.

### Run it and apply it

```text
python <skill>/scripts/synth.py score <score-input.json> <out-dir> [--tempo 120] [--seed 42]
```

Use an out directory inside the job's `output/` so the paths stay relative (for example
`output/sound`, with the score input at `output/score.json`). It prints one JSON operation per
line. For an authoring plan, apply them by editing `output/plan.json`'s `media` by hand: each
`track-add` adds its `track` to `media.tracks` (skip ids that exist), each `placement-add` adds
its `source` to `media.sources` and its `placement` to `media.placements`. Never touch the
`sequence`. For an existing reel, pass them to `kinotta edit <slug> --by <your name>` instead.
Run the score before `shots.json` is written.

## Ducking music under speech

The owner selects an audio clip in Review, then opens **Sound** in the right
sidebar. Choose a separate speech track, set the amount in dB and the ramp
times, then **Apply ducking**. The chosen track needs transcribed word times.
Applying replaces the selected clip's volume points. Undo restores the old
points. The new points stay draggable in the timeline and a render or hand-off freeze preserves them.

For an agent-built native plan, use the read-only command:

```text
kinotta duck --plan <plan.json> --placement <music-placement-id> --speech-track <voice-track-id> --amount 12 --attack 0.15 --release 0.4
```

It prints a `placement-duck` operation with a snapshot of speech spans in the
music placement's local seconds. It writes no files and never touches the
owner's edit list. Add the returned operation through `kinotta edit <slug> --by <your name> <operation json>`. It changes Working without a new version. Supply source `words` or
placement corrections in the plan first. Trims, placement offsets and loops
are reflected in the returned spans.

Amount ranges from 0 to 24 dB. Attack and release range from 0.01 to 5 seconds.
Words separated by at most 0.3 seconds share a dip. Overlapping attack/release
ramps also share a dip, so the music does not bounce between close passages.
No overlapping speech leaves existing points alone. An amount of zero clears
the envelope to the clip's initial gain. Fades, track gain and mute still apply.
The stored points are a snapshot, so apply again after changing speech timing.
Preview and render use the existing volume-point envelope without limiting or
normalizing the mix.

## Beats and music cuts

Optional runtime: `pip install librosa==0.11.0`. Tested on Python 3.14.3 with
Numba 0.68.0. FFmpeg decodes the original file locally. No audio or model is fetched.

```text
python <skill>/scripts/beats.py assets/music.wav assets/music-beats.json
```

Copy the output object into the music source's `beats` field: `{ tempo, beats,
downbeats }`, with ordered source times in seconds. Keep it with the source in
the plan so each version freezes both the grid and the exact audio bytes.
The editor's Detect beats button caches by content hash. Detect again explicitly
replaces that cache and adds a source-beats edit, with Undo available and no Save step.

The tracker estimates tempo and beats. Downbeats are an accent-based estimate
in four-beat bars, not a verified musical meter. Listen before using them.
For another meter, pass `--beats-per-bar 3` (1–12 accepted). To correct the bar
phase, pass `--first-downbeat 2`, the zero-based index of the first downbeat in
the detected beat list. Silence produces zero tempo and empty lists.
See the [Librosa beat tracker](https://librosa.org/doc/0.11.0/generated/librosa.beat.beat_track.html).

When cutting to music, place scene changes and sound effects on mapped beats.
For each placement, subtract its `in`, add its reel `at`, and repeat by the
trimmed source range for loops. Ignore beats outside the trim or placement.
The Sound sidebar controls tick visibility and downbeat emphasis separately
from snapping. Snap edits to beats also requires the timeline Snap switch.

## Kokoro voiceover

Optional packages: `pip install kokoro-onnx soundfile`. The owner supplies local
`kokoro-v1.0.onnx` and `voices-v1.0.bin` files under their model terms, outside
the repository. See the [upstream example](https://github.com/thewh1teagle/kokoro-onnx/blob/main/examples/save.py).
Kinotta never fetches or commits weights. The tool check detects packages only,
so a present tool still needs model files.

```text
python <skill>/scripts/voice.py --text "Welcome to the reel." --voice af_sarah --model <local-model.onnx> --voices <local-voices.bin> assets/voice.wav
python <skill>/scripts/transcript.py --audio assets/voice.wav assets/voice-transcript.json
```

Transcribe the generated WAV with the existing transcript script. Use its real
word times for captions and later ducking. Probe the WAV duration, register it as
an audio source with those words, and place it on a `voice` track with role
`audio`, `speech: true` (so the Sound tab can duck music under it), `in: 0`, `out` equal to the measured duration, and the intended reel `at`.
Add the transcribed source with a named `placement-add` operation on Working. A render or hand-off freeze preserves its bytes and word times.

Verification on 2026-10-12: Python 3.14.3 with kokoro-onnx 0.4.7 and
soundfile 0.14.0 generated an 8.11-second, 24 kHz FLOAT WAV with `af_sarah`
using the owner's local v1.0 model and voices files. The existing cached Whisper
model transcribed 22 timed words in offline mode. The WAV played in Chromium
and a freeze preserved its exact bytes and source word times. Review transcript text,
especially names: Whisper spelled “Kinotta” as “Kinata” in the proof.

## Custom beds and ambience

Write custom beds and effects as code with `synth.py`, using the reel's mood,
pacing and cut times. Use an owner-supplied file when the request needs an
organic recording or acoustic ambience outside the synthesized set.

Probe the WAV's duration and add it as an audio source. Use an `sfx` track for
effects and a `music` track for beds. For a longer bed, use an audio placement
with `loop: true`, the source's measured `out`, the intended placement `duration`,
and short entry/exit fades. Listen for loop seams. Ask for an owner-supplied
music track if the synthesized bed does not fit. Keep levels explicit and preserve
exact bytes through the render or hand-off freeze described in `native-media.md`.

## Sound requests in comments

A pinned comment such as "add pulse sound" at 00:08 arrives in the `Kinotta
comments:` batch with its reel time. Answer a sound-only request with named operations on Working:

1. Prefer a synthesized catalogue effect that fits, or generate score and hit stems with `synth.py score`. Read the manifest descriptions.
2. For custom sound, write it as code with `synth.py` and fit its length to the moment. Ask for an owner-supplied file when the request needs an organic recording.
3. Place it at the comment's time on the right track: an effect on `sfx`, a bed on `music`, with the placement settings above. Do not move or retime anything else.
4. Report which source you used in the hand-over, or in `answers.md` when the batch also includes a picture rebuild. For synthesized sound, record the recipe, length and seed so the owner can ask for a variation.
5. If the comment is vague, choose, state the choice in the hand-over, and keep it easy to swap. If the requested recording is unavailable, use the nearest synthesized effect and say so.
