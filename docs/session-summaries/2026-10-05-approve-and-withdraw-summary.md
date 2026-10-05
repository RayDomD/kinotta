# Approve and withdraw a version: summary

Date: 2026-10-05. Ticket T48 (#52). Plan: `docs/plans/2026-10-05-approve-and-withdraw.md`.

## Shipped vs planned

Shipped as planned. `server/core/_internal/approval.ts` adds `approveVersion` and `withdrawApproval` on `Project`. Approve
writes `v<n>/approval.json` (`{ approvedBy: "you", at }`) atomically under the reel lock, keeps the first `at` when
approved again, and returns a `warning` naming any contract issues. Withdraw deletes the file and leaves `renders/`
alone. `listVersions` carries `approved`. The watcher tracks `approval.json` per version and raises
`approval-changed { reel, version, approved }` for the editor's writes and outside ones alike. `PUT` and `DELETE` on
`/api/reels/<reel>/versions/<n>/approval` are the only way in; `kinotta approve` stays an unknown command. The web client
has `approveVersion` and `withdrawApproval`; the rail shows a `✓ approved` tag on every tab and refreshes on the event.

## Deviations

- `copyVersion` now skips `approval.json`, found while reading: a code-only Save would otherwise have approved the next
  version too. Covered by a test.
- The warning lists only the version's own contract issues. Footage issues join it when T51 moves `footageIssues` into core.
- `APPROVAL_FILE` lives in `version.ts` so the listing can read it without an import cycle through `edit-list.ts`.
- The per-diff review ran inline (no sub-agents, by the owner's choice for this run).

## Checks

- typecheck: clean.
- vitest: 38 files, 364 passed, 1 skipped. `tests/core/approval.test.ts` adds 11.
- Playwright: `versions.spec.ts` 5 passed, with a new rail-mark test. Full suite: 96 passed, 2 failed, 4 did not run.
  The two failures (`brief-reel.spec.ts:58`, `snip-save.spec.ts:198`) pass when rerun alone, with and without this
  change, so they are load flakiness rather than a regression.
