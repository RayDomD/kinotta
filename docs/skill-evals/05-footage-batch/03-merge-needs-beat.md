# Merge needs beat

Workflow: `05-footage-batch`

Split: development

Provenance: Verbatim pinned text from `tests/e2e/section-batches.spec.ts`; this is the other unsent sync-problem pin, promoted to an isolated handed-off batch for the eval.

## Request

```text
Merge box needs a beat.
```

## Starting state

Copy `tests/fixtures/projects/footage-project/` into a sandbox, preserving its intentionally short two-section sample. Latest frozen version is founder-talk v1; cold-open has clips 01/02, sync-problem has 03/04. Files: reel.json, transcript.json, v1/index.html and shots.json; motion/plan.json and motion/clips/*.html. Before evaluating either candidate, copy transcript and the plan into v1, rebase relative paths to the same files, and prove a scratch compose of that exact plan matches v1. Record any preparation mismatch and stop rather than replacing the frozen page with a different build. The preparation adds the historical fixture's missing retained inputs equally for both runs. Hash the resulting frozen v1. Use Kinotta to pin and Copy the case's section batch; do not fabricate its schema or read its working journals. Pin shot 04 in sync-problem at x=.7,y=.6, element null, and Copy that section to comments-sync-problem.json. No other comments. Clip 04 is a full-frame cutaway.

## Good result

- Rebuild clip 04's merge state in v2 with an observable hold/arrival beat, keeping clip 03 and cold-open unless required by the same section's explicit brief. Keep all section bounds and existing clip numbers.
- Write v2/index.html, plan.json, transcript.json, answers.md entry 1 and shots.json last; changedSections [sync-problem], actual builtBy.
- `kinotta check founder-talk v2` reports no contract issues. Owner plays and scrubs to see the merge box land and hold; it is not enough to rename the shot.
- Frozen v1 and unrelated section scenes/shots remain unchanged; retain exact plan fields and resolve dependencies from the new version.

## Governing SKILL.md sections

`6. Next footage version from a section batch` (cutaway position pins); `The plan`.
