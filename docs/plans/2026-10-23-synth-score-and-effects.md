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

1. [x] Open questions resolved (O1, O2).
2. [x] Write the generator's effect recipes and `effects` mode. Render the catalogue and listen against the Pixabay set; the owner signs off by ear.
3. [x] Swap the catalogue: replace the MP3s, manifest, `CREDITS.md` and `NOTICE.md`; update `sound-effects.ts` and tests. Confirm an old reel with a copied Pixabay effect still opens and renders.
4. [x] Write `score` mode: read cut and hit times from the plan, write the bed stem with `beats` and one effect stem per hit, and print the `placement-add` operations.
5. [x] Update `sound.md` and `SKILL.md`: synthesized score and effects first, Stable Audio for organic beds, bundled-effects text removed.
6. [x] Run the checks below and record results here.

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

Score-mode hits cycle through five effects by default: whoosh, impact-bass-1, pop, ping and chime. An explicit effect per hit overrides the cycle. The full core suite was not run.


### Review fixes and verification, 2026-10-23

B5-B11 complete. Setup checks/installs both numpy and scipy with the existing fallback pattern. Score output creates only missing `music`/`sfx` track IDs from input `media.tracks`, with orders above the current maximum; the engine is unchanged. Real `applyOperation` tests cover both absent, both existing and partially existing score tracks, preserving existing settings. All catalogue/API/editor tests use the real 17-entry catalogue. No test needs the synthetic catalogue fixture now; removed the path-mocking helper rather than adding an unused server override. Existing fixture WAVs were left alone. The sound reference records legacy copied-file playback.

Checks: `npm run build` passed (existing large-chunk advisory); `npx vitest run tests/engine/sound-skill.test.ts tests/core/sound-effects.test.ts tests/core/render-sound-effects-editor.test.ts` passed 3 files / 8 tests, including editor playback/add/Undo/Save/render and the frozen legacy MP3 regression; `npm run typecheck` and `git diff --check` passed. `rg -n 'synth-effects|_internal/sound-effects|fixtures/sfx-synth' tests` finds no remaining fixture-helper, fixture-directory or direct module imports. `rg -ni pixabay skill server web` finds only the compatibility line explicitly required by B11; the former `skill/kinotta/assets/sfx` directory is absent. The no-reference check has that authorized exception. All six plan steps are complete; Status stays Done. The Goal still answers the Intent: reproducible stems, usable catalogue and preserved old-reel audio.

#### Stem peaks and speech overload

Evidence directory: `C:/Users/ryand/AppData/Local/Temp/kinotta-review-fixes-b`. Input `plan.json`: duration 8 s, fps 30, cuts `[0, 1, 2, 3, 4]`, one eight-second gap with no sources and empty tracks. Score defaults: tempo 120, seed 42. Generated operations were applied through the real `applyOperation`; then a Speech track (order 2, gain 1) and an audio placement at 0, in 0, out 8, gain 1 were added. Bed placement gain is 0.8, effect placement gains 0.35, score track gains 1. The resulting plan is saved as `mix-plan.json`.

Commands run (PowerShell; `$evidence` names that directory):

```powershell
$evidence = Join-Path $env:TEMP 'kinotta-review-fixes-b'
python skill/kinotta/scripts/synth.py effects "$evidence/after/effects"
python skill/kinotta/scripts/synth.py score "$evidence/plan.json" "$evidence/after/score"
Add-Type -AssemblyName System.Speech
$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synthesizer.SetOutputToWaveFile("$evidence/speech-raw.wav")
$synthesizer.Speak('Make room for the idea. Build the picture, listen to the rhythm, and review each moment together.')
$synthesizer.Dispose()
ffmpeg -v error -y -i "$evidence/speech-raw.wav" -af loudnorm=I=-18:TP=-3:LRA=11 -ar 48000 -ac 1 "$evidence/speech.wav"
ffmpeg -hide_banner -i "$evidence/speech.wav" -af volumedetect -f null -
```

The Python generation commands were invoked through `subprocess.run` with stdout captured; score JSON lines were saved as `operations.json`. Speech is actual local Windows TTS, normalized to a normal spoken level of -18 LUFS with a -3 dBTP target; measured sample peak -2.999988 dBFS, mean volume -20.2 dBFS. Stem peak measurement command:

```python
from pathlib import Path
import tempfile, numpy as np
from scipy.io import wavfile
root = Path(tempfile.gettempdir()) / 'kinotta-review-fixes-b'
for file in sorted((root / 'after/score').glob('*.wav')):
    rate, samples = wavfile.read(file)
    print(file.name, 20 * np.log10(np.max(np.abs(samples.astype(float))) / 32768))
```

| Stem | Peak dBFS |
|---|---:|
| `bed.wav` | -6.000478 |
| `hit-01.wav` | -4.500292 |
| `hit-02.wav` | -4.000508 |
| `hit-03.wav` | -4.500292 |
| `hit-04.wav` | -4.500292 |
| `hit-05.wav` | -4.500292 |

Real overload-check command against that preserved mix plan:

```powershell
node --experimental-transform-types --input-type=module -e "import {readFileSync} from 'node:fs'; import {join} from 'node:path'; import {tmpdir} from 'node:os'; import {measureOverload} from './server/core/_internal/media-overload.ts'; import {mediaMixArgs} from './server/core/_internal/media-render.ts'; import {mixPeaks} from './server/core/_internal/runner.ts'; const root=join(tmpdir(),'kinotta-review-fixes-b'); const plan=JSON.parse(readFileSync(join(root,'mix-plan.json'),'utf8')); console.log(JSON.stringify(await measureOverload(plan.media,root,plan.duration))); console.log('Mix peak dBFS:',20*Math.log10(Math.max(...await mixPeaks(mediaMixArgs(plan.media,root,plan.duration,0.01)))));"
```

PASS: `{"spans":[]}`. Unlimited render mix peak: -0.022215 dBFS. This sample passes with narrow headroom; this is not a guarantee for arbitrary speech or overlapping hits. No mix settings or engine behavior were changed to force a pass.

#### Before/after WAV identity

Before changing the constants, generated the catalogue and sample score with the original `synth.py` at `cbe6e55`, using the same input/default tempo/seed above and `before/effects`, `before/score` output directories. After changing the constants, regenerated into `after/effects`, `after/score`. The complete set of 23 WAV SHA-256 hashes matches. Generation included both catalogue seeds and score hit seed variations, covering all recipes and the five-effect hit cycle. WAV files in the repository were not modified.

Hash command used for each directory, followed by `assert before == after` on the resulting dictionaries (`before-hashes.json`, `after-hashes.json` in the evidence directory):

```python
import hashlib
hashes = {str(p.relative_to(directory)): hashlib.sha256(p.read_bytes()).hexdigest()
          for p in sorted(directory.rglob('*.wav'))}
```

| WAV | SHA-256 before | SHA-256 after |
|---|---|---|
| `effects/chime.wav` | `f56d0c96fb67fa01309ad2b5c7ce5e02a5be78237db36c8bbca3747317199207` | `f56d0c96fb67fa01309ad2b5c7ce5e02a5be78237db36c8bbca3747317199207` |
| `effects/click.wav` | `8fac4302687b2977a9e84e7a8229e84571b27f8131bcb5853c21c65d532954a4` | `8fac4302687b2977a9e84e7a8229e84571b27f8131bcb5853c21c65d532954a4` |
| `effects/error.wav` | `d23f82200b446c51d9613db954dfff5086c285eb539eb2446fefd31096e913f4` | `d23f82200b446c51d9613db954dfff5086c285eb539eb2446fefd31096e913f4` |
| `effects/glitch-1.wav` | `0c39f08336dd52807b2d39f5214ab47ff08f1465a53c2439caeb7b5cdf7b7fd0` | `0c39f08336dd52807b2d39f5214ab47ff08f1465a53c2439caeb7b5cdf7b7fd0` |
| `effects/glitch-2.wav` | `7d0f39c4feabcf6136d017ab953bede8b0e6467e07ce5c6297dbbd0b98382463` | `7d0f39c4feabcf6136d017ab953bede8b0e6467e07ce5c6297dbbd0b98382463` |
| `effects/glitch-3.wav` | `ea5c23b3784a255fe1b06080174d19ee69ee1b4fd5d72b8a68275fa6f7e6dc3c` | `ea5c23b3784a255fe1b06080174d19ee69ee1b4fd5d72b8a68275fa6f7e6dc3c` |
| `effects/impact-bass-1.wav` | `eefc448d97eabda983ee856f869687643f15715749ad6bd8f9535aa803acb51e` | `eefc448d97eabda983ee856f869687643f15715749ad6bd8f9535aa803acb51e` |
| `effects/impact-bass-2.wav` | `f21ee521a51935c6d6c77b1ac6ea0280464dac2136048d0e6d228c935cbd14e5` | `f21ee521a51935c6d6c77b1ac6ea0280464dac2136048d0e6d228c935cbd14e5` |
| `effects/key-press.wav` | `04483d813031b90c4c67766ba7fc902a927ea6d90f43fb87551189459409b988` | `04483d813031b90c4c67766ba7fc902a927ea6d90f43fb87551189459409b988` |
| `effects/notification.wav` | `fb8bdf5d0acbc6ad2c3605efcaf4555cb17e37ae1c8f10a7528f9590c787e8ce` | `fb8bdf5d0acbc6ad2c3605efcaf4555cb17e37ae1c8f10a7528f9590c787e8ce` |
| `effects/ping.wav` | `226f7f137df6172dfc461005d2d836967ebbb945c865e42d9dba0247a6bc8c94` | `226f7f137df6172dfc461005d2d836967ebbb945c865e42d9dba0247a6bc8c94` |
| `effects/pop.wav` | `5c970bff559f5827bc908c247013f3cdf45651ffff405169e1432788bd4ebf1f` | `5c970bff559f5827bc908c247013f3cdf45651ffff405169e1432788bd4ebf1f` |
| `effects/riser.wav` | `e80ca5d704d33c0b84c8dff630ee68ed5dc29207e2b31c42ce11bb35356aca4d` | `e80ca5d704d33c0b84c8dff630ee68ed5dc29207e2b31c42ce11bb35356aca4d` |
| `effects/sparkle.wav` | `a7a04d245d76d5f474982267547311e3d08adc7a15eebbc489cc68d3abb0e92a` | `a7a04d245d76d5f474982267547311e3d08adc7a15eebbc489cc68d3abb0e92a` |
| `effects/typing.wav` | `10e180502c7221788598ba5a744d82ae9431d249f2755f65c56fea8a0ade16dc` | `10e180502c7221788598ba5a744d82ae9431d249f2755f65c56fea8a0ade16dc` |
| `effects/whoosh-cinematic.wav` | `3021d162d74001aa3c340b575c154bb1ce9a849db28c04546ea8aae3e4ba2482` | `3021d162d74001aa3c340b575c154bb1ce9a849db28c04546ea8aae3e4ba2482` |
| `effects/whoosh.wav` | `c7ca73d6c823afbb148fefbfb19ca42939169b620d61951b3aca9943438b9ab1` | `c7ca73d6c823afbb148fefbfb19ca42939169b620d61951b3aca9943438b9ab1` |
| `score/bed.wav` | `0aa2fb5af68da00eb645c2580ec017a6d571d5910cc396416986feba513e697b` | `0aa2fb5af68da00eb645c2580ec017a6d571d5910cc396416986feba513e697b` |
| `score/hit-01.wav` | `c31068a30889e2bc89c311a0d20859120524b3ded2ddbb2c38931c54885eebc1` | `c31068a30889e2bc89c311a0d20859120524b3ded2ddbb2c38931c54885eebc1` |
| `score/hit-02.wav` | `153ec9febb56da725ad3a839a1466ab4235098da70f6df1af88bcbe4fa56aed4` | `153ec9febb56da725ad3a839a1466ab4235098da70f6df1af88bcbe4fa56aed4` |
| `score/hit-03.wav` | `5c970bff559f5827bc908c247013f3cdf45651ffff405169e1432788bd4ebf1f` | `5c970bff559f5827bc908c247013f3cdf45651ffff405169e1432788bd4ebf1f` |
| `score/hit-04.wav` | `226f7f137df6172dfc461005d2d836967ebbb945c865e42d9dba0247a6bc8c94` | `226f7f137df6172dfc461005d2d836967ebbb945c865e42d9dba0247a6bc8c94` |
| `score/hit-05.wav` | `f56d0c96fb67fa01309ad2b5c7ce5e02a5be78237db36c8bbca3747317199207` | `f56d0c96fb67fa01309ad2b5c7ce5e02a5be78237db36c8bbca3747317199207` |

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
- The synthesized catalogue has been delivered: all 17 WAVs and the manifest are committed. The owner approved them by ear, and the original Pixabay `sfx/` directory was deleted. API/editor/catalogue checks now use the real assets; the legacy regression uses generated MP3 bytes.

- Follow-up plan: replace the copied legacy audio fixture with an MP3 generated from an 880 Hz sine wave, remove its old fixture and provenance note, and retain the frozen-reel open/render regression using the generated file. Verify the three scoped suites, typecheck, no Pixabay references under tracked tests, and no test file hashes matching the old asset directory. Commit only these follow-up files.
- Follow-up complete: replaced the copied fixture and its provenance note with a generated mono MP3 and regeneration note. The legacy regression still verifies saved source bytes, open/Working, waveform, timing and gain. All three scoped suites passed (5 tests), typecheck and diff checks passed, tracked test files have no Pixabay references, and none of 248 test files matches the old asset directory by SHA-256. Agy's pre-existing untracked skill files remain untouched.

### 2026-10-23 — agy generator lane
- Created skill/kinotta/scripts/synth.py with pure numpy/scipy synthesis for beat-synced music beds and sound effects, running deterministically with headroom well below full scale.
- Rendered 17 catalogue effects in skill/kinotta/assets/sfx-synth/ matching manifest shape, every file peaking below −3 dBFS (measured between −6.00 and −4.00 dBFS), verified byte-identical across multiple runs.
- Implemented synth.py score mode: parses plan cut and hit times, outputs bed stem with exact `beats` grid (and ducking under the kick) plus one stem per hit starting within one frame of its cut, and prints placement-add operations.
- Updated sound.md and SKILL.md to prioritize synthesized score and catalogue effects first and Stable Audio for organic beds, removing all Pixabay references.
- Owner signed off all 17 synthesized effects. Pixabay folder removed. Done.

### 2026-10-23 ? Review fixes
- Completed B5-B11 per the amended brief: missing-track emission, real catalogue tests, setup dependencies, named peak constants, legacy compatibility note, corrected plan checklist and measured speech overload/WAV identity evidence above. No engine change or push.
