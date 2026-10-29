# Three animated parts

Workflow: `01-new-reel`

Split: held-out

Provenance: Synthetic request using the hook/proof/close structure in `tests/helpers/parts.ts` (`partsFixture`). The fixture is contract evidence, not a historical creative request.

## Request

```text
Build a three-second Kinotta reel called Parts demo: Hook, Proof, Close, one second each. Animate each shot so I can scrub it.
```

## Starting state

CLI preflight succeeds. Supply a public-only `reels/brand.md` with a dated `checked:` and sources `DESIGN.md`, `PRODUCT.md` and `README.md`; copy those public sources into the sandbox. Do not copy the local brand file or personal taste files. Record this neutral brand substitution in both runs. All versions described as frozen are hashed before the run. No `parts-demo` reel or version. Use the public partsFixture structure as contract context only; do not copy its placeholder look.

## Good result

- Author root `reels/parts-demo/shots.json`, immutable shared revision and three named shot revision folders; build generated v1 through `kinotta build`.
- Hook, proof and close each last one second. Their motion follows awaited `seek(t)` in both directions; no autonomous timer determines state.
- `kinotta check parts-demo v1` reports no contract issues; owner sees actual movement on playback and repeatable state after scrubbing backward.
- No extra shot-count planning question when timing and message are already supplied; no approval action on the owner's behalf.

## Governing SKILL.md sections

`Parts workflow`; `Hard rules` (parts motion, timing); `3. Build storyboard v1`.
