# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + TypeScript + Vite in the browser, with a local Node server (grilling decision D10, D11). Server logic stays independent of HTTP and the UI goes through one API client, so Electron can wrap it later.

## Users

One person for now: the owner, who makes motion graphics and footage edits with Claude and reviews every version themselves. Anyone else only sees the rendered MP4. Clients, teammates and other creators are not users yet, so the product needs no onboarding, accounts or sharing.

## Product Purpose

Kinotta is an editor for motion graphics and footage edits that works with or without AI (E1, E20). The owner can drop in a video, cut it, fix its words and move its captions and elements, then save a new version with no agent involved. When they want motion graphics, an agent such as Claude builds a reel inside a project. The owner comments on it in context, pinned to a moment, a spot on the frame and the element under it, and Claude builds the next version from that comment batch. It succeeds when feedback can be given as precisely as "change the color of this", at this second, without being described in prose, and each round lands in a new frozen version.

## Positioning

A comment is pinned to a named element inside the reel, not just to a timestamp and a pixel. This works because every version is an HTML page under the timing contract (ADR 0001): timed scenes, named elements, and a jump to any second. General video review tools cannot resolve a click to an element, and one-shot generators have no review loop.

## Operating Context

- Claude runs inside an existing project (such as a brand repo) and invokes the global Kinotta skill. Reels live in `<project>/reels/`, and the editor opens that folder (ADR 0002).
- A review is its own focused sitting: the editor runs full screen on a large monitor with the terminal hidden. The owner comments, presses "Copy all comments", switches to Claude Code to paste the batch, and returns to the new version. Split screen next to the terminal is not a target for now.
- The loop per reel: Storyboard (every shot built unanimated, plus a shot list), then Review of animated versions, then Picker. Build order follows the same sequence (D7).
- The batch is also saved to `vN/comments.json` (D6).

## Capabilities and Constraints

- Vocabulary is fixed in `CONTEXT.md`: reel, version, storyboard, shot, scene, element, clip, overlay, pin, comment, note, comment batch, approval, taste list, brand file, timing contract. UI copy uses these words and avoids the listed alternatives.
- Versions are frozen. Comments stay on the version they were made on (D1).
- On footage a pin records only a position. On a scene it also records the element (D2).
- One timeline with mixed clips: footage and scenes on V1, overlays on V2 (D3).
- Storyboard: a grid of every shot, where clicking a shot enlarges it for pinning (D8, `docs/mockups/2026-09-30-storyboard-layout.html`, option A). Stills are the live page paused at each shot's time (D9).
- Taste list: global, plus an optional per-project `reels/taste.md`. The editor suggests rules and only the owner adds them (D12).
- Brand file: `reels/brand.md`, written by Claude on first use and checked once by the owner (D14).
- The editor never holds client assets or reels. The editor's own chrome must not compete with the reel being judged, since each reel carries its own client's brand.
- Deferred: audio comments, MP4 render, element library format. Trimming and cutting moved into the Review and Edit phase (E8, E9).
## Brand Commitments

The editor uses the owner's Rubric brand structure (`C:\FIles\projects\Brands\Rubric\DESIGN.md`, `design-elements.html`), with an ice-blue light instead of chrome metal, as decided in `docs/2026-09-30-grilling-decisions.md` (D15 to D22). Motion keeps Rubric's speeds by the owner's choice (D19).

The name: *kino* (film) + Ilonggo *kinot ta* ("let's save"). Film and edit with less of your time.

## Evidence on Hand

- Origin: the RoboNuggets guide *The 3 Levels of AI Motion Graphics* and its transcript. Kinotta is a clean-room build of the storyboard and review loop, not a copy of the RUBRIC tools, with MIT notices wherever code is copied (D4).
- No users, testimonials or metrics exist. Do not invent them.

## Product Principles

1. **The reel is the subject.** The editor frames someone else's work. Neutral dark remains the default, and the owner can theme the whole editor, including the area behind the picture, through Appearance settings (owner decision, 2026-10-08).
2. **Pin, don't describe.** Every feedback affordance should land on a moment and an element, so comments stay short and unambiguous.
3. **Versions are history, not drafts.** Nothing edits a version in place. The UI makes it obvious which frozen version is on screen.
4. **One hand-off, no friction.** Getting a comment batch from the editor to Claude and the next version back is a single, predictable step.
5. **The owner decides; an agent is optional.** The owner can make any mechanical change directly. An agent builds what needs judgement or new motion, suggests taste rules and brand sources, and only the owner confirms them.

## Accessibility & Inclusion

WCAG 2.1 AA: contrast, keyboard access to every control, and reduced motion for the editor's own chrome. The reel under review plays as authored.
