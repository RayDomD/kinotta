# Sound sourcing

Read this when adding sound effects, voiceover or a generated bed. Follow
`native-media.md` for tracks, placement timing and source preservation.
Ask the owner once per reel before adding sound. Reuse their answer for that reel.

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
- One effect stem per cut or hit (`hit-01.wav`, `hit-02.wav`, etc.), each starting within one frame of its cut, peaked well below full scale.
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

## Stable Audio Open (optional)

Use `stabilityai/stable-audio-open-1.0` for organic beds, acoustic ambience or
specialized effects outside the synthesized set. Synthesized score and catalogue
effects come first; Stable Audio remains optional for organic musical textures. The owner handles the gated model's access and licence terms,
CUDA-compatible Torch, and `diffusers transformers sentencepiece soundfile`.
See the [model card](https://huggingface.co/stabilityai/stable-audio-open-1.0).
The tool check detects Python packages only, not CUDA readiness or model access.
The owner supplies a complete local Diffusers snapshot outside the repository.
The script loads local files only and uses half precision on CUDA.

```text
kinotta generate-audio --prompt "Soft ambient synth bed, no speech" --seconds 12 --out assets/bed.wav
```

`kinotta generate-audio` is the same service as the editor's Generate section at
the top of the Sound tab. It adds the WAV to the project library, so the owner
can play and reuse it, and `--out` also copies it beside a code-only plan. It
prints one JSON line with the file, duration, prompt, length and seed.

For each new generation, omit `--seed` to choose a fresh random seed. Supply
`--seed <number>` only when the owner asks to reproduce a sound. In the editor,
leave Seed blank for the same random behavior; the raw script also randomizes
an omitted seed and reports the chosen value.

For new reel music, build the prompt from that reel's identity, mood, instruments,
and pacing. Generate a new file; reuse another reel's music only when the owner
requests reuse. A random seed varies the sound within the prompt's musical direction.

The same prompt, length and seed give the same sound. One generation runs at a time and
takes about half a minute, so generate once per request and audition the result
before iterating. The model folder comes from `KINOTTA_STABLE_AUDIO_MODEL`; when
that is unset the command says so and you fall back as below. The raw
`scripts/generate_audio.py --model <folder>` still works for scripting.

Probe the WAV's duration and add it as an audio source. Use an `sfx` track for
effects and a `music` track for beds. For a longer bed, use an audio placement
with `loop: true`, the source's measured `out`, the intended placement `duration`,
and short entry/exit fades. Listen for loop seams. A poor loop is a reason to ask
for an owner-supplied music track. Keep levels explicit and preserve exact bytes
through the render or hand-off freeze described in `native-media.md`.

Verification on 2026-10-12: a complete owner-supplied Diffusers snapshot generated
a 12-second stereo, 44.1 kHz FLOAT WAV on the RTX 4060 Laptop GPU in CUDA half
precision, with downloads disabled. The working install was Python 3.14.3,
Torch 2.11.0+cu128, Diffusers 0.41.0, Transformers 5.19.0, Accelerate 1.15.0,
SentencePiece 0.2.2 and Soundfile 0.14.0. Snapshot revision:
`f21265c1e2710b3bd2386596943f0007f55f802e`.
Browser playback, exact-byte freeze and a Draft render at fixed 0.35 placement gain
with fades passed. Keep generated FLOAT WAVs unchanged and choose explicit mix
levels: this source peaked slightly above full scale before placement gain.
When the tool or local model is unavailable, use synthesized catalogue effects or
`synth.py score`, and ask the owner for a music file if an organic recording is preferred.
Audition generation quality and loop seams before use.

## Sound requests in comments

A pinned comment such as "add pulse sound" at 00:08 arrives in the `Kinotta
comments:` batch with its reel time. Answer a sound-only request with named operations on Working:

1. Prefer a synthesized catalogue effect that fits, or generate score and hit stems with `synth.py score`. Read the manifest descriptions.
2. Otherwise generate once with `kinotta generate-audio` for organic beds or custom ambience, naming the sound in the prompt as the comment does, and a length that fits the moment.
3. Place it at the comment's time on the right track: an effect on `sfx`, a bed on `music`, with the placement settings above. Do not move or retime anything else.
4. Report which source you used in the hand-over, or in `answers.md` when the batch also includes a picture rebuild. For a generated one, record the prompt, length and seed so the owner can ask for a variation.
5. If the comment is vague, choose, state the choice in the hand-over, and keep it easy to swap. If generation is unavailable, use the nearest synthesized effect and say so.
