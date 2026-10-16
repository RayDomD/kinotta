# Random audio seeds

Plan: [random-audio-seeds](../plans/2026-10-17-random-audio-seeds.md).

The raw Stable Audio script now chooses a fresh random seed when omitted and prints the selected value on completion. Explicit seeds, including zero, are preserved. Editor and CLI already chose random seeds when omitted, so their code required no changes. The sound guidance now uses an example without a fixed seed, reserves explicit seeds for requested reproduction, and requires fresh music based on the current reel unless reuse is requested.

Verified: 16 tests across the audio-generation service and script validation suites; typecheck passed. An isolated invocation of the raw script with substituted model and file-writing functions produced four distinct random seeds, preserved explicit seeds 0 and 314159, and reported every selected seed. This check did not run model inference.

The owner also supplied an earlier failure, `python failed: spawn EPERM`, from Raydom's generation command. That is a child-process launch refusal before Stable Audio starts. A current call through the same runner successfully started Python and reached duration validation, without loading the model or writing audio. The originating environment's restriction remains unconfirmed; no permission changes or alternative launch paths were added. No reel assets were changed.
