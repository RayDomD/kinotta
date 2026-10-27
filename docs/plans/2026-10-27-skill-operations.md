---
title: Named operations in the Kinotta skill
date: 2026-10-27
status: Approved
summary: The skill gains setup, direction, alternates, sound, check and edit as named steps, so a project can be set up from the agent and a one-off job reads only its own contract.
spec:
---

## Intent

- Problem: A new project folder (a brand folder, a vlog folder) gets its brand file only partway through a first code-built reel (`stages/new-reel.md`, section 2), and there is no way to start a project from another project's brand. Jobs the owner asks for on their own (pick a look, make alternates, add sound, check a reel, a small Working change) sit inside larger contracts or references: alternates in the 163-line `04-next-version.md`, the direction interview in both `new-reel.md` and `reference/motion-broll.md`, and "Small changes to Working" in both `04-next-version.md` and `reference/native-media.md`.
- Why: Kinotta is agent first (`PRODUCT.md`, 2026-10-27). The owner wants to invoke Kinotta in any folder and set it up from the agent (`/kinotta setup`), the way impeccable exposes operations, and an agent should read only the step it is on (continues `2026-10-27-skill-stages.md`).
- Proposed outcome: `/kinotta <operation>` or the plain-language request routes to one contract each for setup, direction, alternates, sound, check and edit. Every existing path keeps its rules.
- Affected: `skill/kinotta/SKILL.md` (step table, frontmatter description), new `skill/kinotta/stages/00-setup.md`, `direction.md`, `alternates.md`, `sound.md`, `check.md`, `edit.md`; `stages/new-reel.md`, `stages/04-next-version.md`, `stages/footage-reel.md`, `reference/motion-broll.md`, `reference/native-media.md`; skill tests in `tests/core` and `tests/engine` that read skill text; `README.md` usage lines.
- Constraints: Moves keep wording (the coverage check in `scripts/check-skill-coverage.mjs` proves it); new text only where marked new below. The Auto prompt path (`skill/SKILL.md` + `skill/stages/02-first-build.md`, `server/core/_internal/requests.ts:71`) and the `Kinotta comments:` / `Rebuild:` hand-off routing do not change. `reference/sound.md` and `stages/02-first-build.md` are not edited, because the Approved `2026-10-27-sound-in-auto.md` plan edits them. The brand file stays inside the project (`server/core/_internal/brand-fonts.ts:28`), so a borrowed brand is copied, never linked. The agent never writes `reels/.kinotta/<slug>/style.json`; the Direction screen owns it.
- Out of scope: app buttons for these operations; opening a folder by drag and drop or right-click; per-reel brand overrides; splitting `04-next-version.md` by reel type; a `render` operation (`kinotta render` already is one).
- Open questions: none. Decided with the plan: `edit` is included because it removes a duplicate; the frontmatter description adds "set up a Kinotta project" so setup triggers in plain words.

## Goal

`SKILL.md`'s step table lists six operations, each with its own contract opening with Reads / Does / Writes / Owner's check. `/kinotta setup` in an empty folder ends with a checked `reels/brand.md`, from the folder's `DESIGN.md`, a copy of another project's brand, the owner's typed answers, or the built-in brand.

## Approach

```text
skill/kinotta/stages/
├── 00-setup.md      # new: install check + brand file (moved from new-reel.md §2) + copy from another project (new)
├── direction.md     # moved: "Direction before building" (new-reel.md) + Interview and choice sheets (motion-broll.md §2)
├── alternates.md    # moved: "Parts batches and alternates" (04) + pointer to Converting a single-page reel to parts (contract.md)
├── sound.md         # new, short: routes to reference/sound.md and native-media.md "Author a track mix"; no text moved
├── check.md         # moved: Check stills (motion-broll.md §6) + readability rule (new-reel.md) + kinotta check
├── edit.md          # moved: "Small changes to Working", one copy from 04 and native-media.md merged
├── 02-first-build.md  04-next-version.md  new-reel.md  footage-reel.md   # keep; moved text leaves a one-line pointer
```

Setup's new behaviour:

1. Run `kinotta check` with no arguments (the existing preflight step 1).
2. If `reels/brand.md` exists, report it and stop unless the owner wants to redo it.
3. Offer four choices in one question: use the `DESIGN.md` and brand files found here; copy the brand from another Kinotta project (ask its path, copy its `DESIGN.md` and the in-project files its `reels/brand.md` points at into this project, keep their relative paths, and record the source folder in the brand file); type colours and typefaces (the existing "Answers" path); or the built-in brand.
4. Write `reels/brand.md` in the existing shape, show the summary, and set `checked:` to today's date once the owner confirms.

The footage contract's "say so in the hand-over" line for a missing brand file adds "run `/kinotta setup` to set one". The unattended first build stays on engine defaults when no brand file exists (already in `02-first-build.md`).

## Steps

1. Map each moved paragraph to its new file (old file and line range → new file).
2. Write the six contracts; leave a one-line pointer where text left.
3. Update the step table and the frontmatter description in `SKILL.md`, and the README usage lines.
4. Run the coverage check on each changed source file against the new set.
5. Update skill-text tests that grep moved headings.
6. Manual check with Claude Code in two scratch folders: folder A with a `DESIGN.md` and a logo, folder B empty. `/kinotta setup` in A uses A's design; in B, choosing "copy from another project" with A's path copies A's brand. Both end with a checked brand file and `kinotta check` passing.

## Risks

- An agent misses a rule that moved. Mitigation: coverage check, pointers left in place, hard rules stay in the router.
- Plain requests stop reaching the right step. Mitigation: the router table keeps the request wording beside each operation; the description change only adds words.
- Merge conflict with sound-in-auto. Mitigation: neither `reference/sound.md` nor `02-first-build.md` is touched.

## Checks to run

- `npm run typecheck`, `npm run check:docs`, unit tests that read skill text (`tests/core/agent-jobs.test.ts`, `tests/engine/sound-skill.test.ts`, `tests/engine/native-media-skill.test.ts`).
- `node scripts/check-skill-coverage.mjs <old file> skill/kinotta` for each file text moved out of, no leftovers.
- The two-folder setup run in step 6.

## Changelog

### 2026-10-27
- Plan created from the owner's request to give the skill named operations, starting with setup, and to send it to the lanes. Approved with that request.
