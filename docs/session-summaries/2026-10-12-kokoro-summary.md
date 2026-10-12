# Kokoro voiceover verification

The owner supplied `C:/Models/kokoro/kokoro-v1.0.onnx` and `C:/Models/kokoro/voices-v1.0.bin` on 2026-10-12. Their sizes were 325532387 and 28214398 bytes. The existing local-only voice script successfully generated speech with `af_sarah`, default English language and speed 1. No weights were downloaded or copied into the repository.

## Test evidence

```text
python skill/kinotta/scripts/voice.py --text "Welcome to Kinotta. This is a local voiceover test. Music can sit softly under speech, and sound effects can mark each moment." --voice af_sarah --model C:/Models/kokoro/kokoro-v1.0.onnx --voices C:/Models/kokoro/voices-v1.0.bin C:/Users/ryand/AppData/Local/Temp/kinotta-kokoro-proof-2026-10-12/voice.wav
Created .../voice.wav
Exit 0.

Soundfile inspection:
rate 24000 Hz, 194560 frames, duration 8.1066666667 seconds, FLOAT WAV.
All samples finite. Peak 0.8217389584, RMS 0.0925628886.

HF_HUB_OFFLINE=1 python skill/kinotta/scripts/transcript.py --audio <proof>/voice.wav <proof>/transcript.json
Used the existing cached Systran/faster-whisper-small model.
22 words with source timings from 0 to 7.86 seconds.
Exit 0. No model download.

Native editor verification in a temporary fixture project:
Original FLOAT WAV played in Chromium.
Added narration at 0.5 seconds, gain 0.7, speech true, Voice track.
Save produced v2 with all 22 words and unchanged v1.
Frozen WAV bytes exactly match the generated original.
Source SHA256: 540d1a6857be3966bbace961a50966a71f187adcb572c8123c40c86cab2cd675.
kinotta check founder-talk v2 --project <temporary fixture>
founder-talk v2: no contract issues
Exit 0.
```

The proof files are in `C:/Users/ryand/AppData/Local/Temp/kinotta-kokoro-proof-2026-10-12/`, including the original WAV, an MP3 audition, transcript and evidence JSON. The final temporary saved project is `C:/Users/ryand/AppData/Local/Temp/kinotta-test-mB8oWl`.

A Draft render through `kinotta render founder-talk v2 --preset draft --size source --fps 30 --project <proof-project>` completed. Decoded RMS was 0.0647337139 against expected original RMS times 0.7 of 0.0647885531, within 0.001. Silence before and after the placement passed. The proof's first graphics fixture omitted required shape properties and failed before rendering, corrected in a fresh fixture without changing the voice script or frozen versions. Initial render inspection also used a named left channel for a mono source. The final comparison uses channel index zero for both mono and stereo.

Whisper recognized the narration but spelled the brand name “Kinata.” Generated captions still need text review, while their timings remain grounded in the actual audio. The audition was shared with the owner.

## Deviations

None in the voice implementation. This closes the original phase 4 live-synthesis gate using the owner's local files. Stable Audio's subsequent local proof is recorded separately in `2026-10-12-stable-audio-summary.md`.
