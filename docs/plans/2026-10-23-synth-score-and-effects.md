---
title: Synthesized score and effects
date: 2026-10-23
status: Done
summary: Kinotta writes its own beat-synced music and sound effects in code, as editable stems on audio tracks, and drops the bundled Pixabay effects.
spec:
---

## Intent

- Problem: Kinotta's sound comes from 21 bundled Pixabay MP3s (`skill/kinotta/assets/sfx/`), the optional Stable Audio model, Kokoro voice and owner files. None of them know where the reel's cuts are, so hits are placed by hand. Stable Audio is gated and slow. The Pixabay effects carry third-party terms that are a risk for open sourcing (recorded in the sound-sourcing plan, D4). A native Claude reel showed that a short numpy script can write a full score and effects with math, timed to the picture's own cut times.
- Why: Sound is where a native showreel is furthest ahead of Kinotta's reels. Writing sound in code fixes the timing, removes the licensing risk and needs no model.
- Proposed outcome:
  - A generator script writes a reel's score from its cut and hit times as stems: one music-bed file with an exact `beats` grid, plus one short file per effect (whoosh, impact, riser, pop, ping, bell, click). Each stem goes on its own track through the existing `placement-add` path, so the owner can move, trim, mute and duck it.
  - The editor's sound-effects catalogue lists synthesized effects instead of the Pixabay files, with the same preview and add actions.
  - The Pixabay MP3s, their `CREDITS.md`, `NOTICE.md` and manifest entries leave the repo.
  - Stable Audio stays optional, for organic beds and ambience.
- Affected: `skill/kinotta/scripts/` (new generator), `skill/kinotta/assets/sfx/`, `skill/kinotta/reference/sound.md`, `skill/kinotta/SKILL.md`, `server/core/_internal/sound-effects.ts`, `server/core/index.ts`, `server/http/_internal/handler.ts`, `web/src/api/_internal/client.ts`, `web/src/review/_internal/MediaEditor.tsx`, `tests/core/sound-effects.test.ts`, `tests/core/render-sound-effects-editor.test.ts`, `tests/engine/sound-skill.test.ts`.
- Constraints:
  - Frozen versions never change. Reels that already copied a Pixabay MP3 into a version keep it; only new work uses synthesized sound.
  - Saved edit lists replay to the same result (ADR 0003). An old placement that names a Pixabay effect still resolves to its copied file in the project.
  - The same inputs and seed give the same bytes, so a version freezes reproducible audio.
  - Headroom: the bed peaks near −6 dBFS and effects stay well below full scale, so Kinotta's unlimited mix and overload check pass with speech on top.
  - Clean room: our own synthesis code, no samples. The native reel's `score.py` is a reference for techniques, not code to copy.
  - Kinotta starts processes only through `runner.ts`. Check licences of any new dependency (numpy, scipy).
  - Stable Audio, Kokoro, ducking, EQ and beat detection are unchanged.
- Out of scope: Real-instrument or ambient sound (Stable Audio's job), a music editor UI, changes to the mixer or render audio path, and motion blur (its own plan).
- Open questions (one at a time):
  - O1: Resolved 2026-10-23. Catalogue effects are rendered once and committed as WAV files, so the editor needs no Python. The script regenerates them when a recipe changes.
  - O2: Resolved 2026-10-23. The generator uses numpy and scipy (both BSD-3-Clause). They are needed only to generate a score or re-render the catalogue, never to use the editor.

## Goal

1. A reel's score can be generated from its plan's cut and hit times as a bed stem plus effect stems, placed on tracks, and every hit lands within one frame of its cut.
2. The bed's `beats` field matches the tempo the generator used exactly.
3. The editor's catalogue previews and adds synthesized effects, and no Pixabay file remains in the repo.
4. Old reels and versions that used a Pixabay effect open and render unchanged.

## Approach

One Python generator with a recipe per sound (kick, snare, hat, bass, pad, arp, whoosh, riser, impact, bell, pop, click, ping). Two modes: `score` reads a plan and writes stems for that reel; `effects` writes the catalogue WAVs and manifest. Ducking under the kick happens inside the bed stem. Everything else (levels, ducking under speech, mutes) stays in Kinotta's mixer, which is why the output is stems and not one mixed file.

The catalogue keeps its shape (`id`, `file`, `duration`, `description`), so `sound-effects.ts`, the API route and the editor panel change little. The ids of effects that have a synthesized equivalent are kept, so the agent's habits and docs carry over.

## Steps

1. Open questions resolved (O1, O2).
2. [x] Write the generator's effect recipes and `effects` mode. Render the catalogue and listen against the Pixabay set; the owner signs off by ear.
3. Swap the catalogue: replace the MP3s, manifest, `CREDITS.md` and `NOTICE.md`; update `sound-effects.ts` and tests. Confirm an old reel with a copied Pixabay effect still opens and renders.
4. [x] Write `score` mode: read cut and hit times from the plan, write the bed stem with `beats` and one effect stem per hit, and print the `placement-add` operations.
5. [x] Update `sound.md` and `SKILL.md`: synthesized score and effects first, Stable Audio for organic beds, bundled-effects text removed.
6. Run the checks below and record results here.

## Orchestration

Two herdr lanes in the worktree `.worktrees/synth-score` on branch `feat/synth-score`, with no shared files:

- agy: the generator `skill/kinotta/scripts/synth.py` (steps 2 and 4), catalogue WAVs and manifest staged in `skill/kinotta/assets/sfx-synth/`, and the skill docs (step 5).
- codex-2: the catalogue swap in code (step 3): the server reads the staged folder, keeps each file's own extension, legacy Pixabay placements in old reels still resolve, and tests.
- Contract between them: `sfx-synth/manifest.json` keeps the existing shape, `{ "<id>": { "file", "duration", "description" } }`, with WAV files.
- Deleting `skill/kinotta/assets/sfx/` waits for the owner's by-ear sign-off; Claude does it after.

## Risks

- Synthesized effects may sound thinner than recordings for paper, keys or footsteps. The by-ear sign-off in step 2 catches this; drop such effects rather than ship weak ones.
- A beat grid that ignores speech would make talking-head reels mechanical. The motion-taste plan's O2 applies: beat timing only for reels with music.

## Checks to run

- Generate the same score twice and compare the WAVs byte for byte.
- Measure each stem's peak and confirm the overload check passes with a speech track at normal level.
- Core and editor tests for the catalogue, preview and add; the old-reel render test.
- `grep -rn "pixabay\|Pixabay" skill server web` finds nothing outside history and plans.

## Result

Shipped as planned on `feat/synth-score`:
- `skill/kinotta/scripts/synth.py` with `effects` and `score` modes (agy). All 17 former catalogue ids have synthesized WAVs in `skill/kinotta/assets/sfx-synth/`; none were dropped.
- The editor catalogue reads the synthesized WAVs and keeps each file's extension; old reels with a copied Pixabay effect still open and render (codex-2, test with a generated fixture, no Pixabay bytes).
- `sound.md` and `SKILL.md` put synthesized sound first and Stable Audio second for organic beds.
- The owner signed off all 17 sounds by ear on 2026-10-23; `skill/kinotta/assets/sfx/` (MP3s, `CREDITS.md`, `NOTICE.md`, manifest) removed.

Checks, rerun by Claude: catalogue regeneration byte-identical to the committed files; score mode deterministic; every effect peaks at −4 dBFS or below, 48 kHz; on a sample plan the bed's beat grid is exactly 120 BPM and each hit starts on its cut; three sound suites pass (5 tests); typecheck clean; no Pixabay reference left in `skill`, `server`, `web` or `tests`.

Deviation: score-mode hits all use one effect by default; choosing an effect per hit is left to the agent. The full core suite was not run.

## Changelog

### 2026-10-23 — Codex catalogue lane plan
- Point the server catalogue at `sfx-synth` and preserve the selected file's extension during import; reuse the existing WAV HTTP content type and editor actions.
- Exercise catalogue listing, ranged preview, import, reuse, editor playback and placement with a deterministic WAV fixture while agy's assets are pending.
- Add a copied-Pixabay frozen-reel regression that opens and renders from project bytes independently of the catalogue. Run the three scoped suites and typecheck, review the diff, and commit only lane files.
- Follow the brief's scope: no skill edits, deletion, dashboard regeneration, separate plan or session-summary files.

### 2026-10-23
- Plan created. Owner chose stems on audio tracks for generated music and to remove the bundled Pixabay effects; Stable Audio stays optional.
- O1 resolved: committed WAVs.
- O2 resolved: numpy and scipy, authoring only.
- Approved by the owner. Split between agy and a second Codex lane in a worktree.

- Codex catalogue lane complete: `sound-effects.ts` reads `sfx-synth` and imports each file with its own extension. Existing HTTP WAV content types and editor actions required no changes.
- Verification: the three scoped Vitest suites passed (5 tests), including ranged WAV preview/import, browser playback/add/reuse/Undo/Save/render, and a copied-Pixabay frozen-reel open/render regression with unchanged plan/audio bytes and saved timing/gain. `npm run typecheck`, the local frontend build and `git diff --check` passed.
- The synthesized catalogue is still pending from agy; API/editor checks use committed WAV fixtures, and the catalogue asset check uses the real manifest when present. The original Pixabay directory is untouched; its pop is retained separately as a legacy-project regression fixture with provenance.

- Follow-up plan: replace the copied legacy audio fixture with an MP3 generated from an 880 Hz sine wave, remove its old fixture and provenance note, and retain the frozen-reel open/render regression using the generated file. Verify the three scoped suites, typecheck, no Pixabay references under tracked tests, and no test file hashes matching the old asset directory. Commit only these follow-up files.
- Follow-up complete: replaced the copied fixture and its provenance note with a generated mono MP3 and regeneration note. The legacy regression still verifies saved source bytes, open/Working, waveform, timing and gain. All three scoped suites passed (5 tests), typecheck and diff checks passed, tracked test files have no Pixabay references, and none of 248 test files matches the old asset directory by SHA-256. Agy's pre-existing untracked skill files remain untouched.

### 2026-10-23 — agy generator lane
- Created skill/kinotta/scripts/synth.py with pure numpy/scipy synthesis for beat-synced music beds and sound effects, running deterministically with headroom well below full scale.
- Rendered 17 catalogue effects in skill/kinotta/assets/sfx-synth/ matching manifest shape, every file peaking below −3 dBFS (measured between −6.00 and −4.00 dBFS), verified byte-identical across multiple runs.
- Implemented synth.py score mode: parses plan cut and hit times, outputs bed stem with exact `beats` grid (and ducking under the kick) plus one stem per hit starting within one frame of its cut, and prints placement-add operations.
- Updated sound.md and SKILL.md to prioritize synthesized score and catalogue effects first and Stable Audio for organic beds, removing all Pixabay references.
- Owner signed off all 17 synthesized effects. Pixabay folder removed. Done.
