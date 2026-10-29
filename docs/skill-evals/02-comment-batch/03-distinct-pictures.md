# Distinct pictures

Workflow: `02-comment-batch`

Split: held-out

Provenance: Verbatim text from `reels/kinotta-showcase/v9/comments.json` in the primary checkout; paired next-version answers corroborate the work. Private brand sources are excluded.

## Request

```text
too similar to 07
Too similar, to 06 slide
too similar again change this to be more unique
```

## Starting state

CLI preflight succeeds. Supply a public-only `reels/brand.md` with a dated `checked:` and sources `DESIGN.md`, `PRODUCT.md` and `README.md`; copy those public sources into the sandbox. Do not copy the local brand file or personal taste files. Record this neutral brand substitution in both runs. All versions described as frozen are hashed before the run. Use the owner archive `reels/kinotta-showcase/v9/comments.json` and frozen `v9/index.html`, `shots.json` and all local assets. Copy only versions through v9; hide later versions and answers. Use its exact saved batch as input. Comments 1/2/3 target shots 06/07/09 at 17.25/20.25/25.75s, elements sheet/sheet/frame-v2. The three request lines below are separate numbered comments in that order. The request block quotes only the stored note/comment text verbatim, not a fabricated full clipboard export.

## Good result

- Write v10 page/assets, `answers.md` entries 1, 2 and 3, and shot list last; v9 stays unchanged.
- Shots 06 and 07 have clearly different visual ideas; shot 09 no longer repeats their picture. Preserve unchanged scene/element names; give replacements new identities only when they are new things.
- `kinotta check kinotta-showcase v10` reports no contract issues. Compare the three shots side by side, then in sequence; colour swaps alone do not establish distinct pictures.
- v10/answers.md records one prior response; use it only for provenance after grading, not as the agent's target design.

## Governing SKILL.md sections

`4. Build the next version from a batch`; `Hard rules`; `Parts workflow` (legacy compatibility).
