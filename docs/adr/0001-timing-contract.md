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

## Considered Options

- **Any HTML, played live.** Most native to Opus, but the editor could only screen-record: unreliable
  scrubbing, drifting timestamps, guessed stills, dropped frames on render.
- **A JSON timeline the editor renders.** Maximum control, but it limits Claude to Kinotta's renderer,
  which discards the model's own choice of tools.
