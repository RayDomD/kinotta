# No design language

Workflow: `00-brand-setup`

Split: held-out

Provenance: Synthetic. No verbatim brand-setup request was retained in the inspected reels, e2e fixtures or session summaries. The local `reels/brand.md` proves a checked brand existed, not the initiating request. One case is the minimum exception for this workflow; D8/D9 of `docs/plans/2026-10-21-layered-taste.md` supplies the acceptance decision.

## Request

```text
Set up the brand for a Kinotta reel in this project.
```

## Starting state

Empty sandbox project, no reel/version, no `DESIGN.md`, no `reels/brand.md`. Supply only a public logo at `Assets/logo.svg` and `tests/fixtures/projects/footage-project/media/talk.mp4` as sample footage. CLI preflight succeeds. Scripted owner replies: to the design-language question, "No"; to an actual proposed palette and type pairing, "Use that." Do not pre-answer a proposal that has not been shown.

## Good result

- Ask "Do you have a design language?" before proceeding without `DESIGN.md`.
- After "No", propose concrete colours and type based on the supplied logo/footage; obtain the owner's confirmation, then save `DESIGN.md`.
- Create `reels/brand.md` pointing to the confirmed sources without duplicating sourced values; complete its owner check before dating `checked:`.
- Build no reel in this setup-only request. `kinotta check <slug>` is not applicable; no slug/version exists. Judge the saved design and approval sequence, not an invented build result.
- Current baseline is expected to miss D8/D9. This eval records that gap; it does not authorize changing the skill now.

## Governing SKILL.md sections

`2. Brand file (before any build)`; `1. Preflight (every run)`. D8/D9 are approved future behavior, absent from the current section.
