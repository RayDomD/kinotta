---
title: launch-video-script
date: 2026-10-31
status: Draft
summary: Script for the Kinotta launch video, made in Kinotta, opening on a RayDom talking-head before and after.
spec: docs/explainers/2026-10-31-launch-video-script.html
---

## Intent

- Problem: Kinotta has no launch video, and the pitch (your footage and brand in, a finished reel out, changed by pinning) is hard to explain in text.
- Why: The video is the first thing a creator sees, and it can show Opus-built motion graphics at high output.
- Proposed outcome: A music-driven vertical video of about 70s (16:9 cut after) that is itself made in Kinotta, with the only spoken line near the end.
- Affected: RayDom project folder (footage, brand), the Kinotta skill (3D style), `docs/explainers/2026-10-31-launch-video-script.html`.
- Constraints: Promise only what renders today. Test before filming. RayDom forms stay CSS and SVG, so the 3D shot uses a non-RayDom demo reel.
- Out of scope: Render queue, draft render, approve and withdraw, render segments, merge queue and lanes. A longer YouTube walkthrough is a later cut.
- Open questions: Which raw talking-head file is the hook's "before" (RayDom/footage: `shot 2 .mp4`, the DJI Mimo clip; `socsci-6-final.mp4` is the finished "after"). Where the vlog, short and tutorial reels come from. Whether to say "open source" on the end card. Whether the "inspiration edit" feature gets built before launch.

## Goal

Lock the beat structure, then storyboard each beat in Kinotta.

## Approach

Music-driven, little voiceover, on-screen type. Every graphic is something Claude built from a prompt; a small "built by Claude in one pass" tag may appear on a few.

| # | Time | Picture | Type / sound | Status |
|---|---|---|---|---|
| Hook | 0-8s | Raw take plays flat. RayDom folder drops on Kinotta, brand fills in. Hard cut to the same take finished: captions (a wrong word is fixed in this shot), clay pieces, a cutaway. | "One take." "Your brand." Beat drops on the cut. | Needs the footage built |
| 2 | 8-22s | Hover outlines a named element, click lands a hex pin, type "bigger", next version changes only that. | "Pin the thing." | Exists |
| 3 | 22-32s | Drag a motion template onto a shot; it builds instantly in the brand. A second one builds with a different look. | "Drag. It's yours." Snap on drop. | Exists (instant pins) |
| New | 32-40s | Version compare: slide between v1 and v6. | | Plan exists (2026-10-13-version-compare); confirm it runs |
| 4 | 40-48s | One shot card cycles three alternates with playback; chip "3 options, #2 in the reel"; apply one. | "Don't like it? Flip." | Not built (pending owner decision in AGENTS.md); cut if unfinished |
| 5 | 48-60s | Four 2.5s cuts: talking head, vlog, 9:16 short, 3D product shot. | "Talking heads. Vlogs. Shorts. 3D." | Mostly real; test 3D and vlog |
| 6 | 60-66s | Sound lane fills, export picker shows 1080p with 4K option, render bar completes. | "Sound. Captions. 4K." | Exists |
| Close | 66-70s | Kinotta storyboard showing this video's own shots; optional line "Runs in your project. Files stay yours." | One spoken line: "I made this in Kinotta." | True only if built that way |

Length will grow past 70s with the version-compare beat; trim beat 5 or 3 to fit.

Other candidates for a longer cut: span-pins, taste list, auto-direct and Direction step, sound sourcing, simple mode, pin on playing footage.

## Steps

1. Pick the raw take and the three extra reels.
2. Confirm the hook can be built from the raw take in Kinotta (captions, word fix, clay pieces, cutaway).
3. Test the filmed-3d style and the vlog reel render.
4. Build the launch video as a reel in Kinotta and film the closing storyboard shot from it.
5. Cut the 16:9 version, then a 30s social cut (beats Hook, 2, 3, Close).

## Risks

- Inline alternates is not built; the beat may be cut.
- The word-fix and version-compare flows are planned but not confirmed in the editor.
- 3D is unseen in render; may not look good enough.
- The closing claim is false unless the video is really built in Kinotta.

## Checks to run

- Render the hook's "after" from the raw take.
- Fix a caption word in the editor and confirm timing follows.
- Render a filmed-3d demo reel.
- Open version compare on a reel with several versions.

## Changelog

### 2026-10-31
- Plan created from the draft script. Folded in version compare as a new beat and the word fix into the hook's finished shot.
