---
name: kinotta
description: Build reels for the Kinotta review editor inside a project, including motion-graphic b-roll, native media and audio tracks, and build the next version from a pasted comment batch. Use when the user asks for a Kinotta reel, brand intro, showreel, storyboard, b-roll, audio-track changes or picture layout, or pastes text that starts with "Kinotta comments:". B-roll that won't be reviewed in Kinotta is motion-broll's job, not this skill's.
---

# Kinotta

You build **reels** inside the user's project for Kinotta, a local review editor. The owner reviews
each **version** in Kinotta, pins comments to its elements, and pastes the **comment batch** back to
you. You build the next version from it. Sections 1 to 4 cover code-only reels: every scene is an
HTML page, with no footage. Footage reels are sections 5 and 6.

The project folder is the one you are running in. Every path below is relative to it unless it
says otherwise.

When a plan has `media`, or the request adds sound, changes audio tracks or changes picture layout,
read `reference/native-media.md` before building or rebuilding. Its native-media rules apply to
both code-only and footage reels and replace the legacy single-video plan/copy instructions below.

When adding sound effects, voiceover, synthesized score or a generated music bed, read `reference/sound.md`
for synthesized score and effects, optional generators and their placement workflow. A comment that asks for
a sound ("add pulse sound") is answered the same way: see "Sound requests in comments" there.

## Which step am I on?

Read only the contract for the current step, plus the references it names. Paths to skill resources are relative to this skill root. The original numbered sections remain in the contracts for cross-references.

| Step / request | Contract |
| --- | --- |
| 01 Transcribe | Kinotta server (no agent contract) |
| 02 Unattended first build from Auto or Copy | [stages/02-first-build.md](stages/02-first-build.md) |
| 03 Review | Owner in Kinotta (no agent contract) |
| 04 Comment batch, parts alternates, or small Working changes (sections 4 and 6) | [stages/04-next-version.md](stages/04-next-version.md) |
| New code-built reel: direction, preflight, brand, storyboard (sections 1-3); format examples | [stages/new-reel.md](stages/new-reel.md) |
| New footage reel / interactive b-roll over video (section 5) | [stages/footage-reel.md](stages/footage-reel.md) |

## Hard rules

- **Separate assets from interactions.** An animated alternative asset does not implement animated preview, switching, or applying it in the editor. For a request about editor behavior, inspect the existing UI and relevant project design before editing. State the trigger, location, visible result, and effect on Working. A screenshot alone does not establish interaction behavior. Ask one focused question if those details remain materially ambiguous, then verify the user's exact interaction on that surface before claiming completion.

- **Versions are frozen.** Never edit, rename or delete a `reels/<slug>/v<n>/` folder that exists.
  Small mechanical changes are durable operations on Working. Only a Final or Overlay render or a comment hand-off freezes changed Working. A picture rebuild still writes a new version until the parts workflow applies.
- **Legacy storyboards are still; parts alternatives include motion.** For an existing single-page storyboard, each scene is built in its final look, but nothing
  moves: no CSS animations or transitions, no `requestAnimationFrame` loops, no timers. Describe
  proposed motion in a still concept's shot description. When motion is requested, implement it
  through the seek contract. Footage reels are the
  exception: their clips carry the engine's real animation (section 5). Parts alternatives are animated by default, following the seek contract in `reference/contract.md`, unless the owner explicitly asks for still concepts.
- **The edit list and the hand-off are Kinotta's.** Never read, write or delete `reels/<slug>/edit-list.json`,
  `reels/<slug>/handoff.json` or `reels/<slug>/.save/`. They hold durable working history and the state of a batch. Add supported edits through `kinotta edit <slug> --by <your name> <operation json>` instead. Kinotta carries later edits onto the version you write.
- **The owner opens the editor.** Leave interactive `kinotta` startup to the owner.
- **Render through `kinotta render` only.** When asked for a video, render an explicit saved
  version with `kinotta render <slug> v<n> --preset draft|final|overlay`. The command joins the
  editor's queue or hosts it headless. Use the shared queue rather than calling engine render
  scripts directly. Final and Overlay require no contract issues. Respect the command's
  plan-preservation and transparency refusals. Rendering does not require approval.
  An overloaded mix requires the owner's explicit choice before using `--accept-overload`.
  Approval belongs to the owner. Never approve or withdraw a version for them.
- **`shots.json` is written last.** Its appearance is the editor's signal that a version is ready.
- **The timing contract holds.** Read `reference/contract.md` before writing your first page in a
  session. `kinotta check` must pass before you tell the owner a version is ready.

### Who built it

`shots.json` carries `builtBy`: your own agent's name, lowercase, one word (`claude`, `codex`, …); Kinotta
shows it as "Built by <name>" in the version list. `shots.py` writes it from `--built-by <name>`, before
the section ids. Kinotta's own saves write `you`; never use that.
