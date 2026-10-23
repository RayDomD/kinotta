---
title: Pin comments to sounds
date: 2026-10-23
status: Draft
summary: Pin a review comment to a specific audio clip on the timeline, so the batch names the exact sound and Claude changes that one.
spec:
---

## Intent

- Problem: Review pins attach only to the picture (a frame position or an element) and to caption words. A comment about a sound is placed by time, so when a whoosh, an effect and the music bed overlap, the batch says only `Shot 03, 06.00s, position 40% 62%` and the agent guesses which sound is meant from the wording. The server already accepts a pin tied to any placement (`input.pin.placement` in `buildPin`, `server/core/_internal/comments.ts`), but the editor never offers it for audio clips and the batch line never names the clip.
- Why: Sound is now generated per reel (`2026-10-23-synth-score-and-effects.md`), and the owner wants to refine individual sounds by commenting on them.
- Proposed outcome:
  - In Review, with the pin tool on, clicking an audio clip on the timeline drops a pin on that clip at the clicked time.
  - The pin shows on the clip and in the comments list, and follows the clip if it is moved or trimmed in Working.
  - The batch line names the clip, its track and its source, for example `03, 06.00s, sound "whoosh" on Sound effects (hit-02)`.
  - The skill's "Sound requests in comments" section answers a sound pin by editing that placement only.
- Affected: `web/src/review/_internal/NativeLanes.tsx` (audio clip click with the pin tool), `web/src/review/_internal/MediaEditor.tsx` (pin draft and save), `web/src/CommentsPanel.tsx`, `server/core/_internal/comments.ts`, `server/core/_internal/batch.ts`, `server/core/_internal/types.ts`, `skill/kinotta/reference/sound.md`, core and e2e tests for pins and batches.
- Constraints:
  - Existing frame and word pins, saved comments and batches read exactly as today.
  - Saved edit lists replay to the same result (ADR 0003).
  - A pin on a clip that is later removed keeps its time and shows as removed, as other pins do.
  - Pins are available only where pins are today: Review, not playing, editable.
- Out of scope: Pins on video or picture clips on the timeline, waveform-region comments (a span inside a clip), and voiceover word pins (already covered by word pins).
- Open questions (one at a time):
  - O1: When several audio clips overlap under the click on the same track row, which one gets the pin: the topmost drawn, or a small chooser?

## Goal

1. Clicking an audio clip with the pin tool saves a comment tied to that placement.
2. The batch names that clip, and the agent's answer changes only that placement.
3. Old comments and batches are unchanged.

## Approach

Reuse the existing pin path: the editor sends a frame-kind pin with `placement` set to the audio clip's id, which `buildPin` already honours, plus a small `target: 'sound'` marker so the batch knows to describe the clip rather than a frame position. `batch.ts` gains one branch that writes the clip's label, track name and placement id. The skill reads that id and edits the named placement with `placement-change` or `placement-replace`.

## Steps

1. Answer O1.
2. Core tests (red): a sound pin saves with its placement, survives a clip move in Working, and renders in the batch with clip, track and id; an old frame pin's batch line is unchanged.
3. Server: accept and store the sound marker; write the batch line.
4. Editor: pin tool on audio clips in `NativeLanes`, pin markers on clips, comments list label.
5. Skill: `sound.md` answers a sound pin by its placement id.
6. E2e: on the real Review screen, pin a comment on a synthesized hit, copy the batch, check the line names that clip.

## Risks

- Audio clips are small at wide zoom, so clicks may miss. Keep the existing hit area rules for clips.
- A pinned clip replaced by `placement-replace` gets a new id; decide in step 3 whether the pin follows the replacement.

## Checks to run

- Core pin and batch suites, including the new tests.
- The e2e from step 6.
- Typecheck and production build.

## Changelog

### 2026-10-23
- Plan created at the owner's request, for finer sound refinement through comments.
