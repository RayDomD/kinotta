---
title: Split the Kinotta skill into a router and one contract per step
date: 2026-10-27
status: Draft
summary: SKILL.md becomes a short router; each step an agent runs (first build, next version, storyboard, footage section) gets its own contract file, so a job reads only what its step needs.
spec:
---

## Intent

- Problem: `skill/kinotta/SKILL.md` is 535 lines covering every path: the unattended first build, comment batches, code-only storyboards, footage reels, parts, preflight and the brand file. Every agent job reads all of it. The unattended b-roll job needs about 45 lines of it plus the hard rules and the reference files. A rule for one step (for example, the transcript rule changed on 2026-10-27) sits next to rules for steps that don't apply, and the manual run of 2026-10-27 showed that a single misread rule costs a 19-minute run.
- Why: the owner wants the reel process laid out as numbered steps with explicit inputs, outputs and checks (ICM), so an agent picks up any step cold and the owner can see where a reel is.
- Proposed outcome: an agent working on one step reads the router plus that step's contract and the reference files the contract names, and nothing else. The behaviour of every path stays the same.
- Affected: `skill/kinotta/SKILL.md`, new `skill/kinotta/stages/*.md`, prompts in `server/core/_internal/requests.ts` that name skill sections, skill tests in `tests/core` that read the skill text, `CONTEXT.md` if it names skill sections.
- Constraints: the reel folder layout (`reels/<slug>/v<n>/`, `.agent/jobs/<id>/input|output`) does not change; the server owns it. The skill is copied into each job's `skill/` folder, so stage files must live inside `skill/kinotta/`. No rule is dropped or reworded in meaning; this is a move, not a rewrite. The skill's frontmatter description keeps triggering the same requests.
- Out of scope: changing what any step does; the engine, templates and scripts; the interactive `kinotta` CLI; the motion-graphic craft guidance (separate memory item).
- Open questions: (1) Do hard rules stay in the router (read by every step) or move to `reference/hard-rules.md` linked from each contract? Default: stay in the router, since every step needs them.

## Goal

`SKILL.md` is under about 80 lines: what Kinotta is, a "which step am I on?" table, the hard rules and pointers. Each step's procedure lives in `stages/NN-<step>.md` with inputs, process, outputs and the owner's check. The unattended b-roll prompt points at `stages/02-first-build.md`.

## Approach

The reel steps, as the owner described them on 2026-10-27:

| # | Step | Who | Contract |
|---|---|---|---|
| 01 | Transcribe | Kinotta (faster-whisper) | none (server code) |
| 02 | First build: b-roll, transcript word fixes, cuts | agent, unattended, from Auto | `stages/02-first-build.md` (today's "Unattended add b-roll") |
| 03 | Review | owner, in Kinotta | none |
| 04 | Next version from a pasted comment batch | agent, interactive | `stages/04-next-version.md` (today's §4 and §6, plus Parts batches and Small changes to Working) |

Interactive paths that start a reel without Auto get their own contracts: `stages/new-reel.md` (§1 preflight, §2 brand file, §3 storyboard v1, Direction before building) and `stages/footage-reel.md` (§5).

```text
skill/kinotta/
├── SKILL.md            # router: identity, step table, hard rules, pointers
├── stages/
│   ├── 02-first-build.md
│   ├── 04-next-version.md
│   ├── new-reel.md
│   └── footage-reel.md
├── reference/  templates/  engine/  scripts/  assets/  examples/   # unchanged
```

## Steps

1. Map every heading and paragraph of SKILL.md to its new home in a table (old line range → file). Mark the lines shared by several steps; those stay in the router or move to `reference/`.
2. Move the text verbatim into the stage files. Add a short header to each: reads, does, writes, owner's check.
3. Rewrite SKILL.md as the router. Update `requests.ts` prompt wording that names "Unattended add b-roll" and any tests that grep skill text.
4. Diff check: every non-blank line of the old SKILL.md appears in exactly one new file, except the router glue (a script prints the leftovers).
5. Run a real Auto build on a scratch project with Claude Code (owner approves the quota) and compare it with the 2026-10-27 run.

## Risks

- The agent misses a rule it used to see. Mitigation: step 4's line-coverage check, and hard rules stay in the router.
- Skill triggering changes. Mitigation: the frontmatter description is untouched.

## Checks to run

- `npm run typecheck`, `npm run check:docs`, unit tests that read the skill or prompt.
- The step 4 coverage script with no leftover lines.
- One real Auto build reaching v2.

## Changelog

### 2026-10-27
- Plan created from the owner's request to ICM the reel process. Lane-side runs were restructured the same day under `.herdr/runs/` (local, not in the repo).
