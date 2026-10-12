# Ducking implementation

Implemented phase 2 after the owner approved the detailed right sidebar and asked to proceed one phase at a time. Track EQ, beat editing and the effects shelf are not implemented in this step. All changes remain local and uncommitted. No git writes or external sends were performed.

## Result

- F1: Selecting an audio clip opens its settings in the right sidebar. The Sound tab follows the selection and shows clip volume, fades, speech-track selection, amount, attack, release and a proposed duck curve.
- F2: Apply ducking creates ordinary editable volume points through a `placement-duck` edit. Undo restores prior points and Save preserves the new points. Speech spans are frozen in clip-local seconds, including source trim and loops. Reapply after changing speech timing.
- F3: `kinotta duck --plan <file> --placement <id> --speech-track <id>` prints the same operation for an agent without changing the plan or the owner's edit list. The sound reference documents how to apply it to the agent's working plan.

## Choices

- D1: Amount is a reduction of 0–24 dB from the clip's initial gain. Attack and release range from 0.01 to 5 seconds. Existing fades and track levels still apply. Zero amount clears the volume-point envelope.
- D2: Word gaps of at most 0.3 seconds and overlapping ramps share one dip. Points are ordered, unique and clipped to the placement. No overlapping speech preserves existing points. Muted speech tracks and placements do not trigger ducking.
- D3: The Sound panel follows the project's existing DOM contracts and companion verification files. Its invariants run in Chromium against empty, unavailable, invalid, busy and ready states, plus an intentionally inconsistent state. No separate verification framework was added.

## Test evidence

The initial model test failed because `placement-duck` did not exist. The agent-command test failed because `duck` was not a supported command. Both passed after the implementation. A muted-speech regression failed before muted speech was excluded.

Two existing preview tests initially found both the old Clip volume input and the new Sound volume input by partial accessible-label matching. The new input now has a distinct label. Both tests passed in the final run, without changing the existing tests.

```text
npm run typecheck
> tsc --noEmit
Exit 0

npm run build
✓ 96 modules transformed.
✓ built in 385ms
Exit 0

npm test -- --project=unit --maxWorkers=4
Test Files  65 passed (65)
Tests       621 passed | 1 skipped (622)
Duration    50.03s

npm test -- tests/core/media-duck.test.ts tests/core/cli-duck.test.ts tests/core/render-media-duck-editor.test.ts tests/core/render-media-preview.test.ts tests/core/render-media-tracks.test.ts --maxWorkers=4
Test Files  5 passed (5)
Tests       19 passed (19)
Duration    86.29s

npm run test:e2e -- tests/e2e/clips.spec.ts --workers=2
3 passed (52.3s)

git diff --check
Exit 0, no whitespace errors
```

The final targeted run followed the muted-speech fix and the accessible-label fix. The unit suite's one skip is the existing live transcription test. The full render suite was not run in this step.

The browser test verifies selection, Apply, Undo restoration, Save and saved points. It renders a constant-level test bed and compares decoded audio with preview's `mixAt` at silence, attack, speech and release samples, within an absolute amplitude tolerance of 0.0005. The existing track-render test and 13 preview tests also pass. The sidebar was visually inspected at 1440 × 1000.

## Next

Track EQ is the next implementation phase. Follow the approved right-sidebar mockup and the plan's response-parity test before adding EQ controls.
