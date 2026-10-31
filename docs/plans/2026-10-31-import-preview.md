---
title: Show what an import will do
date: 2026-10-31
status: Done
summary: Before files come in, one sheet lists where each one goes, what is reused or converted, and whether the disk has room; nothing is copied until Import.
spec: docs/plans/2026-10-23-media-import-and-lanes.md
---

## Intent

- Problem: Dropping files starts the import at once. Today (`server/core/_internal/import.ts`,
  `importVideo`) each file is streamed into `footage/`, renamed `talk-2.mp4` when the name is taken, reused
  when a file with the same content is already there, and given an H.264 playback copy when it is HEVC or ProRes.
  Proxies and audio files follow (`media-library.ts`). None of this is shown before it happens, and nothing
  checks free disk space (no `statfs` anywhere in `server/core`). A long 4K drop can fill the disk halfway.
- Why: Voogle Sort's FAQ (voogle.app/sort/faq, read 2026-10-31) shows what will move and checks there is
  enough space before anything moves. Kinotta copies rather than moves, which is safer, but the owner still
  can't see it.
- Proposed outcome: After a drop or file pick, a sheet lists each file: its name in `footage/` (renamed or
  not), "already in the project" when known, "a playback copy will be made" when it may need one,
  "not supported" for formats Kinotta refuses, the total to copy, and the free space. Import starts it.
  Cancel leaves everything as it was. With too little room, Import is disabled and the sheet says how much is
  missing.
- Affected: `web/src/DropZone.tsx` (New reel), the media import in `web/src/review/_internal/MediaEditor.tsx`,
  `web/src/api`, `server/http/_internal/handler.ts`, `server/core/_internal/import.ts` and
  `media-library.ts` (a read-only preflight).
- Constraints:
  - The preview changes nothing on disk and does not change Working. Import then behaves exactly as today.
  - Originals are never moved or changed; the sheet says "copied".
  - Build on the single import path planned in `2026-10-23-media-import-and-lanes.md`, not a second one.
  - Server core has no HTTP (PRODUCT.md, Stack). Copy uses `CONTEXT.md` words (source, footage).
  - The editor's chrome stays quiet (DESIGN.md). WCAG 2.1 AA for the sheet.
- Out of scope: Choosing a different destination folder or drive; moving files between drives; resumable
  imports after a server restart.
- Open questions:
  1. For one small file, should the sheet still appear, or only above a size or count (for example over 1 GB
     or more than one file)?

## Goal

`POST /api/import/preflight` with `[{ name, size, type }]` returns each file's destination name, status
(`new`, `same-name` with the new name, `maybe-duplicate`, `needs-playback-copy`, `unsupported`), the bytes to
write including an estimate for copies, and the free bytes on the project's volume. Both drop surfaces show the
sheet from it.

## Approach

- **What the browser knows first:** name, size and MIME type. Content hash and codec aren't known until the
  bytes arrive, so:
  - Duplicates: a file already in `footage/` with the same size is `maybe-duplicate`. It is confirmed and reused
    during the import, as today.
  - Playback copy: `.mov`, `.mp4` and `.m4v` files *may* need one. The exact answer comes once the file is
    probed. The estimate adds a proxy size (bitrate × duration is unknown, so use a fraction of the source
    size, stated as an estimate).
- **Free space:** `fs.statfs` on the project directory (Node 18.15+, within the Node 20 floor). Require the
  estimate plus a margin.
- **During the import:** if the disk fills anyway (`ENOSPC`), stop, delete the partial file (already the
  pattern in `writeHashed`), and say which files came in and which didn't.

## Steps

1. Agree the open question and draw the sheet in `docs/mockups/`, matching DESIGN.md.
2. Core: `previewImport(projectDir, files)` with tests (rename, same-size match, unsupported, low space with an
   injected `statfs`).
3. HTTP route and API client.
4. Sheet on the New reel drop zone, then the media import, with e2e tests: drop, see the sheet, Cancel
   (nothing in `footage/`), drop again, Import (as today).
5. The `ENOSPC` message during the import, with a core test.

## Risks

- The estimates are rough. Label them "about" and make the space check conservative.
- An extra step on every drop slows the common case. The open question decides when it appears.

## Checks to run

- `npm test`, `npm run typecheck`, `npm run test:e2e`.
- On both surfaces: drop a file whose name is taken and see the new name; Cancel leaves `footage/` unchanged.

## Changelog

### 2026-10-31
- Plan created from the Voogle Sort FAQ comparison.
- Steps 2 and 3: `previewImport` (`server/core/_internal/import-preview.ts`), `POST /api/import/preview` and the
  web client's `previewImport`. It follows each import path's own rules, asks the file system whether a name is
  taken (so case counts where the system says so), and treats names chosen earlier in the same drop without case.
  Changes nothing on disk (`tests/core/import-preview.test.ts`, route included).
- Step 1, half: mockup `docs/mockups/2026-10-31-import-preview.html` (fits, and not enough room). The open
  question, when the sheet appears, still waits on the owner. Step 4 (the sheet on both drop surfaces) is not
  started.
- Step 5: a drive that fills during an import now says "The drive ran out of space while copying, so nothing was
  kept" in both import paths (`writeHashed`), and no partial file is left.

### Owner decisions, 2026-10-31
- The sheet appears only when needed: more than one file, a renamed or maybe-duplicate file, a refused file, or not
  enough space. A single clean file imports at once, as before.
- Step 4: `web/src/ImportPreview.tsx` (`ImportSheet`, `needsImportSheet`) on the New reel drop zone (`DropZone.tsx`)
  and the media library import (`MediaEditor.tsx`). It appears only when needed (owner decision above); Escape or Cancel
  copies nothing; Import copies exactly as before; Tab stays in the sheet. When the preview request fails, the import
  goes ahead as before. A drop of only non-videos still gets the existing message, so the New reel sheet lists no
  refused rows. Checked in the browser: `tests/e2e/drop-video.spec.ts` (new sheet test; three drop tests now press
  Import) and `tests/core/render-import-sheet.test.ts` (media library).
