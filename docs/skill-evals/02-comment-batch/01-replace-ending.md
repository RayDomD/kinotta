# Replace ending

Workflow: `02-comment-batch`

Split: development

Provenance: Verbatim text from `reels/kinotta-showcase/v1/comments.json` in the primary checkout; paired next-version answers corroborate the work. Private brand sources are excluded.

## Request

```text
remove the slide 10, change it with sometihing else, also for the design can we make it more dynamic and a little more 3d elements?
```

## Starting state

CLI preflight succeeds. Supply a public-only `reels/brand.md` with a dated `checked:` and sources `DESIGN.md`, `PRODUCT.md` and `README.md`; copy those public sources into the sandbox. Do not copy the local brand file or personal taste files. Record this neutral brand substitution in both runs. All versions described as frozen are hashed before the run. Use the owner archive `reels/kinotta-showcase/v1/comments.json` and frozen `v1/index.html`, `shots.json` and all local assets. Copy only versions through v1; hide later versions and answers. Use its exact saved batch as input. The request block quotes only the stored note/comment text verbatim, not a fabricated full clipboard export.

## Good result

- Write v2 `index.html`, local assets, `answers.md` and `shots.json` last; no writes to v1.
- Replace shot 10 with a distinct idea; use depth and more dynamic composition. This is a legacy single-page storyboard: do not silently convert it to parts or claim playback from a still composition.
- Answer the note, including a clear reason if motion is only partly delivered. Preserve identities of unchanged content and any kinotta-edits.css link.
- `kinotta check kinotta-showcase v2` reports no contract issues. Owner judges the replacement and visible depth; later v2/answers.md is historical evidence, not a required design solution.

## Governing SKILL.md sections

`4. Build the next version from a batch`; `Hard rules`; `Parts workflow` (legacy compatibility).
