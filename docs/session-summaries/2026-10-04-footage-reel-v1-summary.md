# Footage reel v1 from a video (T23): run summary

Date: 2026-10-04. Branch: `feat/storyboard-phase` (local, not pushed). Plan:
`docs/plans/2026-10-04-footage-reel-v1.md`. Ticket: T23 (#26), criteria ticked in `docs/tickets.md`.

## What shipped

- `SKILL.md` section 5: the footage v1 workflow (ask only what is open, setup, `reel.json` pointing at
  the video in place, transcript, inspect, sections, plan, build clips, compose, shot list last, check,
  hand-over). v1 is the plan: no approval in chat. Clips are animated. The hard rule on unanimated
  versions names the exception; preflight routes b-roll requests to section 5.
- `scripts/transcript.py`: SRT or VTT to `transcript.json` (word times spread across each cue), or
  `--audio` with faster-whisper.
- `scripts/shots.py`: `shots.json` from the plan, one shot per clip with its section, type and line,
  starting `still` seconds (default 1) into the clip; changed sections as extra arguments.
- Grilling log: K13 (K9 exception for footage reels) and K14 (no plan approval in chat).
- Footage sample: `motion/plan.json` gains sections and per-clip fields; `v1/shots.json` is now
  `shots.py` output. Its `line` spans now run in to out (same spoken words as before).

## Decisions made in the run

- Footage reels don't require the brand file: a checked `reels/brand.md` is followed when present,
  otherwise the engine's style defaults, said in the hand-over.

## Checks

- Typecheck clean, `npm test` 147/147 (5 new in `tests/engine/scripts.test.ts`, which also requires the
  sample's shot list to equal a fresh `shots.py` run), `npm run test:e2e` 77/77.
- Dry run of section 5 in a scratch project from the sample video and an SRT made from its transcript:
  `transcript.py`, `inspect_video.py`, `build.py --plan`, `shots.py` and `kinotta check` (clean); in the
  editor, two sections, stills one second into each clip, panels over the footage.
- Not run: `transcript.py --audio` (faster-whisper not installed) and `setup.sh` (would download Chromium).

## Found on the way

- In the dry run, estimated word times put a neighbour's word into two spoken lines ("plane and"). The
  skill now says to place in and out points in pauses between words.
- The scripts were written before their tests in this run, not test first.

## Changed after the run

- `c1c067d` (first real talking video): `transcript.py --audio` decodes with ffmpeg and runs
  faster-whisper on the CPU (its own decoder broke on PyAV 19; a GPU machine without CUDA libraries
  failed mid-run); `inspect_video.py` labels a dip to black as a dark stretch instead of crashing;
  section 5 makes an H.264 copy of HEVC or ProRes footage, which Chrome can't play.
- Branch review (2026-10-04): `shots.py` lists shots in time order, so a clip a batch adds between
  others no longer leaves the shot before it with no duration.
