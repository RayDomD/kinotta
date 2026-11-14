`legacy-effect.mp3` is generated audio: a 0.4-second, 880 Hz sine wave,
encoded as a mono MP3 at 96 kbit/s. It contains no sampled audio.

Regenerate from the repository root with:

```sh
ffmpeg -v error -f lavfi -i "sine=frequency=880:duration=0.4" -ac 1 -b:a 96k tests/fixtures/legacy-effect.mp3
```

The legacy-reel regression copies this file into a saved version as
`assets/pop.mp3` to verify that existing MP3 placements still open and render
independently of the WAV catalogue.
