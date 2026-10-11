# Sound sourcing

Read this when adding sound effects, voiceover or a generated bed. Follow
`native-media.md` for tracks, placement timing and source preservation.
Ask the owner once per reel before adding sound. Reuse their answer for that reel.

## Bundled effects

Choose an effect from `assets/sfx/manifest.json` by its description. Copy that MP3
into the project's authoring assets, retaining `CREDITS.md` with copied effects.
The effects retain Pixabay's terms. `assets/sfx/NOTICE.md` records the upstream
revision and the manifest's Apache-2.0 notice. The owner's D4 choice is recorded
in the sound-sourcing plan, including the standalone-distribution risk.

Use the manifest duration for the source and its `out`. Add an `audio` placement
on an `sfx` track at placement gain 0.35 and track gain 1. `at` is reel time.
Short effects start on the action. A riser starts its own duration before the
hit, for example `hit - 10.03` for the bundled riser. If that would be negative,
choose a shorter effect or trim its source range to the available lead-in.
Preserve other sources, tracks and placements. Assign the next unused track order.

This four-second code-only example uses the bundled pop copied to `assets/pop.mp3`,
relative to the authoring plan. The pop starts at the reveal at one second.

```json
{
  "duration": 4,
  "clips": [],
  "media": {
    "schema": 1,
    "tracks": [{ "id": "sfx", "name": "Sound effects", "order": 0, "gain": 1, "mute": false }],
    "sources": [{ "id": "pop", "kind": "audio", "path": "assets/pop.mp3", "duration": 0.72 }],
    "placements": [{ "id": "reveal-pop", "role": "audio", "source": "pop", "track": "sfx", "in": 0, "out": 0.72, "at": 1, "gain": 0.35 }],
    "sequence": []
  }
}
```

Copy each used source's exact bytes into the new version and rewrite its paths
as described in `native-media.md`. Keep the authored page's timing contract.
Write `shots.json` last and run `kinotta check <slug> v<n>`.

## Ducking music under speech

The owner selects an audio clip in Review, then opens **Sound** in the right
sidebar. Choose a separate speech track, set the amount in dB and the ramp
times, then **Apply ducking**. The chosen track needs transcribed word times.
Applying replaces the selected clip's volume points. Undo restores the old
points. The new points stay draggable in the timeline and Save preserves them.

For an agent-built native plan, use the read-only command:

```text
kinotta duck --plan <plan.json> --placement <music-placement-id> --speech-track <voice-track-id> --amount 12 --attack 0.15 --release 0.4
```

It prints a `placement-duck` operation with a snapshot of speech spans in the
music placement's local seconds. It writes no files and never touches the
owner's edit list. Apply the returned operation to the agent's working plan
through `applyOperation` from `server/core/model.ts`, then build the next
version through the existing native-media workflow. Supply source `words` or
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
`audio`, `in: 0`, `out` equal to the measured duration, and the intended reel `at`.
Preserve the source and transcript with the new version per `native-media.md`.

Verification on 2026-10-11: Python 3.14.3 installed kokoro-onnx 0.4.7 and
soundfile 0.14.0, and both imported. Live synthesis remains unproven because
local Kokoro model and voices files were not supplied. Argument validation is tested.

## Stable Audio Open (optional, unproven)

Use `stabilityai/stable-audio-open-1.0` for effects outside the bundled set or
short music beds. The owner handles the gated model's access and licence terms,
CUDA-compatible Torch, and `diffusers transformers sentencepiece soundfile`.
See the [model card](https://huggingface.co/stabilityai/stable-audio-open-1.0).
The tool check detects Python packages only, not CUDA readiness or model access.
The owner supplies a complete local Diffusers snapshot outside the repository.
The script loads local files only and uses half precision on CUDA.

```text
python <skill>/scripts/generate_audio.py --prompt "Soft ambient synth bed, no speech" --seconds 12 --model <local-diffusers-snapshot> assets/bed.wav
```

Probe the WAV's duration and add it as an audio source. Use an `sfx` track for
effects and a `music` track for beds. For a longer bed, use an audio placement
with `loop: true`, the source's measured `out`, the intended placement `duration`,
and short entry/exit fades. Listen for loop seams. A poor loop is a reason to ask
for an owner-supplied music track. Keep levels explicit and preserve exact bytes
in the new version per `native-media.md`.

Verification on 2026-10-11: `python -c "import torch, diffusers"` passed on
Python 3.14.3. An unauthenticated HEAD request for the model's transformer weights
returned HTTP 401. No login, licence acceptance, Torch installation or model
download was attempted. Live generation and a working CUDA install remain unproven.
When unavailable, use bundled effects and ask the owner for a music file.
