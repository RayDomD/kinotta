# The render gate: summary

Date: 2026-10-05. Ticket T51 (#52). Plan: `docs/plans/2026-10-05-render-gate.md`.

## Shipped vs planned

Shipped as planned, with T50 built first.

- `footageIssues` moved unchanged from `server/cli.ts` to `server/core/_internal/footage-issues.ts`. The core exports
  `versionIssues(version)`, which returns the contract issues followed by the footage issues. `kinotta check` prints it,
  and T48's approval warning now names footage issues too.
- `prepareRender` gates Final and Overlay. The version must have `approval.json`, a footage version must have its own
  `plan.json`, and `versionIssues` must be empty. Otherwise the call throws `invalid` with every reason in one message,
  for example `v1 can't be rendered as an Overlay: it isn't approved (the owner approves it in Kinotta); it was built
  before plans were kept; it has 1 contract issue: …`. Draft skips the gate.
- `kinotta render` prints the refusal. When the version isn't approved it adds "Only the owner approves. Ask them to
  approve v<n> in Kinotta, then render again." It reads `approved` from `listVersions`.

## Deviations

- **T50 came before T51.** A footage Draft only renders since T50, and this ticket's "Draft renders in all three cases"
  includes a footage version built before plans were kept.
- **The plan rule covers footage reels only.** R13 exists so pieces can't drift with later plan edits, and a code-only
  reel has no plan. Applying the rule to every reel would refuse every code-only Final.
- **Existing render tests updated.** T50's tests now approve their versions and use pages that keep the timing contract.
- **vitest runs the render tests last.** With the render files running in parallel with everything else, two unrelated
  process-spawning tests (`handoff.test.ts`, `scripts.test.ts`) went past their 5 s timeouts in one full run. The config
  now has two projects, `unit` and `render`, and the render group starts after the other finishes (`sequence.groupOrder`).
- The per-diff review ran inline, with no sub-agents, as the owner chose for this run.

## Checks

- typecheck: clean.
- vitest: 42 files, 396 passed, 1 skipped, in two full runs after the split (2026-10-05 and 2026-10-06). `tests/core/render-gate.test.ts`
  adds 7.
- `tests/core/check.test.ts` passes unchanged, so `kinotta check` output is the same.
- No UI change, so the full Playwright suite wasn't rerun; it last ran at T50.
