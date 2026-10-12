# Stable Audio Open verification

The owner supplied the complete local Diffusers snapshot at `C:/Models/stable-audio-open-1.0` on 2026-10-12. Its recorded revision is `f21265c1e2710b3bd2386596943f0007f55f802e`. The existing generator loaded it locally, used CUDA half precision on the RTX 4060 Laptop GPU and generated a 12-second stereo music bed. No model download, login, licence acceptance or package installation was performed in this verification.

## Working install

Python 3.14.3, Torch 2.11.0+cu128, Diffusers 0.41.0, Transformers 5.19.0, Accelerate 1.15.0, SentencePiece 0.2.2 and Soundfile 0.14.0. `torch.cuda.is_available()` returned true. The snapshot includes model index, transformer, VAE, text encoder, tokenizer, projection model and scheduler files.

## Test evidence

```text
HF_HUB_OFFLINE=1 python skill/kinotta/scripts/generate_audio.py --prompt "Soft ambient synthesizer music bed, warm sustained chords, gentle texture, calm, no vocals, no speech" --seconds 12 --model C:/Models/stable-audio-open-1.0 --seed 42 C:/Users/ryand/AppData/Local/Temp/kinotta-stable-proof-2026-10-12/bed.wav
Loaded all 6 pipeline components.
Completed 100 inference steps in about 25 seconds.
Created .../bed.wav
Exit 0.

Soundfile inspection:
44100 Hz, 529200 frames, 2 channels, exactly 12 seconds, FLOAT WAV.
All samples finite. RMS 0.2150201594. Peak 1.015625.

Native editor proof in a temporary fixture project:
Original FLOAT WAV played in Chromium.
Web Audio decoded 2 channels at 48 kHz, 12 seconds, peak 1.0154149532.
The decoder preserves the floating source peak before placement gain.
Placement: Music track, at 0.5 seconds, gain 0.35, entry/exit fades 0.5 seconds.
No mix overload.
Save produced v2 and preserved exact WAV bytes, leaving v1 unchanged.
Source SHA256: 72a962037d58cb47c599e4438b86a1c8918ce1af16f6830f7f23e2371e568303.
kinotta check founder-talk v2 --project <temporary fixture>
founder-talk v2: no contract issues
Exit 0.

node bin/kinotta.mjs render founder-talk v2 --preset draft --size source --fps 30 --project C:/Users/ryand/AppData/Local/Temp/kinotta-test-7jP1lZ
Rendered .../founder-talk-v2-draft-1080p30.mp4
Exit 0.

Decoded render inspection:
Steady-region RMS 0.0699532032, expected original RMS times 0.35 = 0.0700078815.
Difference below 0.001. Entry/exit fades and silence outside the placement passed.
All rendered samples finite, peak below full scale.
```

Proof WAV, an MP3 audition at fixed 0.35 gain and evidence JSON are in `C:/Users/ryand/AppData/Local/Temp/kinotta-stable-proof-2026-10-12/`. The original WAV is unchanged. Its small peak above full scale is valid floating-point audio. Placement gain keeps the rendered mix below full scale without normalization or limiting.

The pipeline emitted upstream dtype/weight-normalization deprecation warnings and Brownian-interval rounding warnings. Generation completed and signal checks passed. No warning suppression or library workaround was added.

## Deviations

None in the generator implementation. This closes phase 5's original live-generation gate using the owner's local model. Sound quality and loop seams remain matters for audition, as the reference already requires.
