Reads: `../SKILL.md`, the 2–3 reference videos the owner names, the project's styles (`reels/styles/`) and brand file.
Does: Measure the references, inspect their frames, and suggest one project style built from what they share.
Writes: One suggested style, through `kinotta style suggest`, and its evidence in `motion/work/style/`.
Owner's check: On the Direction screen, read the suggestion's rules, edit or remove any, then Keep or Discard it.

Paths such as `reference/`, `assets/`, `templates/`, `engine/` and `scripts/` are relative to the skill root, not this stage folder.

## When

The owner asks for a style from videos they like ("make my style from these", `/kinotta style a.mp4 b.mp4`). Ask
for two or three references when given one; one reference makes a weak style. Never use a reference for anything
else: its story, copy, music, fonts and assets are not yours to reuse.

## Measure, then look

```bash
mkdir -p motion/work/style
python3 $SKILL/scripts/transcript.py --audio ref1.mp4 motion/work/style/ref1.json   # one per reference, when it has speech
python3 $SKILL/scripts/measure_style.py ref1.mp4 ref2.mp4 ref3.mp4 --transcripts motion/work/style/ref1.json … > motion/work/style/measured.json
python3 $SKILL/scripts/inspect_video.py ref1.mp4 motion/work/style/ref1   # a contact sheet per reference
```

`measured.json` gives each reference's frame shape, cuts, shots per minute, median shot, loudness and, with a
transcript, words per minute and median pause; `summary` gives each measure's median and spread. Then look at every
contact sheet for what a file cannot say: caption look and density, where captions sit, how much is b-roll, the
graphic devices and their motion. Map each device to an effect template in `templates/effects/README.md`, or call
it a new device. Name what was measured and what was inferred.

## Suggest one style

Write `motion/work/style/suggestion.json` and record it:

```json
{
  "style": {
    "id": "fast-talk", "name": "Fast talk", "scope": "project", "basedOn": "creator",
    "settings": { "pace": "fast", "captions": "word-by-word", "broll": "medium" }, "yours": ["pace", "captions"],
    "effects": ["big-word", "section-tag"],
    "rules": ["Hard cuts every 2–3 s (measured, refs 1 2 3)", "Captions six words at most, bottom third (seen, refs 1 2)"]
  },
  "references": ["refs/a.mp4", "refs/b.mp4", "refs/c.mp4"],
  "measured": { "summary": { "shotsPerMinute": { "median": 24, "min": 20, "max": 30, "of": 3 } } },
  "suggestedBy": "claude"
}
```

```bash
kinotta style suggest motion/work/style/suggestion.json
```

- One style, a new id. The command refuses an id already in use; never edit `reels/styles/*.json` yourself.
- Each rule is one line a builder can follow, ending with its evidence: measured or seen, and which references.
  A rule only one reference supports says so ("ref 2 only"). Keep it to the rules the references share.
- Put a measure in `settings` only when the references agree on it; leave the rest to rules.
- Fonts and colours come from the brand file, never from the references.
- Hand over in one short message: the style's name, its rules, what was inferred, and that it waits on the Direction
  screen for Keep or Discard. Nothing is applied until the owner keeps it.
