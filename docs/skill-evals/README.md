# Kinotta skill evals

These are 14 test requests for the Kinotta skill, each with a starting state and a description of a good result. They were written on 2026-10-21 against the older single-file skill and the workflows split that was never merged. Today's skill routes to the stage files below. The "Workflow" and "Governing SKILL.md sections" lines inside each case name the old structure; read them as the matching stage.

| Case folder | Today's stage (matched by reading, not yet re-run) |
|---|---|
| `00-brand-setup` | `skill/kinotta/stages/00-setup.md` |
| `01-new-reel` | `skill/kinotta/stages/new-reel.md` |
| `02-comment-batch` | `skill/kinotta/stages/04-next-version.md` |
| `03-small-edits` | `skill/kinotta/stages/edit.md` |
| `04-footage-reel` | `skill/kinotta/stages/footage-reel.md` |
| `05-footage-batch` | `skill/kinotta/stages/04-next-version.md` (section 6, footage batches) |

The cases were graded only by reading the skill ("reasoning-only"); no reel was built. The old baseline and rerun tables cite line numbers of the retired skill file and are not kept. Re-baseline against today's skill before using these to accept a change. Everything else from that branch is tagged `archive/skill-workflows`.

## Corpus and limits

14 cases: brand setup 1, new reel 3, comment batch 4, small edits 1, footage reel 1, footage batch 4. Exactly one per workflow is held-out. Brand setup, small edits and fresh footage build have no retained verbatim initiating request in the inspected material; each has the minimum one synthetic case rather than three invented histories. Other synthetic/fixture variants are labelled individually. Verbatim blocks preserve spelling and punctuation of the retained request fragment. A quoted fragment is not represented as a complete historical clipboard export.

Sources inspected: primary-checkout `reels/kinotta-showcase/v*/comments.json` and `answers.md`, the local brand file (not copied), `tests/e2e/brief-reel.spec.ts`, `batch.spec.ts`, `working.spec.ts`, `alternates.spec.ts`, `section-batches.spec.ts`, public project fixtures and parts helpers, and session summaries for the skill, footage v1, section batches, native media and alternates. Other primary-checkout reel directories include audits/demos, not retained initiating prompts. No private project named in session summaries is used. Public fixture colours/copy establish contract structure, not the intended look.

## Old versus new, fresh sessions

1. Freeze the skill revisions to compare and record both commit ids and SKILL.md hashes. Use development cases while revising instructions; keep held-out requests, acceptance criteria and baseline rows out of the authoring session. Select them only after the candidate skill is fixed. The baseline author has necessarily seen them; this is a future authoring/evaluation split, not a claim of blind baseline scoring.
2. In a new disposable project outside production reels, prepare only the case's starting files. Hash frozen versions and record exact fixture edits, brand/taste substitutions, CLI version and tools. The owner-archive paths refer to the primary checkout; those reels are local/untracked, not downloadable fixtures. If unavailable, mark those cases blocked by missing input. Do not replace them with imaginary passing material. Public fixtures are repo-relative.
3. Start a fresh agent session for each candidate and case, with only that candidate's SKILL.md and its referenced resources available. Prevent an installed competing Kinotta skill from being loaded. Give the Request and Starting state, including saved batch/context where specified. Keep Good result and any baseline table with the evaluator, not in the task prompt. No previous answers, later reel versions, sibling cases or candidate reasoning cross sessions. Use identical model/effort, inputs, supplied owner replies and tool permissions; record them. If a new material question is needed, record its answer and replay the same answer fairly.
4. For a reasoning-only comparison, ask for the governing route, next actions, files/identities retained or written, stop conditions and proposed verification. Grade instruction coverage only. Do not call it a build pass. This brief used only that method; no builds, kinotta checks or UI playback were run.
5. When later authorizing behavioral runs, give each candidate its own identical sandbox. Run only the selected workflow, never on the source reels. Record commands/exit codes, output paths and frozen-input hashes. Run the case's `kinotta check` on the explicit produced version; distinguish a clean frozen check from Working state and source parity. Expected stops and brand-only setup have no new-version check. Preserve failure/refusal evidence instead of retrying into a different task.
6. Owner scores the case's visible behavior in the named surface: playback/scrub for motion, Working plus Edits/Undo for mechanical edits, and the setup conversation/files for brand. The owner opens Kinotta. Record file/contract observations separately from visual judgement. Asset success never proves editor interaction implementation. Compare old/new on each criterion as covered/partial/gap for reasoning or pass/fail/blocked/not-run for execution, with evidence. Record approved behavior changes (notably D8/D9) separately from regressions.

## Cases

| Workflow | Cases | Held-out |
|---|---:|---|
| `00-brand-setup` | 1 | [01-no-design-language](00-brand-setup/01-no-design-language.md) |
| `01-new-reel` | 3 | [03-three-animated-parts](01-new-reel/03-three-animated-parts.md) |
| `02-comment-batch` | 4 | [03-distinct-pictures](02-comment-batch/03-distinct-pictures.md) |
| `03-small-edits` | 1 | [01-move-cube-working](03-small-edits/01-move-cube-working.md) |
| `04-footage-reel` | 1 | [01-sample-video-broll](04-footage-reel/01-sample-video-broll.md) |
| `05-footage-batch` | 4 | [04-source-drift-stop](05-footage-batch/04-source-drift-stop.md) |
