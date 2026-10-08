---
name: Kinotta
description: A dark review editor that frames someone else's reel and marks only what you are working on.
colors:
  ground: "oklch(.184 .004 106)"
  ground-deep: "oklch(.150 .003 106)"
  card: "oklch(.214 .005 90)"
  card-raised: "oklch(.246 .005 90)"
  ink: "oklch(.945 .004 106)"
  ink-2: "oklch(.820 .007 106)"
  muted: "oklch(.640 .008 106)"
  rule: "oklch(.945 .004 106 / .14)"
  hairline: "oklch(.945 .004 106 / .24)"
  light: "oklch(.84 .11 225)"
  light-glow: "oklch(.84 .11 225 / .5)"
  light-wash: "oklch(.84 .11 225 / .07)"
  still-ground: "oklch(.13 .006 50)"
  scrim: "oklch(.12 .003 106 / .86)"
typography:
  headline:
    fontFamily: "Outfit, Segoe UI, sans-serif"
    fontSize: "22px"
    fontWeight: 500
    letterSpacing: "-0.4px"
  title:
    fontFamily: "Outfit, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 500
  body:
    fontFamily: "Outfit, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "Outfit, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  numeral:
    fontFamily: "Doto, monospace"
    fontSize: "12px"
    fontWeight: 800
    fontFeature: "tnum"
rounded:
  none: "0"
spacing:
  gutter: "22px"
  rail: "16px"
  card: "8px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
  card-comment:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
  input-note:
    backgroundColor: "{colors.ground-deep}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "9px 10px"
  chip-element:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.none}"
  tag-element-name:
    backgroundColor: "{colors.light}"
    textColor: "{colors.ground}"
    rounded: "{rounded.none}"
    padding: "2px 7px"
---

# Design System: Kinotta

## Overview

**Creative North Star: "The Light Table"**

Kinotta is a dark table the owner lays someone else's reel on. The table itself is warm near-black and flat, divided by hairlines, and carries no hue, because every reel brings its own client's brand and the chrome must never tint the judgment of colour or motion. One cold ice-blue light moves over the table: it marks the pin you placed, the version on screen, the section in view, and the element under the cursor. Nothing else is lit.

The structure is the owner's Rubric brand (decisions D15 to D22 in `docs/2026-09-30-grilling-decisions.md`): Outfit for reading, Doto dot-matrix for numbers, zero radius, the hex mark and hex cursor, and stacked paper for the things in your hand. Rubric's chrome-metal gradients are replaced by the ice light. Neutral dark is the default. Appearance can change the whole editor, including the picture well, to a light theme and select an ice-blue, amber or mint accent (owner decision, 2026-10-08). The editor is used full screen on a large monitor in operate mode.

Motion keeps Rubric's speeds by the owner's explicit choice (D19), which overrides the CRAFT operate budget: the chrome lifts, presses and recolours at crafted speeds, and anything driven by review work (stepping shots, scrubbing, keyboard navigation) never animates.

**Key Characteristics:**
- One light, never a fill: the ice blue marks state and never paints a surface.
- Flat shell, stacked paper in hand: depth appears only on the hovered or focused shot, the enlarged sheet, and comment cards.
- Numbers are machine type: every shot number, timecode, pin number and count is Doto with tabular figures.
- Hexes are the only ornament: the cursor, the pins, the waiting mark and the brand mark share one hexagon.
- Dot terrain is the only texture, and only where something is empty.

## Colors

A neutral warm-grey ramp with a single cold accent; the accent is a light, not a colour. The names come from the cutting bench (D23).

### Primary
- **Tally** (`light`): the ice-blue light, named for the lamp that shows which camera is live. Pins, the current version, the current section band, hover outlines on elements and words, the element name tag, shot numbers. Its glow (`light-glow`) sits behind lit things; its wash (`light-wash`) tints a lane cell or band that holds pins or is current.

### Neutral
- **Table** (`ground`): the shell behind everything.
- **Gate** (`ground-deep`): the frame well around an enlarged shot, and the note field.
- **Slate** (`card`) and **Slate Lifted** (`card-raised`): comment cards, the enlarged sheet, a lifted shot, and its pressed state.
- **Title** (`ink`), **Caption** (`ink-2`), **Credits** (`muted`): text in three steps. Credits is the floor for meta text and still clears AA at 5.2:1 on the Table.
- **Splice** (`rule`) and **Frame Line** (`hairline`): dividers between shell regions, and borders on lanes, bands and empty states.
- **Leader** (`still-ground`): behind a live still before its page draws, so an unloaded frame never reads as part of the reel.
- **Scrim** (`scrim`): dims the shell behind the enlarged sheet.

### Named Rules
**The One Light Rule.** The ice blue marks state (pinned, current, hovered, waiting on its shape) and never fills a surface or decorates. If it isn't telling you where you are or what you touched, it isn't blue.

**The Neutral Frame Rule.** Anything that borders the reel (the Gate, the Leader, the Scrim) is hueless, so the reel's own colour is judged against nothing.

## Typography

**Body Font:** Outfit (with Segoe UI, sans-serif), self-hosted.
**Numeral Font:** Doto (with monospace), self-hosted, weights 700 and 800.

**Character:** Outfit is a quiet geometric sans that recedes behind the reel; Doto is a dot-matrix face that makes every number read as an instrument readout.

### Hierarchy
- **Headline** (500, 22px, -0.4px tracking): the storyboard or section heading over the grid.
- **Title** (500, 15px): shot titles, the reel name in the top bar, card titles.
- **Body** (400, 15px, 1.5): comment text, descriptions in the sheet, the note.
- **Meta** (400, 12 to 13px): labels, spans, counts in words, hints. Muted or soft ink.
- **Review meta** (Outfit 400, 11 to 14px): the Review tab is denser than the storyboard. Lane text is 11 to 12.5px (phrases, words, piece labels), tool and tab labels 13 to 14px, the Edits hint and Save note 12 to 13px. All sit on the meta step; none is smaller than 11px and none is body text.
- **Numeral** (Doto 800, 10 to 14px, tabular): shot numbers, timecodes (700), pin numbers inside hexes, section numbers, the copy count.

### Named Rules
**The Machine Numbers Rule.** Every number that identifies or measures (shot, pin, section, timecode, count) is Doto with tabular figures; prose numbers stay in Outfit.

## Layout

A fixed three-column shell under a 52px top bar: a 220px rail (reels, sections, versions), the main column (heading, issue list when present, the grid, the time lanes), and a 320px comments column. The grid is three equal columns of 16:9 stills with 26px row and 22px column gaps. The lanes sit under the grid on one shared time axis: Sections (multi-section reels), Shots, Pins, Overlays, then the axis. Built for full screen on a large monitor; there is no narrow-screen layout.

The enlarged shot opens as a sheet over a scrim, sized to the viewport height so the frame, the element chips, the word row and the hint all fit without scrolling.

## Elevation & Depth

The shell is flat. Depth is stacked paper: a solid offset copy of the sheet's own border, drawn with hard-edged box shadows, never blur. It appears only on things in your hand.

### Shadow Vocabulary
- **Sheet at rest** (`box-shadow: 5px 5px 0 -1.6px ground, 5px 5px 0 0 ink/.42, 10px 10px 0 -1.6px ground, 10px 10px 0 0 ink/.18`): comment cards and the enlarged sheet.
- **Sheet lifted** (`7px/14px` offsets of the same): a hovered or focused shot, together with a 3px translate up and left.
- **Sheet pressed** (`2px/4px` offsets): the active press of a shot or the copy button.
- **Light glow** (`0 0 10px light-glow`, text or box): only behind lit state (current version, current band, hovered element, pins).

### Named Rules
**The In-Hand Rule.** Only what you are holding stacks: the shot under the pointer or focus, the enlarged sheet, and comment cards. Lanes, rails and panels stay flat.

## Shapes

Zero radius everywhere (`rounded.none`). Borders are 1.4 to 1.6px hairlines. The one recurring silhouette is the flat-top hexagon: the brand mark, the cursor (outline, filled on buttons, outline with a centre dot over a pinnable frame), numbered pins (filled ice with a ground stroke), and the outlined Waiting mark.

## Components

### Buttons
- **Shape:** square corners (0).
- **Primary (Copy):** ink fill, ground text, 600 weight, 8px 16px, with the count in Doto after the label. At rest it sits on the pressed shadow; hover lifts it to the rest shadow and translates it up and left; press drops it flat. After a copy, until the comments change, it is lit instead: Tally outline and glow, the outlined hex, "Sent" and the time in Doto; hover or focus turns it back to ink and asks "Copy again?" (D24). The C key copies from anywhere except a text field or the open sheet, and the tooltip says so.
- **Quiet (Close, Edit, Delete, Cancel):** no fill, muted or soft-ink text, full ink on hover.
- **Disabled:** dashed hairline and muted text, with the reason in its accessible name.

### Chips (element picker)
- **Style:** hairline-bordered text buttons in a row labelled "Pin an element", one per named element in the frame plus "Frame centre (position only)". The keyboard path to pinning.

### Cards / Containers
- **Shot card:** transparent at rest; on hover or focus it takes paper, an ink border and the lifted sheet. The still is a live page; one real button stretches over the card.
- **Comment card:** paper, ink border, sheet at rest, 10px 12px. Number in Doto ice, "Shot 03 · 03.60s", then the element in ice or "position", then the text.
- **Empty state:** dashed hairline box with dot terrain along its bottom edge.

### Inputs / Fields
- **Style:** deep-ground field, hairline border, square corners.
- **Focus:** the border turns ice.

### Navigation
- **Rail rows (reels, sections, versions):** text rows with a 1.6px left border; the current row's border is ice (versions and sections) or ink (reels) and it carries `aria-current` and a text cue ("now", "storyboard", "changed 01", "Waiting").
- **Phase nav:** Storyboard is current with an ink underline; Review and Picker are visible and inactive ("Not built yet").

### Pinning (signature)
Over the enlarged frame the cursor is the hex with a centre dot. The element under it gets an ice outline with glow, drawn in the editor, never inside the reel's page, and an ice name tag placed outside the element so it never covers the reel's content. A click drops a saved pin (D25): a small filled hex anchor on the exact spot and an ice tag with the comment number and the start of its text, placed outside the element and off the page's content, joined to the anchor by a hairline. Grid stills show the anchor and a number-only tag, stacked clear of nearby tags. The same number appears in the Pins lane and on the comment card.

### Word row (signature)
Under a footage shot's frame, the spoken words sit in a row at full ink with a few muted context words either side. Hovering or focusing a word outlines it and shows a tag below it with the word and its time; a word pin is a numbered hex above the word.

### Time lanes
Shots, Pins and Overlays share one axis. A shot segment's width is its duration; pins sit at their time side by side; overlays sit at their span; an empty Overlays lane reads "None" over dot terrain. On a multi-section reel a Sections lane of bands sits on top, the current band lit.

### Review tab (operate mode, `web/src/review/review.css`, mockup `docs/mockups/2026-10-05-review-edit.html`)
The Review tab keeps the shell and swaps the grid for a player over time lanes, with Edits and Comments tabs in the right column. Its components are all `rv-`:
- **Player** (`rv-well`, `rv-frame`, `rv-video`, `rv-page`, `rv-problem`): the Gate well around a 16:9 frame at 36vh. The footage or the version page fills the frame; `rv-problem` is a centred message inside it only. `rv-caphandle` and `rv-caphint` are the draggable caption with its hover tag.
- **Transport and tools** (`rv-transport`, `rv-play`, `rv-tc`, `rv-zoom`, `rv-tools`, `rv-tool`, `rv-tools-note`, `rv-snip-go`): play, the Doto timecode, Select (V), Blade (B) and Snip (S) as a toolbar with `aria-pressed`, the lit tool in Tally. With Snip on, a note says how to choose a stretch. `rv-snip-go` is the one filled Tally button, which breaks the One Light Rule on purpose: it is the single action that removes footage.
- **Lanes** (`rv-lanes`, `rv-zoomed`, `rv-plane`, `rv-over`, `rv-win`, `rv-ph`): an overview of the whole reel with a window, then the zoomed lanes sharing one Tally playhead. Footage pieces (`rv-piece`, `rv-joint`), captions (`rv-caps`, `rv-phrase`), words (`rv-words`, `rv-w`, `rv-grip`, `rv-w-edit`), clips (`.ov.editable`, `rv-cgrip`, `rv-off`), the selected stretch (`rv-sel`) and transcription progress (`rv-progress`).
- **Element layer** (`rv-elayer`, `rv-elbox`, `rv-elghost`, `rv-elgrip`, `rv-eltag`): the outline, dashed ghost of the home position, corner grip and name tag with the offset, drawn over the frame. A click selects, a drag moves, the grip scales, and the arrow keys nudge (Shift: 10).
- **Right column** (`rv-side`, `rv-tabs`, `rv-panelbody`, `rv-hint`, `rv-save`, `rv-undo`, `rv-handoff`, `rv-who`): Edits and Comments tabs, the edit cards with a Remove that shows on hover or focus, the Undo and Redo row, and the Save row. `rv-who` in the rail says who made a version.

Keyboard: Space plays, arrows and Shift+arrows step a frame or a second, Home and End jump, S, B and V pick a tool, `[` and `]` mark a stretch at the playhead, Enter snips or cuts, Escape drops the selection, Ctrl+Z and Ctrl+Y undo and redo, and every control above is reachable by Tab. Motion follows the chrome speeds above; nothing on the Review tab animates over 380ms and reduced motion zeroes all of it.

### New reel (operate mode, `web/src/NewReel.tsx`, `web/src/styles.css`)
A single 640px column: heading, a lede, the list of videos in the project (`rv-pick`; each row is a button with the path, the Doto duration and the codec and size, the picked row has an ink left border and paper), then the name form (`rv-name`: label, field, ink Start reel button, and `rv-busy` or `rv-problem` text). Not yet built here: the drop zone (T42) and the brief form (T45); both need the same finish pass once merged.

## Do's and Don'ts

### Do:
- **Do** mark current and pinned state with the ice light and a second cue (shape, text or `aria-current`).
- **Do** set every shot number, timecode, pin number and count in Doto with tabular figures.
- **Do** keep Rubric's motion speeds on the chrome: lift 380ms, shadow 180ms, colour 250ms, press 120ms, one curve `cubic-bezier(.2,.8,.2,1)` (D19), and zero under reduced motion.
- **Do** keep stepping shots, switching sections and keyboard navigation instant.
- **Do** draw every outline, tag and pin in the editor, over the reel, never inside the reel's page.

### Don't:
- **Don't** fill a surface with the ice blue or use it as decoration.
- **Don't** round a corner or use chrome-metal gradients.
- **Don't** add texture other than dot terrain, and only in empty places.
- **Don't** let the element name tag cover the element or the reel's content.
- **Don't** change the neutral dark default. The owner's Appearance choice applies to the full editor.
