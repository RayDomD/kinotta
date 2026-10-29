# Launch waiting shell

Workflow: `01-new-reel`

Split: development

Provenance: Verbatim `BRIEF` in `tests/e2e/brief-reel.spec.ts`, with its actual Start from brief waiting-shell scenario. Only the brief is quoted; no unrecorded clipboard wording is invented.

## Request

```text
A 20 second teaser for the spring launch.
```

## Starting state

CLI preflight succeeds. Supply a public-only `reels/brand.md` with a dated `checked:` and sources `DESIGN.md`, `PRODUCT.md` and `README.md`; copy those public sources into the sandbox. Do not copy the local brand file or personal taste files. Record this neutral brand substitution in both runs. All versions described as frozen are hashed before the run. Reproduce the test through Start from brief with title Spring teaser, then stop before its simulated agent writes files. `reels/spring-teaser/reel.json` and the waiting reel exist, but v1 is absent. Supply the generated Copy request context naming `reels/spring-teaser`. Do not use the test's dummy four-second HTML as a good result.

## Good result

- Fulfil the existing waiting reel at `reels/spring-teaser`, with a real 20-second parts build and generated v1, instead of creating a second slug.
- If the existing-folder rule causes uncertainty, ask whether to finish this shell; scripted reply: "Finish the existing spring-teaser reel." Do not overwrite an existing frozen version.
- Root parts sources/manifest and generated `v1/index.html` and `v1/shots.json` exist. Publish readiness only after the page is complete.
- `kinotta check spring-teaser v1` reports no contract issues. The waiting row becomes ready and opens its Storyboard; owner can play the authored animation in Review.

## Governing SKILL.md sections

`3. Build storyboard v1` (slug collision); `Parts workflow`; `Hard rules` (shots last).
