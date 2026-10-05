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
- Amended 2026-10-05 (E11): a video dropped into Kinotta is copied into `<project>/footage/`, so the
  project, not the editor, owns it. A video picked from the project is not copied.
- Amended 2026-10-05 (T42): the drop is streamed to `footage/` and hashed as it is written; a file already in
  `footage/` with the same content is reused instead of copied again, and a different file with the same name
  gets `-2`, `-3`. For HEVC or ProRes the editor also writes an H.264 copy of that file to `footage/.playback/`
  so browsers can play it. The original is never altered, `reel.json` keeps pointing at it, and the copy is
  served in its place. These copies are the only files the editor adds outside `reels/`.
