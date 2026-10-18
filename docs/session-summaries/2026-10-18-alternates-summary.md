# Alternates

The original alternates implementation merged into `main` through `5f3a23d` on October 15. This closes that run's plan, with the newer inline-card interaction tracked separately.

A comment can request two to four options for one shot. Parts manifests validate revision lists and labels; alternate pages assemble the requested revision. Choosing and dismissing are undoable Working operations. A duration change moves later shots. Pins identify the alternate, batches carry the choice and dismissal reasons, and undismissed options travel into later agent builds. Rebuilt answers override older choices, while unchanged authored entries retain the owner's choice and dismissed revisions do not reappear.

Storyboard has one stacked card per shot with the alternate count and current choice. The enlarged ShotSheet contains the strip, keyboard stepping, Use, Not this and pinning. The October 15 integration corrected Review and its clip still to load the chosen Working revision; its browser regression also covers frozen history and undo.

That chooser completes the original implementation described in the source brief. It does **not** implement the owner's newer decision to preview animated alternates, switch and apply them directly in a Storyboard card. That remains [the inline-card plan](../plans/2026-10-18-inline-alternates-card.md); its implementation is outside this cleanup. The original plan's Done status must be read with this distinction.

The source brief records tests for manifests, alternate pages, requests, operations, pins, carry, batches and builds. The October 15 integration reports five alternates browser tests, six parts tests and 33 existing browser tests passing. See [the source run](../briefs/2026-10-14-live-edits-parts-alternates/1-chain-codex.md) and [integration summary](2026-10-15-viewer-alternates-merge.md).

Current cleanup verification and UI review are recorded in [the cleanup summary](2026-10-18-codex-run-cleanup-summary.md).
