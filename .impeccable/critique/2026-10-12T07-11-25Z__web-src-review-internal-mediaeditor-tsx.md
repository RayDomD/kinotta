---
target: Kinotta Review timeline tracks
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-10-12T07-11-25Z
slug: web-src-review-internal-mediaeditor-tsx
---
DEGRADED: single-context review, requested by the owner.

The timeline follows the approved mockup: Time and pins first, a thin Reel strip, occupied picture rows, captions that open into words, then sound. It retains Kinotta's neutral frame, square controls and state accents.

| Heuristic | Score | Finding |
| --- | ---: | --- |
| System status | 3/4 | Selection, history and disabled reasons remain visible. |
| Familiar language | 4/4 | Picture tracks and Graphics replace mixed lane names. |
| User control | 3/4 | Escape closes words and restores caption focus. |
| Consistency | 3/4 | Rows share a time window and header alignment. |
| Error prevention | 3/4 | Existing edit guards and recovery remain. |
| Recognition | 3/4 | Caption tooltips explain word opening and retyping. |
| Efficiency | 3/4 | Word timing supports keyboard nudge steps. |
| Minimalism | 4/4 | Empty rows no longer bury sound tracks. |
| Recovery | 3/4 | Undo, retries and attachment repair pass tests. |
| Help | 3/4 | Tooltips carry actions and shortcuts. |
| Total | 32/40 | |

The composition is specific to editing this reel, with time as the shared coordinate system. Row names and selection treatment match the source/placement model. Minimum word widths support precision without adding a permanent Words row. Those are the main strengths.

Cognitive load is lower in the tracks. The seven existing toolbar actions remain visible for editing. Progressive disclosure carries words and keeps the main view compact. The edit history and disabled reasons provide state feedback and recovery.

Priority issue P2: very short sound bars still need zoom for precise grabbing because handles shrink with the bar. NativeLanes and review.css retain the existing small-bar behavior. Existing Zoom in is the workaround. Do not expand scope to a new clip-control design without a separate decision.

Owner cutting sound: fewer rows before the sound tracks, but dense short effects need zoom. Keyboard user: Enter opens words, Escape returns focus, and arrow keys adjust timing. These behaviors are covered by browser tests.

Audit: 17/20. Accessibility 3/4, performance 3/4, responsive behavior 3/4, theming 4/4, implementation consistency 4/4. Deterministic scan returned zero findings in MediaEditor, NativeLanes and EditorialLanes. Shell checks cover dark/light themes and 390–1600px widths. Existing bundle-size warning remains.

Browser evaluation is read-only. No detector overlay was injected. No P0 or P1 finding remains. Questions skipped: one priority issue with an existing workaround.
