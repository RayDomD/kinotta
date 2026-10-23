---
title: Media import, media lanes and resizable pictures
date: 2026-10-23
status: Draft
summary: One way to bring files into Kinotta, every media kind (videos, pictures, sound, generated motion graphics) on the timeline's tracks, and every picture resizable in the frame.
spec:
---

## Intent

- Problem: Media comes into Kinotta along several separate paths that each work differently:
  - The New reel drop zone (`web/src/DropZone.tsx`) takes videos or a whole folder, but only videos (`accept="video/*,…"`). It copies them into `footage/` and starts a reel from them.
  - The media library (`server/core/_internal/media-library.ts`) already imports videos, pictures (`.png .jpg .jpeg .webp .gif`) and audio, and places them on tracks.
  - Generated motion graphics (agent-built b-roll clips) are pages the engine renders. They are not media sources on a picture track. You move and scale their elements through plan offsets (`2026-10-05-move-scale-elements`), not as one picture in the frame.
  As a result, you can't start a reel from a folder of mixed shots and pictures. Motion graphics don't sit on a track the way a video or picture does. And it isn't clear which kinds of media can be resized in the frame.
- Why: Simple mode and open sourcing need one predictable answer to "how do I get my stuff in and arrange it." A creator with a folder of shots, stills and a logo should be able to drop it in and lay it out.
- Proposed outcome:
  - One import path: drop or pick files or a folder (videos, pictures, audio) from New reel, simple mode or the editor. Everything lands in the project the same way and shows up in the media library.
  - Starting a reel from a folder puts its shots on the main picture sequence in a defined order.
  - Every media kind sits on a track: videos, pictures, generated motion graphics and sound. Each can be selected, dragged and trimmed like any other clip.
  - Every picture in the frame can be moved and resized, imported or generated. That covers videos, stills and motion-graphic clips as a whole.
- Affected: `web/src/DropZone.tsx`, `web/src/SimpleMode.tsx`, `web/src/review/_internal` (`MediaEditor.tsx`, `PictureLayers.tsx`, `NativeLanes.tsx`, `ClipSettings.tsx`), `web/src/api/_internal/client.ts`, `server/core/_internal` (`import.ts`, `media-library.ts`, `media-model.ts`, `start.ts`, `parts*.ts`, `media-render.ts`), `server/http/_internal/handler.ts`, the engine compositor (`skill/kinotta/engine/**`), `skill/kinotta`, `CONTEXT.md`, core and e2e tests.
- Constraints:
  - Saved edit lists replay to the same result (ADR 0003). Old reels and versions open unchanged.
  - Free layout's `layer` stays the source of front-to-back order. Picture regions keep their existing shape (`region` in `media-model.ts`).
  - Imported files are content-hashed and deduplicated, as `import.ts` and `media-library.ts` do today.
  - Kinotta starts processes only through `runner.ts`.
  - Preserve the animated revisions and the Review fix that loads the chosen Working revision.
  - Check redistribution rights for any new dependency (open-source intent).
- Out of scope: Recording, color grading, rotation, keyframed motion of a region over time, and moving single elements inside a motion-graphic clip (the existing offset editing stays as it is).
- Open questions (to answer one at a time):
  - O1: When a reel starts from a folder, how are the shots ordered? File name, date taken, or the agent's choice from a short brief?
  - O2: Does a generated motion-graphic clip become a real media source on a picture track (rendered to a video or kept as a live page), or a track item that points at its part?
  - O3: When a picture is resized, does it crop to the new box or fit inside it (letterbox)? The model already has `framing.mode` `crop` / `fit`, so which one is the default?
  - O4: Do pictures and audio files in a dropped folder go into `footage/` alongside the videos, or into a separate media folder?
  - O5: Should this land before or after simple mode's Regenerate flow (`2026-10-20-simple-mode-flow`), which is still In Progress?

## Goal

## Approach

## Steps

## Risks

## Checks to run

## Changelog

### 2026-10-23
- Plan created with Intent only.
