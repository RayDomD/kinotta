---
target: New reel screen
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-10-05T05-16-58Z
slug: web-src-newreel-tsx
---
⚠️ DEGRADED: single-context (owner chose no sub-agents)

Target: New reel screen (web/src/NewReel.tsx, DropZone.tsx, MissingTools.tsx, BriefReel.tsx BriefForm). Mode: Operate. Decision: docs/mockups/2026-10-05-review-edit.html state 1.

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | A large drop shows a static "Copying into footage/…" below the zone, with no progress |
| 2 | Match System / Real World | 3 | Plain words; "footage/" is the owner's own folder name |
| 3 | User Control and Freedom | 2 | No cancel during a copy or start; a picked video cannot be unpicked |
| 4 | Consistency and Standards | 2 | Top bar and comments panel still show the previous reel on New reel |
| 5 | Error Prevention | 3 | Brief start disabled until filled; a blank reel name falls back to the file name |
| 6 | Recognition Rather Than Recall | 3 | Codec, length and size on every video; tool status in view |
| 7 | Flexibility and Efficiency | 2 | Enter starts; no faster path from a drop to Start |
| 8 | Aesthetic and Minimalist Design | 3 | Matches the mockup; the brief block below it is misaligned |
| 9 | Error Recovery | 3 | Server reasons shown inline with role=alert |
| 10 | Help and Documentation | 3 | Install hints inline; the mockup's "What happens next" panel is missing |
| Total | | 27/40 | Acceptable |

Priority issues:
- [P1] Previous reel's context leaks into New reel: top bar keeps its title, phase tabs and "Copy section 01 comments"; the right panel keeps its comments and its note field. Fix: in the creating state, top bar shows "New reel" with no phase tabs or copy button, and the panel shows the mockup's "What happens next" list. /impeccable layout
- [P2] Brief block misaligned: its rule and form are 640px wide under a 1080px two-column grid, and its lede runs ~91 characters. Fix: align the block to the drop column and cap the lede at 65ch. /impeccable layout
- [P2] Drop status is far from the drop and has no progress: it renders under a 380px zone. Fix: show the status and upload progress inside the zone, with the zone disabled while it runs. /impeccable harden
- [P3] Duration numerals in the pick list are 12px muted Doto. /impeccable typeset

Detector: CLI 0 findings on the four files. In-page: 4. dark-glow x2 on the rail's lit version (the DESIGN.md light, out of target), line-length on p.rv-lede (agrees with P2), flat-type-hierarchy body-wide (app-wide scale, out of target).
