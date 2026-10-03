---
title: Kinotta skill for code-only reels
date: 2026-10-03
status: Done
summary: T9 (#11). The global Kinotta skill, a `kinotta check` command and the install, so Claude can build code-only reels inside a project and consume comment batches.
spec: docs/tickets.md T9 (#11); decisions K1 to K12 in docs/2026-09-30-grilling-decisions.md
---

## Intent

- Problem: The editor works, but nothing tells Claude how to build a reel for it. Inside a project
  like Aroma, Claude has no rules for the timing contract, the folder layout, the brand file, the
  taste lists or how to turn a pasted comment batch into the next version, and no way to check a
  version before saying it is ready.
- Why: T9 is the last piece before a real run. Without the skill, every reel depends on Claude
  guessing the format, and broken versions only show up in the editor.
- Proposed outcome: In any project, Claude follows one skill to write `reels/brand.md` for one check,
  build an unanimated storyboard v1 under the contract, verify it with `kinotta check`, and turn a
  pasted batch into a frozen `v<n+1>` with `answers.md`, leaving `v<n>` untouched.
- Affected: this repo (`server/cli.ts`, a new `skill/kinotta/`, `package.json`, README), the owner's
  skills folders (`~/.agents/skills`, `~/.claude/skills`), `~/.kinotta/taste.md`, and a read-only
  smoke test in `C:\FIles\Projects\Brands\Aroma`.
- Constraints: K1 to K12. ADR 0001 (timing contract) and ADR 0002 (invoked inside projects). The
  check uses the core's public interface only. No writes into Aroma in this run.
- Out of scope: the real Aroma run (owner, K10), animation (K9), footage reels (T16), the
  motion-broll engine (T11), the editor reading `answers.md`.
- Open questions: none (settled in K1 to K12).

## Goal

T9's acceptance criteria met except the real run, which the owner does from the checklist below.

## Approach

`kinotta check` is a subcommand in `server/cli.ts` that opens the project with `openProject` and
prints `readVersion(...).issues`. The skill is a `SKILL.md` with a `reference/contract.md` for the
rules, linking to the fixture reels as format examples. Install is a Node script behind
`npm run install-skill` that creates the junctions.

## Steps

1. `kinotta check <reel> [version]` (K7), test first, against the showreel sample (clean) and the
   broken sample (issues). Default version is the newest.
2. Install (K8): `npm run install-skill` links `~/.agents/skills/kinotta` to `skill/kinotta` and
   `~/.claude/skills/kinotta` to `~/.agents/skills/kinotta` (the owner's existing pattern). README
   "Install" section. Run `npm link` and the script; verify `kinotta check` from Aroma.
3. The skill (K1 to K6, K9, K12): `skill/kinotta/SKILL.md` and `skill/kinotta/reference/contract.md`.
4. Seed `~/.kinotta/taste.md` with the K11 rules.
5. Checks: `npm run typecheck`, `npm test`, `npm run test:e2e`.
6. Owner only: the real run in Aroma (checklist below).

## Owner checklist for the Aroma run (K10)

1. `npm link` and `npm run install-skill` have run in the Kinotta repo (this run did both). In a
   fresh terminal in Aroma, `kinotta check x` answers instead of "command not found".
2. Open Claude in `C:\FIles\Projects\Brands\Aroma` and ask for a 15-second code-only brand intro
   with 5 to 7 shots.
3. Claude writes `reels/brand.md` with `checked: no`, summarises it and stops. Read it, fix it, set
   `checked:` to today's date, and ask again.
4. Claude builds `reels/<slug>/v1` and runs `kinotta check`. Run `kinotta` in Aroma; v1 opens.
5. Pin a few comments, Copy all comments, paste into Claude.
6. Claude builds v2 with `answers.md` and runs `kinotta check`. Confirm v2 shows as ready and that
   v1's files are unchanged (`git status` or compare timestamps).
7. Tick the last T9 criterion in `docs/tickets.md`.

## Risks

- Junctions need no admin rights, but a junction to a junction must resolve; verified by listing
  the skill through `~/.claude/skills/kinotta`.
- The skill's wording decides when it triggers; checked against the owner's other skill descriptions.

## Checks to run

`npm run typecheck`, `npm test`, `npm run test:e2e`, `kinotta check` from Aroma.

## Changelog

### 2026-10-03
- Plan created from the handoff, approved by the owner as a goal run.
- Steps 1 to 5 done (`ab64e0b`, `6f29f76`, `c82f721`, taste list seeded). Step 3 ran before step 2; the
  install also links `~/.claude/skills/kinotta`. Typecheck clean, core 128/128, Playwright 71/71.
  The Aroma run stays with the owner. Summary: `docs/session-summaries/2026-10-03-kinotta-skill-summary.md`.
- Owner ran the Aroma run: a pinned batch on v2 produced v3 with `answers.md`, earlier versions
  unchanged. T9 Done.
