---
title: Approve and withdraw a version (T48)
date: 2026-10-05
status: Done
summary: The editor approves and withdraws versions through approval.json, the rail marks approved versions, and a change made outside the editor shows up too.
spec: docs/specs/2026-10-05-approve-and-render.md
---

## Intent

- Problem: Nothing records which versions are final, so a render gate has nothing to check.
- Why: T51's gate and T55's Picker build on the approval record.
- Proposed outcome: I approve or withdraw a version in the editor, the rail shows which are approved on every tab, and a file change outside the editor shows up the same way.
- Affected: server/core (new approval module, watcher, version listing, copyVersion), server/http handler, web api client, App.tsx rail, styles.
- Constraints: R4, R5, R10, R17. Approval only through the HTTP API, no CLI command. Approving changes no other file in the version.
- Out of scope: Picker's Approve and Withdraw buttons (T55); the render gate (T51); footage issues in the warning (they move to core in T51).
- Open questions: None.

## Goal

`approval.json` is written and removed only by two core calls behind the HTTP API, the listing and the rail show it, and the watcher reports any change to it.

## Approach

`server/core/_internal/approval.ts` adds `approveVersion(dir, slug, n)` and `withdrawApproval(dir, slug, n)`. Approve writes `{ approvedBy: "you", at }` through a temp file and a rename. If the file is already there, approve leaves it as it is, so the first `at` stays. It returns `{ approved: true, at, warning? }`. The warning names the version's contract issues (`readVersion(...).issues`). Withdraw deletes the file and leaves `renders/` alone. Both throw `not-found` for an unknown reel or version. `listVersions` adds `approved: boolean`.

The watcher's snapshot gains a set of `reel/n` that have `approval.json`. A difference in that set raises `{ type: 'approval-changed', reel, version, approved }`. The editor's own write raises it too, through the same watcher, so there is one source and no duplicates.

`copyVersion`'s per-version list gains `approval.json`. Without it, a code-only Save of an approved version would make the next version approved too.

The HTTP routes are `PUT /api/reels/<slug>/versions/<n>/approval` to approve and `DELETE` on the same path to withdraw. The client gets `approveVersion` and `withdrawApproval`, plus the event type. On `approval-changed` for the open reel, App bumps the versions tick. The rail row gets a `✓ approved` tag beside the others, as text so the cue doesn't rely on color alone (the mockup shows `v2 ✓`). The rail is shared by every tab, so the mark shows everywhere.

## Steps

1. Tests in `tests/core/approval.test.ts`: approve and withdraw, more than one approved, other files unchanged, `approved` in the listing, the event from an outside write and an outside delete, the warning on a version with issues, and the code-only Save not carrying approval. Plus an HTTP test for the routes and a test that `kinotta` has no approve command.
2. Core module, watcher, listing, copyVersion.
3. HTTP routes, client, event type.
4. Rail tag and style. Extend the e2e `versions.spec.ts`: an approval written on disk shows the rail mark.

## Risks

On the polling fallback (no recursive `fs.watch`), the event can take about a second to arrive. This is acceptable for one mark.

## Checks to run

typecheck, full vitest, Playwright `versions.spec.ts`.

## Changelog

### 2026-10-05
- Plan created, approved and built. Summary: `docs/session-summaries/2026-10-05-approve-and-withdraw-summary.md`.
