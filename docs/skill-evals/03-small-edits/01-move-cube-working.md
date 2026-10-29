# Move cube working

Workflow: `03-small-edits`

Split: held-out

Provenance: Synthetic natural-language request matching the exact element-offset operation in `tests/e2e/working.spec.ts`, test "Current survives reopen, preserves author names and supports Undo and Redo". No retained verbatim owner request for a supported mechanical edit was found; one case is the minimum exception.

## Request

```text
Move the cube 10 pixels right in Working. Keep its vertical position and scale.
```

## Starting state

Copy `tests/fixtures/projects/showreel-project/` into the sandbox. `product-showreel` v2 is the latest frozen version; `cube-lands` contains `cube`. Working starts at that version with no operations; initial x/y offsets are 0, scale 1. No media or brand changes are needed. CLI preflight succeeds. Hash v1/v2 first.

## Good result

- Run `kinotta edit product-showreel --by <agent>` with kind element-offset, clip cube-lands, element cube, x=10, y=0, scale=1. Confirm the returned operation and agent attribution.
- Frozen v1/v2 bytes remain unchanged; no v3, manual checkpoint, answers.md or rebuilt page is created. Journal files are managed by Kinotta, not opened or edited by the agent.
- Working shows the cube 10 authored-frame pixels to the right; Edits records the agent; undo/redo and reopen preserve the expected state.
- `kinotta check product-showreel v2` should still report no contract issues, but only checks frozen input. Grade Working via the returned operation and editor behavior; the frozen check cannot prove the edit.

## Governing SKILL.md sections

`Small changes to Working`; `1. Preflight (every run)`; `Hard rules` (frozen versions and edit-list ownership).
