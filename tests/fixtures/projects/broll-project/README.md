# broll-project

The motion engine's six-clip example (`skill/kinotta/examples/opus-aoe2/`) as a footage reel. Built
at test time by `buildBrollProject` (`tests/helpers/engine.ts`), not committed:

- `media/source.mp4`: 54 seconds of colour bars from ffmpeg, standing in for the example's real video.
- `reels/opus-aoe2/v1/index.html`: the example's `plan.json` composed by `engine/build.py --plan`.

`transcript.json` is synthetic: each clip's quoted line from `plan.json`, its words spread evenly over
the clip's span. `shots.json` has one shot per clip, one second after its in-point: a clip opens on an empty canvas while
its shape pops in, so a still at the in-point shows nothing. Clip 02 is split into three states (`02a` to `02c`, each with
`"clip": "02"`), as `shots.py` writes a clip with `stills`.
