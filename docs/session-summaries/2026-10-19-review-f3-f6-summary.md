# Review findings F3-F6

Completed the approved plan on `fix/review-f3-f6`, based on local `main` at `f523314`, in `.worktrees/review-f3-f6`. The dirty root checkout and main were not modified. Nothing was pushed.

## Shipped against plan

- F3: complex-filter thread budgets in composite, audio join, native media rendering and mix argument builders; the runner supplies the budget for direct encoder callers without duplicating it. Commit `0e54d4b` (`fix: bound ffmpeg complex filter threads`).
- F4: disposable persistent verification records under `footage/.playback/.hashes`. Reuse requires matching real path, device/inode, size, nanosecond mtime and ctime. A computed hash is accepted only when metadata is unchanged after the read; saved source hashes are still compared on every request. Invalid/missing caches trigger hashing, and unwritable cache storage does not block a successful verification. Commit `783c0ca` (`fix: persist verified saved media hashes`).
- F5: corrected the six listed test files so active picture checks exclude hidden upcoming layers. The drawing-order regression includes a hidden upcoming layer. Commit `6fb1d62` (`fix: target active picture layers in tests`).
- F6: ShotSheet consumes the existing reveal sequence so revealing the same pin again restores its alternate after manual switching. The F1 reset in Storyboard remains unchanged. Included with this summary in `fix: honor repeated pin reveals in open shot sheets`.

## Evidence

Every finding had a failing regression before implementation. F3's four argument-builder cases lacked the complex-filter thread option. F4 failed cold-reload byte-read checks and accepted a file mutated during hashing. F5 returned `upcoming` instead of the visible `green` layer. F6 stayed on A when the same B pin was revealed a second time.

| Check | Result |
| --- | --- |
| `npx vitest run tests/core/complex-filter-threads.test.ts tests/core/gentle-render.test.ts tests/core/media-audio.test.ts` | 10 passed |
| `npx vitest run tests/core/saved-media-verification.test.ts tests/core/playback-copy.test.ts tests/core/media-library.test.ts tests/core/media-http.test.ts` | 21 passed |
| `npx vitest run tests/core/render-media-layer.test.ts tests/core/render-media-sync.test.ts` | 7 passed |
| Four affected e2e specs, existing fixture-server settings with one worker | 13 passed initially; remaining transcription test passed after its selector correction (14 distinct tests passed) |
| `npx playwright test -c tests/e2e/alternates.config.ts --workers=1` | 15 passed (14 baseline plus F6 regression) |
| `npx vitest run tests/core/parts-convert.test.ts tests/core/playback-copy.test.ts tests/core/version-media.test.ts` | 13 passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; chunk-size advisory remains |
| `git diff --check` | Passed |

Tests and builds ran unsandboxed as requested. The first F5 browser attempt could not load the unbuilt worktree's editor; after building, the intended selector regression reproduced. The temporary e2e config reused the four affected servers from the repository config, without starting unrelated fixture servers.

The F6 regression exercises Storyboard comment controls delivering reveal requests into an existing sheet, checks repeated and different-shot requests, verifies the iframe revision and visible pin, and compares Working before and after. Both F1 Use/remount cases pass. The pre-fix screenshot also shows A still selected after the repeated B reveal. The modal covers the comments panel, so the test dispatches those control events; physical click-through is outside this change.

## Deviations and limits

The transcription test's pre-v1 surface uses the legacy Player, not PictureLayer. Its assertion now targets `.rv-frame > video.rv-video`, which cannot match an UpcomingPictureLayer. All other listed picture selectors use `[data-verify-unit="PictureLayer"]`. This evidence-based selector exception avoids changing product behavior just to satisfy a test selector.

As approved, a source without a trusted verification record still needs a full hash once; unchanged verified files skip byte reads after server reload. Metadata invalidation preserves the existing cache trust model, with stronger replacement detection; it does not claim protection from an adversary who can forge both file metadata and local cache records.

The Goal still answers the Intent. No scoped implementation or verification work remains unfinished.
