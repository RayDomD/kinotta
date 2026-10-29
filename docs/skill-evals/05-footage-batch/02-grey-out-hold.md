# Grey out hold

Workflow: `05-footage-batch`

Split: development

Provenance: Verbatim pinned text from `tests/e2e/section-batches.spec.ts`; it is an unsent pin in that test. This case explicitly hands it off as its own later sandbox batch.

## Request

```text
Hold the grey-out longer.
```

## Starting state

Copy `tests/fixtures/projects/footage-project/` into a sandbox, preserving its intentionally short two-section sample. Latest frozen version is founder-talk v1; cold-open has clips 01/02, sync-problem has 03/04. Files: reel.json, transcript.json, v1/index.html and shots.json; motion/plan.json and motion/clips/*.html. Before evaluating either candidate, copy transcript and the plan into v1, rebase relative paths to the same files, and prove a scratch compose of that exact plan matches v1. Record any preparation mismatch and stop rather than replacing the frozen page with a different build. The preparation adds the historical fixture's missing retained inputs equally for both runs. Hash the resulting frozen v1. Use Kinotta to pin and Copy the case's section batch; do not fabricate its schema or read its working journals. Pin shot 03 in sync-problem at x=.3,y=.4, element null, then Copy that section alone to comments-sync-problem.json. No cold-open comments are included.

## Good result

- Write v2 build inputs/page, answers.md for the pin and shots.json last, with changedSections [sync-problem]. Keep cold-open and frozen v1 unchanged.
- Interpret the panel position together with the explicit grey-out wording; extend the grey-out visual state within clip 03 rather than silently changing video or another section's timing.
- Preserve existing bounds/identities. `kinotta check founder-talk v2` reports no contract issues. Owner compares the grey-out hold by playback/scrub, including clip 03's settled state.
- If interpretation remains materially ambiguous, ask once rather than claiming that a panel's position pin always refers to a drawn element.

## Governing SKILL.md sections

`6. Next footage version from a section batch` (position pins); `The plan`.
