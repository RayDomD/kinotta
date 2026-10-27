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

