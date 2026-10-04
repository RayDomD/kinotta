---
target: states per clip strip and part bar
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-10-03T19-23-51Z
slug: web-src-shotsheet-tsx
---
Method: dual-agent (A: design review · B: detector + browser)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | Part bar now draws (was broken by a CSS collision, fixed in 4b33b28) |
| 2 | Match real world | 3 | |
| 3 | User control | 3 | |
| 4 | Consistency | 3 | Strip follows grid card language |
| 5 | Error prevention | 3 | |
| 6 | Recognition | 3 | Strip label names the first state, not the clip (as in the mockup) |
| 7 | Flexibility | 3 | Arrow keys step every shot; strip jumps within a clip |
| 8 | Minimalist | 3 | |
| 9 | Error recovery | 3 | Inherited PageStill failure states |
| 10 | Help | 2 | Nothing names arrow-key vs strip behaviour beyond the hint |
| Total | | 29/40 | Good |

Priority issues found and fixed in the same run:
- [P1] .part rule landed inside `.secs .pins-badge`: dashes had no size, text not muted. Fixed.
- [P2] `.state` collided with the empty-state rule (padding 28px): strip stills 76px instead of 132px, titles truncated. Renamed `.clip-state`. Fixed.
- [P2] Sheet with strip overflowed a 1280x800 viewport. Frame reserves 370px when a strip is shown. Fixed (sheet still scrolls slightly when the pin row wraps).
Open, minor:
- [P3] Strip buttons don't announce position ("2 of 3") or pin counts per state.
- [P3] Strip label uses state 1's title for the clip; plan has no separate clip title in shots.json.
Detector: CLI 0 findings; browser 1 pre-existing "glow" finding on grid and dialog alike (not from this feature). Contrast: strip label and non-current titles 5.21:1, pass AA.
