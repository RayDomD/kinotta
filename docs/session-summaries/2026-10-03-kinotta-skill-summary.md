# Kinotta skill: run summary

Date: 2026-10-03. Branch: `feat/storyboard-phase` (local, not pushed). Plan:
`docs/plans/2026-10-03-kinotta-skill.md`. Ticket: T9 (#11). Decisions: K1 to K12.

## Outcome

Steps 1 to 5 of the plan shipped. T9's criteria are met except the real Aroma run (K10), which the
owner does from the checklist in the plan. No subagents were used.

| Step | What shipped | Commit |
|---|---|---|
| 0 | Plan saved, index regenerated | `ac75fc8` |
| 1 | `kinotta check <reel> [version]` in `server/cli.ts`: newest version by default, `2` or `v2` accepted, one issue per line as `message [code]`, exit 1 on any issue, unknown reel or version, or bad usage. Test: `tests/core/check.test.ts` (5 cases on the showreel and broken samples) | `ab64e0b` |
| 3 | `skill/kinotta/SKILL.md` (preflight, brand file, build v1, build from a batch, samples as "contract, not look") and `skill/kinotta/reference/contract.md` (layout, page rules, minimal page, `shots.json`, the 13 check codes) | `6f29f76` |
| 2 | `npm run install-skill` (`scripts/install-skill.mjs`), README "Install" section; `npm link` and the script run on this machine | `c82f721` |
| 4 | `~/.kinotta/taste.md` with the nine K11 rules (outside the repo, not committed) | none |

## Deviations from the plan

- Step 3 ran before step 2, because the junction needs `skill/kinotta` to exist.
- The install script also links `~/.claude/skills/kinotta` to `~/.agents/skills/kinotta`. K8 names
  only the `.agents` link, but Claude Code reads `~/.claude/skills`, and every other linked skill on
  this machine follows that two-link pattern. The skill appeared in Claude Code's skill list right
  after the script ran.
- `kinotta check` reads through the core's public `readVersion`, which settles the newest version
  first (moves unsent comments forward), the same as the editor's first read or the watcher's
  `version-added`. A check on a fresh `v<n+1>` therefore settles it before the owner opens it. That
  matches what the editor would do anyway, so the check was kept on the public interface.

## Facts the skill relies on, found during the run

- The editor serves only files inside a version folder (subfolders included), so the skill tells
  Claude to copy logos, images and fonts into `v<n>/assets/`.
- Pages are rendered at 1920x1080 with `index.html?render`; `seek` may return a promise.

## Checks run

- `npm run typecheck`: clean.
- `npm test`: 128/128 across 13 files (123 before plus the 5 new check tests).
- `npm run test:e2e`: 71/71.
- The reference's minimal page and `shots.json`, extracted from `contract.md`, pass `kinotta check`.
- `npm run install-skill` run twice: links created, then "Already linked". Both junctions verified
  with `Get-Item`, and `SKILL.md` read through `~/.claude/skills/kinotta`.
- From `C:\FIles\Projects\Brands\Aroma`: `kinotta` resolves to the npm shim, `kinotta check` prints
  its usage, `kinotta check brand-intro` says the reel is not found, and no `reels/` folder was
  created.

## The Aroma run (K10)

Done by the owner on 2026-10-03; checked from the files in `C:\FIles\Projects\Brands\Aroma\reels\`.
T9 is Done.

- `brand.md` written, checked by the owner (`checked: 2026-10-03`).
- `brand-intro` v1 (20s, ten shots, longer than K10's guide of about 15s), then v2 from notes given
  in chat (v1's batch held no comments and a stray note, "can we m"), then v3 from a real pinned
  batch on v2: three element pins (`city` on shot 01, `sun` and `moon` on shot 06), each answered
  Done in `v3/answers.md`, with `changedSections: ["reel"]`.
- `kinotta check` passes on v1, v2 and v3. No version holds animation code.
- Frozen versions: no v1 file was written after 6:40 except `comments.json` (Copy, 6:41), and no v2
  file after 6:49 except `comments.json` (Copy, 7:11). No hash snapshot was taken.
- v2 has no `changedSections`; it was built from chat, not a batch.
- Two comments asked for better motion. Claude kept the page still, described the motion in the
  shots, and rendered `output/video/aroma-brand-intro-v3.mp4` with Aroma's own tooling to show it.
  Motion review is the first thing the owner reached for, which points at the Review phase.

## Branch review

`/code-review` since `cbfc858` against T9, with two Sonnet workers (Standards, Spec) and Opus verifying.
No hard violations. Fixed in `6d96628`: the batch path now checks `checked: no` (K3); the skill covers
word pins and the contract issues a batch can carry; `contract.md` says the editor doesn't read
`window.DURATION` yet and gives the 500ms draw fallback; the check usage text has one source. Left as
is: `install-skill.mjs` goes beyond K8's documented junction (kept, documented in the README).
After the fixes: typecheck clean, core 128/128. The owner's run guide is
`docs/explainers/2026-10-03-kinotta-aroma-run.html` (`8940501`).
