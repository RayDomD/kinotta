Reads: `../SKILL.md` and current Working.
Does: Apply supported mechanical edits to Working.
Writes: Durable Working operations.
Owner's check: Review and undo edits in Edits.

## Small changes to Working

For gain, mute, track controls, timing, captions, words, element offsets and supported media placements, add an operation instead of copying a version. Use your actual agent name:

```text
kinotta edit <slug> --by Codex '{"kind":"placement-change","placement":"music-bed","changes":{"gain":0.35}}'
```

Use existing source and placement identities. An added source path must resolve from the working input folder, or be the absolute path returned by the import/generation tool. The command returns the durable edit list. Confirm the operation and its `by` name in that result. The owner sees it in Edits and can undo it. Report the change as an edit to Working, without inventing a version number. Do not manipulate the journal, cancel a hand-off or create a manual checkpoint.

For a picture rebuild from a batch, use the exact frozen version named in the batch as your starting point. Later owner edits are already collecting in Working and will replay onto your new version. Do not apply those edits yourself or copy the journal into the build.

## Small changes to Working

Use `kinotta edit <slug> --by <your name> <operation json>` for supported track, gain, mute, placement, framing, layer, word, caption, offset and timing changes. Do not rewrite a frozen plan or copy a version for these changes. Preserve identity fields and keep unrelated values out of the operation. The command validates against current Working, persists the edit with your name and leaves it undoable. Final/Overlay renders and comment hand-offs preserve exact media and dependencies through the core freeze boundary. Drafts use temporary job captures.

