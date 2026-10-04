# Every version is an HTML page under a timing contract

Claude builds each version as an HTML page with free choice of technique (CSS, canvas, three.js,
Web Audio), bound by three rules: every scene carries its start time and length, every element
carries a stable name, and the page exposes a function that jumps it to any second. We chose this
because that jump is what makes scrubbing, click-to-element pins, storyboard stills and a
frame-exact MP4 render possible, while leaving Claude's creative range intact. The scene timing
markup is borrowed from HyperFrames' pattern; Kinotta does not depend on HyperFrames.

The storyboard is the same contract applied early: scenes built unanimated plus a shot list, with
stills drawn live by jumping the page to each shot's time rather than from screenshots, so pins on
a still resolve to elements too.

The b-roll for footage reels is built by a motion engine that is part of Kinotta: a copy of the
motion-broll skill's engine lives in the Kinotta skill and is developed in this repo. The jump
function is the engine's own `seek(seconds)`, and the engine adds Kinotta's element names and scene
timing, so every clip it builds opens in Kinotta as-is. We chose to bring the engine in over keeping
it a separate tool that shares the format, and one format over a converter, because each tool
boundary is a place for the two to drift apart. The standalone motion-broll skill carries on
unchanged for b-roll that isn't reviewed in Kinotta.

## Considered Options

- **Any HTML, played live.** Most native to Opus, but the editor could only screen-record: unreliable
  scrubbing, drifting timestamps, guessed stills, dropped frames on render.
- **A JSON timeline the editor renders.** Maximum control, but it limits Claude to Kinotta's renderer,
  which discards the model's own choice of tools.
