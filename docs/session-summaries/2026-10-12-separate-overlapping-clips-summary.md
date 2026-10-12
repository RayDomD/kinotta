# Separate overlapping clips

Overlapping files automatically occupy separate visible rows inside their existing track or picture layer. The same interval partitioning handles sound, pictures, graphics and captions. Touching clips reuse a row. Expanded captions account for their minimum word widths so they cannot cover a neighbouring caption. Progress and retry badges follow their clip's row.

Timing, picture compositing, sound ownership, mute, solo and gain are preserved. Existing reels gain the layout automatically. No operations were written to the showcase reel.

Verification:

- `npm run typecheck` and `npm run build` passed.
- The new `render-overlap-rows` test failed on overlapping sound bars before the change and passes afterwards. It also verifies touching intervals share a row, overlapping graphics separate, expanded captions separate, one shared mute control remains, and no edit operations were created.
- Native dragging/trimming, editorial word editing, timeline window and media library browser tests passed.
- Final run of overlap rows, editor shortcuts/dragging and review shell: 3 files, 3 tests passed in 11.93 seconds. Seven distinct browser cases passed across focused runs.
- Visually inspected the running showcase. Both Sound effects groups occupy three rows, and Music keeps its existing rows and controls. Touching bar edges have only browser floating-point rounding, with no visible overlap.
- `git diff --check` passed.

Logs: `%TEMP%/kinotta-overlap-red.log`, `kinotta-overlap-checks.log`, `kinotta-overlap-verified.log` and `kinotta-overlap-final.log`.

The only test correction was the caption fixture. Kinotta chooses one speech placement for captions, so repeated speech does not create simultaneous caption phrases. The regression instead opens a short phrase whose minimum word width extends into its next neighbour's time span.
