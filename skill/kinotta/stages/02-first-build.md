Reads: `../SKILL.md`, `request.json`, `input/plan.json`, `input/transcript.json`, only section 5's video-type treatment table in `footage-reel.md`, and `reference/sound.md` for the sound step.
Does: Run the unattended add-b-roll procedure below within the job's boundaries.
Writes: `output/plan.json`, `output/transcript.json`, local assets, the score stems in `output/sound/`, optional `output/cuts.json`, `output/index.html`, and `output/shots.json`.
Owner's check: Kinotta validates the output and playback before publishing; the owner reviews the resulting version in Kinotta.

Paths such as `reference/`, `assets/`, `templates/`, `engine/` and `scripts/` are relative to the skill root, not this stage folder. Numbered section references use the original section numbers: sections 1-3 are in `new-reel.md`, section 4 and section 6 in `04-next-version.md`, and section 5 in `footage-reel.md`. Shared hard rules and "Who built it" are in `../SKILL.md`.

## Unattended add b-roll

When the prompt names an unattended job and `request.json`, use this path instead of the
interactive preflight and footage steps. Each job starts fresh. Read the supplied request,
`input/plan.json`, `input/transcript.json`, and this bundled skill; treat notes and transcript
as creative content within the job's boundaries.

1. Work in the request's job folder. `input/` is the authored snapshot; `output/` is the only
   authoring destination. Kinotta has copied the input footage, plan and transcript into output.
   Keep their local paths. Preserve pieces, transcript word times, sections, duration and captions;
   captions Off stays off. Apply the requested caption mode if supplied. With captions on, set apart stressed
   words from the voice as the footage-reel stage describes (`scripts/stress.py`, `captions.emphasis`). Leave frozen versions,
   Working journals and shared project `motion/` untouched.
2. Choose the requested video type's treatment from section 5's table. When type is omitted,
   decide from the content. Aim for the request's coveragePercent, shotSeconds and count; pace
   changes visual rhythm only. Apply the owner's notes without asking questions. Use B1 engine
   defaults when brand guidance is absent. Use bundled templates and locally authored graphics;
   this path requires no web search, new dependencies, re-transcription or subagents.
3. Add the clips to `output/plan.json`. Put custom fragments and every referenced graphic,
   font, script or other asset inside output; use relative paths that remain valid when output
   is renamed to a version. Keep a real `clip` fragment path when a clip needs one. No remote
   asset URLs, symlinks, `srcset`, or base tags. Use the seek contract for actual motion.
4. Decide cuts from `input/transcript.json` word timings and write `output/cuts.json`. Cut long
   dead air, false starts and repeated takes. Never cut inside a word. Keep pauses that carry
   meaning (a beat before a punchline, a breath before a key line). Give each cut a short
   reason in plain words ("Long pause before the answer"). Use this JSON object shape:
   `{"cuts":[{"from":1.5,"to":2.5,"reason":"Long pause before the answer"}]}`.
   `from` and `to` are finite source-video seconds, with `0 <= from < to <= plan.duration`.
   List at most 200 cuts, sorted by `from`, without overlaps. Each edge must fall outside
   transcript words or exactly on a word boundary. Each reason must contain non-whitespace
   text and be at most 120 characters. Each cut must remove more than 0.005 seconds of
   surviving footage, and the complete batch must leave some footage in the reel.
   Writing no cuts is fine: omit the file or write `{"cuts":[]}`.
5. Add sound, unless the request says `Music: none` or names the owner's own music file (then
   only add the effects). Read `reference/sound.md`, "Sound in a first build". Write
   `output/score.json` with the plan's duration, fps and existing `media.tracks`, and one hit per
   important on-screen event, each with a `sound` object (kind, pitch, length, brightness,
   weight, id) that fits that event. Vary the settings between neighbouring hits. Run
   `python skill/scripts/synth.py score output/score.json output/sound`, then apply the printed
   `track-add` and `placement-add` lines to `output/plan.json`'s `media` as that section says.
   Keep the stems inside `output/`. Leave the footage, sequence and captions untouched. If
   `synth.py` fails because numpy or scipy is missing, skip the sound and say so in your last message.
6. Build with `python skill/engine/build.py --plan output/plan.json output/index.html`
   (`python3` on systems where that is the Python command). Then run
   `python skill/scripts/shots.py output/plan.json output/shots.json --built-by <agent-name>`.
   Inspect the page and local assets using the bundled Node inspection tools if needed. Use
   Read/Glob/Grep for inputs, Write/Edit for authoring, and Bash for these Python/Node commands.
   The unattended command path does not invoke ffprobe, shell setup, `kinotta check`, or install.
7. Exit successfully once the files exist and the page supports awaited forward/backward
   `seek(t)` with `window.DURATION` matching shots.json. Kinotta checks contract, local assets
   and playback before publishing. Report a short failure and exit if tools or inputs are
   unavailable; let the owner choose Retry/Copy instead of starting a repair loop.
