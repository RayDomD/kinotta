# Faster laptops

Workflow: `05-footage-batch`

Split: development

Provenance: Verbatim pinned text from `tests/e2e/section-batches.spec.ts`, test "copying a section hands off only that section".

## Request

```text
Slide the laptops in faster.
```

## Starting state

Copy `tests/fixtures/projects/footage-project/` into a sandbox, preserving its intentionally short two-section sample. Latest frozen version is founder-talk v1; cold-open has clips 01/02, sync-problem has 03/04. Files: reel.json, transcript.json, v1/index.html and shots.json; motion/plan.json and motion/clips/*.html. Before evaluating either candidate, copy transcript and the plan into v1, rebase relative paths to the same files, and prove a scratch compose of that exact plan matches v1. Record any preparation mismatch and stop rather than replacing the frozen page with a different build. The preparation adds the historical fixture's missing retained inputs equally for both runs. Hash the resulting frozen v1. Use Kinotta to pin and Copy the case's section batch; do not fabricate its schema or read its working journals. Pin shot 01 in cold-open at position x=.3,y=.4; save comments-cold-open.json. Also prepare unsent sync-problem pins "Hold the grey-out longer." and "Merge box needs a beat." as the test does. Only the cold-open batch is handed off.

## Good result

- Read the frozen inputs and batch; verify source parity before editing. Rebuild cold-open's requested laptop entrance into v2; sync-problem clips and bounds stay unchanged.
- Keep footage, transcript times, clip/element identities and section boundaries. Write v2/index.html, plan.json, transcript.json, answers.md and shots.json last; changedSections is [cold-open], builtBy is the actual agent.
- `kinotta check founder-talk v2` reports no contract issues. Owner sees a quicker entrance, not changed clip duration or unrelated edits.
- Kinotta carries unsent pins forward; the agent does not manually migrate them or answer the other section's comments. v1 stays unchanged.

## Governing SKILL.md sections

`6. Next footage version from a section batch`; `The plan`; `4. Build the next version from a batch` (answers).
