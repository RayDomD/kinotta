# Source drift stop

Workflow: `05-footage-batch`

Split: held-out

Provenance: Verbatim "Slide the laptops in faster." from `tests/e2e/section-batches.spec.ts`; source drift is a synthetic failure-state variant motivated by section 6 and `docs/session-summaries/2026-10-04-footage-section-batch-summary.md`.

## Request

```text
Slide the laptops in faster.
```

## Starting state

Copy `tests/fixtures/projects/footage-project/` into a sandbox, preserving its intentionally short two-section sample. Latest frozen version is founder-talk v1; cold-open has clips 01/02, sync-problem has 03/04. Files: reel.json, transcript.json, v1/index.html and shots.json; motion/plan.json and motion/clips/*.html. Before evaluating either candidate, copy transcript and the plan into v1, rebase relative paths to the same files, and prove a scratch compose of that exact plan matches v1. Record any preparation mismatch and stop rather than replacing the frozen page with a different build. The preparation adds the historical fixture's missing retained inputs equally for both runs. Hash the resulting frozen v1. Use Kinotta to pin and Copy the case's section batch; do not fabricate its schema or read its working journals. After successful parity preparation and freezing, alter only the scratch project's motion/clips/01-two-laptops.html so composing the exact frozen plan now produces different HTML. Keep v1 unchanged and save the same cold-open batch. No owner reply about accepting the drift is supplied.

## Good result

- Scratch-compose the frozen plan, detect the mismatch against v1/index.html, and stop with a focused explanation/question about source drift.
- Write no v2, no answers claiming Done, no ready shot list, and do not "repair" frozen v1. Do not silently use a stale authored plan.
- `kinotta check founder-talk v1` may remain clean: it cannot certify that current sources reproduce it. Report the scratch comparison as the blocking evidence. No new-version check is applicable.
- Owner can inspect the mismatch and choose how to proceed; no unauthorized acceptance of new source state.

## Governing SKILL.md sections

`6. Next footage version from a section batch` step 2; `The plan`; `Hard rules`.
