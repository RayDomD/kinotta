# Three alternates

Workflow: `02-comment-batch`

Split: development

Provenance: Verbatim comment `Try other approaches` with options=3 in `tests/e2e/alternates.spec.ts`, test "a frame pin asks for options with three by default". Batch setup below is reconstructed from that fixture, not an archived owner batch.

## Request

```text
Try other approaches
```

## Starting state

CLI preflight succeeds. Supply a public-only `reels/brand.md` with a dated `checked:` and sources `DESIGN.md`, `PRODUCT.md` and `README.md`; copy those public sources into the sandbox. Do not copy the local brand file or personal taste files. Record this neutral brand substitution in both runs. All versions described as frozen are hashed before the run. Prepare the three-shot `partsFixture()` from `tests/helpers/parts.ts` (hook/proof/close, all r1), build it once before freezing v1. Create the test's frame-position pin on shot 02 with options=3, then Copy comments. Use the saved batch and frozen manifest; its Rebuild heading requests 3 alternates for proof. No later versions or pre-existing alternates. Fixture preparation is performed equally for both candidates and is not part of this baseline execution.

## Good result

- Write exactly three new animated proof revisions with labelled alternate metadata, titles and one-line notes; recommend one first.
- Keep hook, close and shared revision references. Update the root manifest, use `kinotta build parts --by <agent>` and supply answers for the one comment.
- `kinotta check parts v2` reports no contract issues. Alternatives show different approaches and support forward/backward seek.
- Owner chooses; the agent does not apply a Working choice or create another version for that choice. Judge animation and distinctness in the current editor; this asset case does not require implementing editor controls.

## Governing SKILL.md sections

`Parts workflow`; `Hard rules` (asset vs interaction, frozen versions, parts motion).
