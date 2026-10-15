# Plan review and single-page conversion: handoff

Written on October 15, 2026 so the next session can start fresh. Read `AGENTS.md` first. Its rules on changes to existing interactions apply to everything below.

## Where things stand

- `main` is at `5f3a23d`, the merge of `codex/viewer-alternates-merge`.
- Branch `claude/convert-single-page-to-parts` (pushed, no pull request) holds one commit on top of `main`: an options request on a single-page reel is answered by converting that same reel to parts. Details below.
- Nothing else is uncommitted.

## Done in this session

### 1. Review of the merged work against its plans

Plans compared: `docs/plans/2026-10-12-live-edits-freeze-at-render.md`, `2026-10-12-shots-as-parts.md`, `2026-10-13-alternates.md`, `2026-10-13-viewer-transport-clips.md`, with the chain brief in `docs/briefs/2026-10-14-live-edits-parts-alternates/1-chain-codex.md`. Most acceptance criteria are built and their tests pass.

The findings below come from reading the code. None was confirmed by clicking through it in a browser.

Deviations, most important first:

1. **Pins on a non-reel alternate show in Review.** The alternates plan says a pin placed while viewing B is shown only on B. The Storyboard card and the enlarged shot do filter by alternate (`web/src/Storyboard.tsx`, `web/src/ShotSheet.tsx`). Review's editor does not. `shownPins` in `web/src/review/_internal/MediaEditor.tsx:164` passes every comment to the frame pin layer (`:521`), the transport and the pins lane, so a pin on B draws over A.
2. **"Ask for options" exists only in the enlarged shot's pin form.** The plan says any comment on the newest version has the switch. Pins placed in Review cannot ask. `web/src/CommentsPanel.tsx` shows neither the request ("3 options" in the mockup) nor which alternate a pin is on ("Shot 04 · B").
3. **The enlarged shot differs from `docs/mockups/2026-10-13-alternates-in-storyboard.html` step 3.** It has one Use / Not this row acting on the viewed alternate instead of Use on each alternate, and no "Viewing B · <title>" heading.
4. **Markers on the older footage path show on the transport only.** `web/src/review/_internal/Lanes.tsx` gets no markers and has no snapping. The viewer plan says markers show on the time row and clips snap to them.
5. **Settings migration checks conflicts only for `focus` and `marker`** (`web/src/review/_internal/editor-settings.ts:113`). The new defaults PageUp, PageDown, Shift+Delete and `?` are not checked, so a custom binding on one of them disables both actions.
6. **Wording.** `skill/kinotta/reference/contract.md` says "Alternatives" and "alternative", where `CONTEXT.md` requires "alternate". The comment on `whoMade` in `web/src/App.tsx` says "Saved by you" but the code returns "Built by".

Process and doc gaps:

- The live-edits, shots-as-parts and alternates plans are still `status: Approved` with no changelog entry for the build. `docs/plans/index.html` shows the same. Only the viewer plan is `Done`.
- The Impeccable critique and audit steps were never run: live edits step 7, alternates step 10, viewer step 11. The chain has no session summary of its own, only `2026-10-15-viewer-alternates-merge.md`.
- `DESIGN.md` still describes Save and Save-and-render (lines 127, 197, 204).
- The shots-as-parts check `kinotta check reels/kinotta-showcase` was never run.
- Known, recorded risk: `removeStaleDrafts` (`server/core/_internal/render-queue.ts:109`) can delete a live Draft's inputs if a second server starts on the same project.

### 2. Single-page reel to parts conversion (branch `claude/convert-single-page-to-parts`)

The owner reported that when Codex was asked for alternates on a reel at v18, it created a new reel with alternates for shot 03 instead of making v19. Cause: alternates need a parts reel, the reel was single-page, the core refused options on it, and the skill said to keep single-page reels as they are without saying how to convert one.

The owner decided (option 1): **when alternates are requested on a single-page reel, convert that same reel to parts automatically as its next version.** Never create a new reel.

Changes:

- `server/core/_internal/comments.ts`: options are accepted on any code-built reel (`version.parts || version.code`), not only parts reels.
- `server/core/_internal/batch.ts`: a single-page batch with a request adds `Shot 03 · 3 alternates` and a `Convert to parts:` line.
- `server/core/_internal/carry.ts`: an unsent frame pin carried into a parts version takes the `shotName` of the parts shot it lands on.
- `web/src/ShotSheet.tsx`, `web/src/Storyboard.tsx`: a `canAskOptions` prop, true for parts and code-built single-page reels.
- `skill/kinotta/SKILL.md`, `skill/kinotta/reference/contract.md`: a new section, "Converting a single-page reel to parts", with steps. It builds the conversion as the same reel's next version and says never to start a new reel. `server/core/README.md` is updated.
- Tests: `tests/core/parts-convert.test.ts` (new), plus a single-page case at the end of `tests/e2e/alternates.spec.ts`.

Verification:

- Typecheck passes.
- 22 core files, 131 tests pass: conversion, alternates, parts, comments, batches, pins, hand-off.
- The alternates browser suite passes 6 of 6, including the new case.
- `part3-existing.config.ts` passes 30 of 31. The failure, `review.spec.ts:51` ("a picked video plays…"), fails identically on unchanged `main`. It is most likely this container's Chromium not playing the test video.
- **Not verified:** a real Codex run on the owner's reel. The owner's mistakenly created reel still exists and can be deleted once a request comes back right.

## Next tasks, in order

1. **Fix review finding 1.** Filter Review's pins by alternate in `MediaEditor.tsx`: hide a frame pin whose `pin.alternate` is set and is not the shot's in-reel revision. Apply it to the frame layer, the transport and the pins lane. Add a browser test with a pin on a non-reel alternate.
2. **Fix review finding 2.** Offer "Ask for options" where comments are added in Review, using the same rule (code-built reel, one asking shot). Show the request and the alternate label on comments in `CommentsPanel.tsx`. The behavior is clear from the plan; check the mockup for the label wording.
3. Decide with the owner whether a pull request for `claude/convert-single-page-to-parts` should come first, or whether tasks 1 and 2 ride on that branch.
4. Optional, smaller: findings 3 to 6, the plan status updates, `DESIGN.md`'s Save text.

Out of scope until the owner says otherwise: **the pending inline alternates decision in `AGENTS.md`**, which is to preview, switch and apply alternates inside the Storyboard card with animated playback. Do not treat tasks 1 and 2 as implementing it.

## Environment notes for a cloud session

- `npm ci`, then `npm run typecheck`.
- **Build the UI before any browser-based Vitest file:** `npm run build`. Otherwise tests that open the app time out looking for the reel list.
- The repo's Playwright expects Chromium 1243, but the container has 1194. Point it at a folder of links:
  ```sh
  PW=<scratch>/pw
  mkdir -p $PW/chromium_headless_shell-1243/chrome-headless-shell-linux64 $PW/chromium-1243/chrome-linux64
  ln -sf /opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell $PW/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
  ln -sf /opt/pw-browsers/chromium-1194/chrome-linux/chrome $PW/chromium-1243/chrome-linux64/chrome
  touch $PW/chromium-1243/INSTALLATION_COMPLETE $PW/chromium_headless_shell-1243/INSTALLATION_COMPLETE
  export PLAYWRIGHT_BROWSERS_PATH=$PW
  ```
- `playwright.config.ts` uses `channel: 'chrome'`. For `tests/e2e`, link Chromium there too: `mkdir -p /opt/google/chrome && ln -sf /opt/pw-browsers/chromium-1194/chrome-linux/chrome /opt/google/chrome/chrome`.
- Run with one worker: `npx vitest run <files> --maxWorkers=1`, `npx playwright test -c tests/e2e/<name>.config.ts --workers=1`.
- Browser runs overwrite `docs/session-summaries/2026-10-15-viewer-transport-clips/*.png` and create `tests/artifacts/`. Restore and delete them before committing.
- The owner's `reels/`, `footage/` and `.kinotta-server.json` are not in git, so their reels cannot be inspected from a cloud session.
