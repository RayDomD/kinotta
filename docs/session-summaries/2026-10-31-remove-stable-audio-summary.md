# Remove Stable Audio ? session summary

The approved removal is implemented on `chore/remove-stable-audio`. The plan remains In Progress because its full-suite green criterion is unmet.

## Shipped versus planned

Removed the local generator end to end: Python script, runner, service, public types, HTTP route, CLI command, startup tool probe, web client and Generate panel. Sound guidance now directs authors to synth.py, the synthesized catalogue, Kokoro and owner files. Existing WAV handling was preserved. Historical docs were not rewritten.

The reference audit also found a duplicated web ToolStatus entry, a null-body case for the deleted route, and prompt-chip interactions inside a mixed transport test. Removed those obsolete cases. Extended the existing Working WAV browser test to open Sound and confirm Generate is absent. No synthesis, transcription, ducking or EQ implementation changes were made.

## Verification

- Typecheck, production build, documentation check and diff whitespace check passed.
- Tracked-file scans outside docs/dist found no Stable Audio references or removed generation identifiers, route, script name or prompt controls.
- Playwright: 1 passed. Sound opens without Generate; a WAV loads and plays from Working without a new saved version.
- Focused tools / tools HTTP / null-body HTTP: 13 passed.
- Sound-skill: all 10 passed with a 30-second timeout. The default full run had two 5-second synthesis timeouts.
- Full npm test: 173 files passed, 8 failed; 1,467 tests passed, 12 failed, 7 skipped; 1,528.86 seconds. The run preceded removal of the obsolete mixed-test prompt steps.
- After removing those steps, the mixed transport test reaches a viewer-height mismatch (361.578125 versus minimum 440.125). An untouched HEAD snapshot reproduces that exact mismatch and the other transport test's divider mismatch (50 versus 60). These two are pre-existing.
- Eight other render failures remain: media-elements (1), media-preview (1), media-regions (2), media-sync (2), media-verify (1), timeline-window (1). No baseline claim is made for these eight. Their implementations were not changed.

## Remaining work

Triage the broader suite failures before closing the plan. No unrelated interaction fixes were added, and no push or merge was performed.

Test output remains in the system temporary directory as `kinotta-remove-stable-audio-tests.log`, `kinotta-remove-stable-audio-focused.log`, `kinotta-remove-stable-audio-synth.log`, `kinotta-remove-stable-audio-transport.log`, and `kinotta-remove-stable-audio-baseline.log`.
