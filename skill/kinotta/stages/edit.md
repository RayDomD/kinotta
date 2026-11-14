Reads: `../SKILL.md` and current Working.
Does: Apply supported mechanical edits to Working.
Writes: Durable Working operations.
Owner's check: Review and undo edits in Edits.

Paths such as `reference/`, `assets/`, `templates/`, `engine/` and `scripts/` are relative to the skill root, not this stage folder.

## Small changes to Working

For gain, mute, track controls, timing, captions, words, element offsets and supported media placements, add an operation instead of copying a version. Use your actual agent name:

```text
kinotta edit <slug> --by <your name> '{"kind":"placement-change","placement":"music-bed","changes":{"gain":0.35}}'
```

Use existing source and placement identities. An added source path must resolve from the working input folder, or be the absolute path returned by the import/generation tool. The command returns the durable edit list. Confirm the operation and its `by` name in that result. The owner sees it in Edits and can undo it. Report the change as an edit to Working, without inventing a version number. Do not manipulate the journal, cancel a hand-off or create a manual checkpoint.

Supported changes also include framing and layer. Do not rewrite a frozen plan. Preserve identity fields and keep unrelated values out of the operation. The command validates against current Working. Final/Overlay renders and comment hand-offs preserve exact media and dependencies through the core freeze boundary. Drafts use temporary job captures.

## Colour grade

Grade a footage or image placement with `changes.grade`. It is the same grade the owner sets with the wheels in the editor, and the render applies it with stock ffmpeg filters.

```text
kinotta edit <slug> --by <your name> '{"kind":"placement-change","placement":"interview-a","changes":{"grade":{"temperature":5600,"contrast":1.1,"shadowsColor":[-0.04,0,0.06]}}}'
```

A grade change is partial. The keys you name change, the others keep their value, and `null` returns a key to neutral. Name only what you mean to move, so one operation reads as one decision in Edits.

| Key | Neutral | Range | Moves |
|---|---|---|---|
| `exposure` | 0 | -3 to 3 | brightness in stops |
| `temperature` | 6500 | 2500 to 12000 | lower is warmer, higher is cooler |
| `tint` | 0 | -0.3 to 0.3 | negative green, positive magenta |
| `contrast` | 1 | 0.5 to 2 | spread between dark and light |
| `saturation` | 1 | 0 to 2 | colour strength, 0 is black and white |
| `blacks` | 0 | -0.2 to 0.2 | positive lifts the black point, negative crushes it |
| `mids` | 0 | -1 to 1 | midtone brightness |
| `whites` | 0 | -0.3 to 0.3 | positive brightens the white point, negative dims it |
| `shadowsColor`, `midtonesColor`, `highlightsColor` | `[0,0,0]` | each of r, g, b -1 to 1 | colour push in that tonal range (the Lift, Gamma and Gain wheels) |

A grade belongs to one placement occurrence, so grade every occurrence of a source that should match. Keep corrections small: a few hundred kelvin, contrast within 0.9 to 1.2, and wheel pushes under 0.1 usually read as correction rather than a look. Check the result in a draft render before reporting it.

