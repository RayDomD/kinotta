# Launch from empty

Workflow: `01-new-reel`

Split: development

Provenance: Verbatim brief literal `BRIEF` in `tests/e2e/brief-reel.spec.ts`; this empty-project starting state is an explicit fixture-derived variant, not a recorded owner run.

## Request

```text
A 20 second teaser for the spring launch.
```

## Starting state

CLI preflight succeeds. Supply a public-only `reels/brand.md` with a dated `checked:` and sources `DESIGN.md`, `PRODUCT.md` and `README.md`; copy those public sources into the sandbox. Do not copy the local brand file or personal taste files. Record this neutral brand substitution in both runs. All versions described as frozen are hashed before the run. Empty `reels/` except brand.md; no `spring-teaser` reel. Public product context describes only the generic spring launch; no unsupported launch date, price or customer claims.

## Good result

- Produce `reels/spring-teaser/reel.json`, immutable `shared/<revision>/` and `shots/<name>/<revision>/` sources and the root `shots.json` parts manifest; publish v1 through `kinotta build spring-teaser --by <agent>`.
- Generated v1 has `index.html`, local dependencies and `shots.json`; it totals 20 seconds. New parts shots use seek-driven motion by default.
- `kinotta check spring-teaser v1` reports no contract issues. Owner can play and scrub forward/backward, read one idea per shot, and see a teaser consistent with the supplied brand.
- Hand over the shot list. Owner opens the editor; the agent does not start it or approve a version.

## Governing SKILL.md sections

`Parts workflow`; `1. Preflight (every run)`; `2. Brand file (before any build)`; `3. Build storyboard v1`; `Hard rules`.
