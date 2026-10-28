---
title: Editor layout, scaling and collapsible sidebar
date: 2026-10-27
status: Done
summary: A collapsible sidebar with a light animation, and an editor layout that scales cleanly when the window or the timeline divider moves, checked by an impeccable pass.
spec:
---

## Intent

- Problem:
  - The sidebar cannot be collapsed, so the picture and timeline never get the full width.
  - The layout does not scale cleanly. The owner reports that moving the divider between picture and timeline resizes many unrelated elements. The owner's screenshot of 2026-10-27 shows the timeline toolbar, zoom row and track labels spread with large gaps, the Speech track's controls (×, ↑, M, S, gain) crowded into its label cell, the marker bar's fields running into the top edge, and clip labels truncated to one or two letters ("Co...", "a..").
- Why: The owner asked on 2026-10-27 for a UI pass across the whole editor so it holds up at any window size.
- Proposed outcome:
  - The sidebar collapses to a thin strip and expands again, with a short animation that feels smooth. The choice is remembered.
  - Moving the divider or resizing the window changes only the regions that should change (picture and timeline heights); toolbars, labels and controls keep their size and spacing.
  - The editor scales across common laptop and desktop widths without overlap, clipping or stretched gaps.
  - An impeccable audit by agy lists what else is off, and its findings are triaged into this plan before building.
- Affected: `web/src/App.tsx` (rails), `web/src/review/_internal/MediaEditor.tsx`, `NativeLanes.tsx`, the timeline toolbar and marker bar, `web/src/styles.css`, `DESIGN.md`, layout e2e tests.
- Constraints:
  - Light on resources: animate `transform`/`opacity` or one grid-column width with a CSS transition, no JS animation loop, no layout work per frame beyond the one transition; respect `prefers-reduced-motion`.
  - Follow `DESIGN.md`. Preserve the animated revisions and the Review fix that loads the chosen Working revision.
  - Simple mode keeps working.
- Out of scope: New editor features, phone layout (Effects already says it needs a computer), and the changes in the other 2026-10-27 plans.
- Open questions:
  - O1: Resolved 2026-10-27. Both the left rail (Reel, Sections) and the right panel (Effects, Comments) collapse, each with its own toggle.
  - O2: Resolved 2026-10-27 by agy's audit (`.herdr/runs/2026-10-27-editor-layout-scaling/phases/A-audit/audit.md`), checked by Claude against the code and screenshots. Causes, verified: the tracks pane has no height floor (`review.css:5,8`: the picture well may take all but 90px, the tracks pane is `flex: 1; min-height: 0`), so dragging the divider down squeezes the timeline to nothing (`screens/divider-after.png`); the divider calls `setSettings` on every pointer move (`ViewerDivider.tsx:8`), which re-renders the whole editor and writes settings to storage each time (`EditorWorkspace.tsx:57-61`); the side columns are sized with `clamp(..vw..)` (`styles.css:57-58`), so they change width as the window does; the marker panel is inserted above the divider when open (`MediaEditor.tsx:680`), pushing everything below it down. Likely but not separately confirmed: a scrollbar appearing in the tracks pane narrows every clip by its width, and toolbar rows wrap at certain widths.
  - O3: Column widths and default picture height. `DESIGN.md` § Layout says a fixed 220px rail and 320px right column; § Components says the player sits at 36vh. The code uses `clamp(..vw..)` columns and a 55vh default picture. Resolved 2026-10-27, owner approved: fixed 220px rail and 320px right column per `DESIGN.md`; default picture share about 45% of the column, and `DESIGN.md` § Components updated to match.

## Goal

1. Each side panel collapses and expands with its own button and keyboard shortcut, animates in about 220ms with one CSS transition, skips the animation under reduced motion, and remembers its state across reloads.
2. Dragging the divider changes only the picture and timeline heights; the timeline always keeps a usable minimum height, and nothing else changes size during the drag.
3. Resizing the window between 1280 and 2560px wide changes only the centre column's width; the side panels keep fixed widths.
4. The Speech and other track headers fit their controls without overlap, clip names stay readable or show in full on hover, and the toolbar and zoom controls sit together instead of spread across wide screens.

## Approach

**Panels.** One grid on `.body` with `--rail-width` and `--panel-width` variables, set by `data-rail-open` and a new `data-panel-open`, and `transition: grid-template-columns 220ms var(--ease)` with a `prefers-reduced-motion` override (audit § 4). Collapsed panels use `inert` so focus skips them. `railOpen` and a new `panelOpen` live in editor settings and are saved when toggled (today `setRailOpen` never saves: `EditorWorkspace.tsx:48`). Each panel gets a visible collapse button; the rail keeps its `m` shortcut and the panel gets one in the shortcut list.

**Divider.** During a drag, set `--viewer-height` directly on the column and commit `viewerShare` to settings once, on pointer up. Give `.rv-tracks-pane` a minimum height and cap the picture so the floor holds. Reserve the tracks pane's scrollbar space (`scrollbar-gutter: stable`) so a scrollbar appearing doesn't narrow the clips. Move the marker panel out of the column flow so opening it doesn't shift the split.

**Timeline.** One shared `--timeline-label-width` for track header columns, wide enough for the Speech controls, or headers on two rows (name, then M/S/gain). Clip labels hide below a minimum clip width and show the full name in a tooltip. Toolbar tools and zoom controls share one compact row.

**Shapes.** `.editorial-pin` and `.native-fade` lose `border-radius: 50%` (`DESIGN.md` § Shapes, zero radius).

## Steps

1. [x] O3 answered: fixed 220px / 320px columns, default picture share about 45%, `DESIGN.md` updated.
2. [x] Render tests (red): panel toggles set the grid columns and persist across reload; reduced motion has no transition; dragging the divider keeps the tracks pane at or above its floor and does not change the toolbar or header sizes; side panel widths don't change between 1280 and 1920px.
3. [x] Panels: grid variables, transition, buttons, `inert`, persisted settings.
4. [x] Divider: drag without re-rendering, height floor, scrollbar gutter, marker panel out of the flow.
5. [x] Timeline: shared label width, header layout, clip label rule, compact toolbar row, zero-radius shapes.
6. [x] Impeccable re-check by agy at 1280, 1440, 1920 and 2560px and after a divider drag, against the audit's findings; screenshots in the run folder.

## Risks

- Animating `grid-template-columns` re-lays out the centre column each frame for 220ms; acceptable for a single toggle, and the picture's container query recalculates only during that time. If it stutters, animate `transform` on the panel and snap the grid at the end.
- Editor tests that read panel widths or the old toolbar layout need updating.
- Simple mode and Storyboard share `.body`; check both.

## Checks to run

- New render tests and existing editor e2e suites.
- agy's re-check screenshots compared with the audit's.
- `npm run typecheck`, `npm run build`.

## Result

All six steps shipped. Built by Claude and codex (steps 2 to 5), reviewed read-only by agy, then re-checked visually by agy (step 6).

What shipped:
- Both side panels collapse and expand with their own button (left rail 220px open and 44px closed; right panel 320px open and 28px closed). The right panel also takes Shift+R (`panel` in `EDITOR_ACTIONS`). One 220ms `grid-template-columns` transition, none under `prefers-reduced-motion`. A collapsed right panel is `inert`. Both states persist in editor settings (`railOpen`, new `panelOpen`).
- The divider writes `--viewer-height` directly during a drag and saves `viewerShare` once on release. The picture well can shrink, the tracks pane keeps a 120px floor, and its scrollbar space is reserved.
- The marker panel no longer shifts the split. The Speech header controls fit at 1280px. Clip labels hide below a minimum width and carry the full name as a tooltip. Timeline tools and zoom share one row. `.editorial-pin` and `.native-fade` have zero radius.
- Default picture share is 0.45 (was 0.55). `DESIGN.md` § Layout and § Components now match: the step 1 note said it was updated, but it was not until this change.

Deviations and findings:
- `EditorialLanes.tsx` was not in the plan's Affected list; it renders graphic clip labels, so it was added to codex's scope.
- agy's review of the first commit found a real clipping bug (the tracks pane ended below its column when the divider was dragged to the bottom), a missing right-panel shortcut, and a toggle inside an ARIA tablist. All three are fixed, with tests.
- `tests/e2e/clips.spec.ts` (scale by the corner grip) sets a 1280x900 window: at 720px tall the timeline floor leaves a picture too small for its fixed-pixel drag. The assertions are unchanged. On main the same test passes at 720px.
- Not fixed, out of scope: the divider's ArrowUp and ArrowDown are inverted (ArrowUp grows the picture, which moves the divider down). It behaved this way before this plan.
- At 1280x720 the picture is about 244x137, because the timeline floor, two notice bars and the title take the height. Not changed.
- The mobile layout (900px and below) only has its CSS adapted for the new wrapper; phone layout stays out of scope.

Checks:
- `tests/e2e/editor-layout.spec.ts`: 10 passed (each new test was red before its fix, except the left-toggle, Shift+R and bottom-clip assertions, which were written with or after the code).
- Existing suites, one worker: editing 10, lanes 6, review 3, clips 3, footage 11, pins 11, versions 9, simple-mode 15 passed; snip-save 9 of 10, and the tenth passed alone after a native worker crash (0xC0000409).
- `npx vitest run tests/web`: 131 passed. `npm run typecheck`, `npm run build`, `npm run check:docs`: clean.
- agy's re-check at 1280, 1440, 1920, 2560 (900 tall) and 1280x720, in five states each (default, right collapsed, left expanded, marker open, divider at the bottom): 25 screenshots, all clean against the owner's complaints. I read two of them (1920 default, 1280x720 default) and they match. Evidence: `.herdr/briefs/evidence-2026-10-28-layout/` (local, not committed).

## Changelog

### 2026-10-27
- Plan created with Intent only. Owner asked for a collapsible sidebar with a light animation, proper scaling, and an impeccable pass by agy.
- O1 resolved: both side panels collapse.
- agy's impeccable audit done; Claude verified its main causes against the code and screenshots (O2). Goal, Approach, Steps, Risks and Checks written. O3 (column widths and picture height) asked.
- O3 resolved with the recommendation; status Approved.

### 2026-10-28
- Built steps 2 to 5 on `feat/editor-layout-scaling` (Claude and codex); agy reviewed the first commit and re-checked the finished editor (step 6). Review fixes applied. Status Done.
