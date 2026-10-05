---
target: Review tab and New reel screen (audit)
total_score: 17
max_score: 20
timestamp: 2026-10-05T12-10-00Z
slug: web-src-review-audit
---
Technical audit, done by hand with `detect.mjs` and a contrast script (oklch to sRGB, WCAG 2.1).

| Dimension | Score | Finding |
|---|---|---|
| Accessibility | 3 | AA contrast holds on every pairing the tab uses; one keyboard gap found and fixed (stretch selection). |
| Performance | 4 | Only transform and opacity animate; the progress fill is a scaleX. |
| Theming | 4 | Dark only (D21); every colour is a token on `:root`. |
| Responsive | 3 | Full screen on a large monitor is the target (PRODUCT.md); no narrow layout by decision. |
| Anti-patterns | 3 | Detector: 0 bans; advisories only for font sizes off the DESIGN.md ramp (14, 12.5, 11.5, 11, 10px). |

## Contrast (dark theme, ratios computed from the tokens)
| Text | on Table | on Gate | on Slate | on Slate Lifted |
|---|---|---|---|---|
| Title (ink) | 15.9 | 16.8 | 15.0 | 13.8 |
| Caption (ink-2) | 10.7 | 11.3 | 10.1 | 9.3 |
| Credits (muted) | 5.6 | 5.9 | 5.2 | 4.8 |
| Tally (light) | 11.7 | 12.3 | 11.0 | 10.2 |
Ground text on the Tally name tag and Snip button: 11.7. All at or above 4.5. Disabled controls (opacity .5) are exempt.

## Motion
Longest transition is the 380 ms chrome lift (ceiling 500 ms). Stepping, scrubbing, nudging and key navigation are instant. `@media (prefers-reduced-motion: reduce)` in styles.css zeroes every transition and animation; no JS animation exists.

## Keyboard
Reachable by Tab: New reel, video list, name, Start, phase nav, tools, play, zoom, Edits tabs, Undo and Redo, each card's Remove (visible on focus), clip and piece handles, words (Enter to fix), Save, Discard. Keys: Space, arrows, Shift+arrows, Home, End, S, B, V, [ and ], Enter, Escape, + and -, Ctrl+Z and Ctrl+Y. New this pass: `[` and `]` for a stretch, arrows to nudge a selected element.

## Verbs the audit flagged
- `harden`: nothing outstanding beyond the stretch selection above.
- `polish`: hint copy on the Edits tab now names the arrow keys; no visual change.
