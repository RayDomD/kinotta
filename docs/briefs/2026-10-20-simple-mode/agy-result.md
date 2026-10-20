# AGY — Simple Mode Phase 4 Result: Dead-Air & Breath Cutting

## What Shipped

1. **Dead-Air & Breath Cutting Engine (`server/core/_internal/dead-air.ts`)**:
   - Implemented `cutDeadAir(words, duration, options?)` returning standard plan `pieces` (`Piece[]`, `{ in, out }[]`) via `snipPieces` (`server/core/_internal/edit-model.ts`).
   - Added one strength setting (`DeadAirStrength = 'gentle' | 'normal' | 'tight'`, default `'normal'`) and `false` to disable automatic cutting.
   - Exported named threshold constants, each documented with a one-line reason comment:
     - `GENTLE_GAP_SECONDS = 1.2`
     - `NORMAL_GAP_SECONDS = 0.7`
     - `TIGHT_GAP_SECONDS = 0.35`
     - `WORD_PAD_SECONDS = 0.08`
     - `BREATH_MIN_GAP_SECONDS = 0.25`
     - `BREATH_MIN_PEAK = 0.015`
     - `BREATH_MAX_PEAK = 0.25`
   - Preserves leading silence before the first spoken word and trailing silence after the last spoken word; a talk with no long gaps (or fewer than 2 words) stays one piece `[{ in: 0, out: duration }]`.
   - Deterministic audible breath trimming (`hasBreathPeak`): trims wordless inter-word gaps (`>= BREATH_MIN_GAP_SECONDS`) after the `WORD_PAD_SECONDS` word tail when waveform peak buckets fall within `[BREATH_MIN_PEAK, BREATH_MAX_PEAK]`, ignoring ambient room silence (`< BREATH_MIN_PEAK`) and loud non-speech sounds (`> BREATH_MAX_PEAK`).

2. **Make / `startReel` Integration & API Exports**:
   - Wired `cutDeadAir` and `waveformPeaks` (`server/core/_internal/runner.ts`) into `startReel` (`server/core/_internal/start.ts`) so the first version (`v1`) built from a transcript automatically has dead air and audible breaths removed into `plan.pieces`.
   - Added `deadAir?: DeadAirStrength | false` to `NewReel` (`server/core/_internal/types.ts`) and `NewReelInput` (`web/src/api/_internal/client.ts`, `web/src/api/index.ts`).
   - Re-exported `cutDeadAir`, `isDeadAirStrength`, `DEAD_AIR_STRENGTHS`, `DeadAirStrength`, `DeadAirOptions`, and all threshold constants from `server/core/_internal/transcription.ts` and `server/core/index.ts`.

3. **Tests (`tests/core/dead-air.test.ts`, `tests/core/transcription.test.ts`)**:
   - Added `tests/core/dead-air.test.ts` (17 tests) covering:
     - Word timings in -> `pieces` out across `'gentle'`, `'normal'` (and default omitted), and `'tight'`, including `WORD_PAD_SECONDS` preservation and intro/outro preservation.
     - Single-piece invariant when a talk has no long gaps, 0 words, or 1 word.
     - Audible breath detection in wordless gaps (room silence ignored, breath trimmed, loud audio ignored).
     - `startReel` end-to-end integration across default `'normal'`, `'tight'`, `'gentle'`, `false`, invalid `deadAir` rejection, and real-audio breath trimming via `waveformPeaks`.
   - Updated `tests/core/transcription.test.ts` (`a long video`) to account for the two 4.5s pauses being cut into 3 `plan.pieces` on `startReel`.

## Checks Run & Results

- `npx tsc --noEmit`
  - **Result**: Passed (`0` errors).
- `npx vitest run tests/core/dead-air.test.ts tests/core/start-reel.test.ts tests/core/transcription.test.ts`
  - **Result**: `3 passed` test files (`35 passed | 1 skipped`, `0 failed`) in `7.51s`.
    - `tests/core/dead-air.test.ts`: 17 passed
    - `tests/core/start-reel.test.ts`: 8 passed (including the single-runner architectural guard)
    - `tests/core/transcription.test.ts`: 10 passed, 1 skipped (`KINOTTA_REAL_WHISPER`)

## What Is Unfinished / Notes for Integration

- **Phase 4 core scope is complete.**
- **UI strength picker exposure**: `startReel` and `NewReelInput` accept `deadAir?: 'gentle' | 'normal' | 'tight' | false` (defaulting to `'normal'` automatically on Make). If a UI control in `NewReel.tsx` is desired later, it can pass `deadAir` directly to `startReel`.
- **Cross-lane note for full-suite runs**: Any untouched test outside our scope that calls `startReel` with synthetic word timings containing >0.7s inter-word gaps and asserts unedited timeline timestamps on `v1` can either pass `deadAir: false` or assert against the cut timeline.
