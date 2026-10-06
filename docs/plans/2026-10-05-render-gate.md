---
title: The render gate (T51)
date: 2026-10-05
status: Done
summary: Final and Overlay are refused for a version that isn't approved, has no plan of its own or has contract issues, naming every reason; Draft renders anyway.
spec: docs/specs/2026-10-05-approve-and-render.md
---

## Intent

- Problem: Nothing stops a Final or Overlay of a version the owner hasn't approved, of one whose pieces would come from a later plan, or of one with placeholder frames. Footage issues live only in the CLI, so the HTTP path can't see them.
- Why: the deliverables must be what the owner approved and judged (R6, R10, R13), whoever asks for them.
- Proposed outcome: one gate in the core that Final and Overlay pass through, refusing with every reason named. Draft skips it. `kinotta check` and the gate share one list of issues.
- Affected: `server/core/_internal/render.ts`, a new core module for footage issues (moved from `server/cli.ts`), `approval.ts` (its warning gains footage issues), `server/cli.ts`, the core README.
- Constraints: R6, R10, R13, R18. A refusal is a `KinottaError` `invalid`. `kinotta check` output stays the same. The CLI never offers an approve command.
- Out of scope: rendering Final and Overlay themselves (T50, built just before this ticket so a footage Draft can be shown rendering past the gate).
- Open questions: None.

## Goal

`project.render` with `final` or `overlay` refuses an unapproved version, a footage version without its own `plan.json` and a version with contract or footage issues, naming each reason, while `draft` renders all three; `kinotta check` prints what it printed before.

## Approach

`footageIssues(version)` moves from `cli.ts` to `server/core/_internal/footage-issues.ts` unchanged, with a `versionIssues(version)` that returns the version's contract issues followed by its footage issues, the list `kinotta check` prints. The core exports `versionIssues`; `kinotta check` calls it. T48's approval warning uses it too, so approving a footage version with footage issues warns about them (the T48 summary deferred this here).

`render.ts` gains `renderGate(projectDir, request, reelDir, versionDir)`, called by `prepareRender` for Final and Overlay before anything else is decided. It collects reasons in order:

1. not approved: no `approval.json` (`APPROVAL_FILE` from `version.ts`), "it isn't approved; the owner approves it in Kinotta";
2. a footage reel's version without its own `plan.json`: "it was built before plans were kept";
3. issues from `versionIssues`: "it has N contract issues: …".

Any reason throws `invalid` with the message `v<n> can't be rendered as a Final: <reasons joined by "; ">.` The plan rule applies to footage reels only: R13 is about pieces drifting with later plan edits, and a code-only reel has no plan, so requiring one would make every code-only Final impossible.

`kinotta render` prints the refusal, and when the version isn't approved adds "Only the owner approves. Ask them to approve v<n> in Kinotta, then render again." It reads `approved` from `listVersions` to decide.

## Steps

1. Tests: unapproved Final and Overlay refused naming approval; footage version without `plan.json` refused ("built before plans were kept"); version with contract issues refused naming them, and with footage issues; all three reasons in one message; Draft renders in each case (a code-only one at least; footage Draft comes with T50); `kinotta check` output unchanged on the footage and broken samples; the CLI refusal message.
2. Move `footageIssues`, export `versionIssues`, use it in `check` and the approval warning.
3. The gate in `prepareRender`, the CLI hint.

## Risks

`kinotta check` output must not change. Existing check tests (`tests/core/check.test.ts`) guard it.

## Checks to run

typecheck, full vitest. No UI change, so no Playwright run beyond the suite already green at T49.

## Changelog

### 2026-10-05
- Plan created. T50 was built first so every Draft case could render; the plan's approach held.
- Built. Summary: `docs/session-summaries/2026-10-05-render-gate-summary.md`.
