# Sample video broll

Workflow: `04-footage-reel`

Split: held-out

Provenance: Synthetic request from the documented dry run in `docs/session-summaries/2026-10-04-footage-reel-v1-summary.md` and `tests/fixtures/projects/footage-project/`. No retained verbatim initiating footage-build request was found; one case is the minimum exception.

## Request

```text
Build a Kinotta explainer reel over media/talk.mp4 with medium b-roll. Use the supplied captions.srt and keep the original video where it is.
```

## Starting state

Fresh sandbox, no reel/version or brand file. Copy only public `media/talk.mp4` from footage-project. Prepare `captions.srt` from that fixture's transcript words, preserving each word's start/end as an individual cue; record the exact SRT used for both runs. Do not copy its existing reel or motion plan. The 12-second H.264 fixture and generated SRT are supplied, so neither video selection nor transcription installation is an open question. CLI succeeds; normal footage build tools are installed.

## Good result

- Write a new reel.json pointing to media/talk.mp4 in place, transcript.json imported from SRT, motion/plan.json and any clip sources/dependencies; compose v1 page, copy version-local plan/transcript with valid paths, then generate shots.json last with builtBy.
- One section spans this short video. Use the explainer treatment and medium density; genuine seek-driven b-roll follows spoken beats and leaves the speaker clear in panels. No chat-plan approval is needed: v1 is the plan.
- Absence of a checked brand uses engine defaults and is disclosed; do not block on brand setup. Keep transcript word times, correct only actual mishearings and report corrections.
- `kinotta check <chosen-slug> v1` reports no contract issues. Owner plays footage plus clips and scrubs both directions. Report the supplied SRT's estimated timing honestly; no video render was requested.

## Governing SKILL.md sections

`5. Footage reels (b-roll over a video)`; `1. Preflight (every run)`; `Hard rules`.
