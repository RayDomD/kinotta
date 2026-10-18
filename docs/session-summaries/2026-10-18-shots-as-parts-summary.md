# Shots as parts

The implementation merged into `main` through `5f3a23d` on October 15. This summary closes the original plan during the October 18 cleanup.

Contract 2 manifests identify immutable shot revisions and a shared revision. Kinotta computes starts and assembles one deterministic page with the existing timing contract. Publishing stages and checks the page before renaming it into a version. `kinotta build` and `kinotta check` support parts. Pins, carry and grouped comment batches follow stable shot names; timing changes move later shots and attached sound. Shared changes mark every shot changed. Existing single-page versions retain their path.

The source run proved the assembler's seek/play/pin stop gate before implementing downstream work. Tests cover manifest validation, scoped styles, deterministic assembly, missing revisions, publishing, change detection, carry, batches and sound. Actual Draft and transparent Overlay renders used the unchanged engine. The end-frame regression covers floating-point duration tolerance. See [the source evidence](../briefs/2026-10-14-live-edits-parts-alternates/1-chain-codex.md).

The October 15 integration reports all six parts browser tests passing and 33 existing browser tests passing, alongside focused core checks. It records no engine changes. This cleanup changes no parts implementation or engine files.

Current cleanup verification and UI review are recorded in [the cleanup summary](2026-10-18-codex-run-cleanup-summary.md).
