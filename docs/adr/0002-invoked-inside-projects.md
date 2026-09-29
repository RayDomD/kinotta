# Kinotta is invoked inside existing projects, not in its own workspaces

Kinotta ships as a global Claude skill plus the editor app. You run Claude inside any existing
project (for example a brand repo like Aroma) and invoke the skill; reels are written to
`<project>/reels/`, and the editor opens that folder. We chose this because projects already hold
the assets, design system and brand guidelines a reel should be built from, and copying them into
separate workspaces would fork them.

On first use in a project, Claude discovers the brand sources and writes `reels/brand.md` for you
to check once; later runs read that file instead of re-scanning, so two runs cannot silently pick
different logos. The taste list is global, with an optional per-project addition in
`reels/taste.md`.

## Consequences

- The editor code never holds client assets or reels.
- The Claude-side rules live in the skill, not in each project, so updating the skill updates every project.
