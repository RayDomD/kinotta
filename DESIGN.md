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
- **Review meta** (Outfit 400, 11 to 14px): the Review tab is denser than the storyboard. Lane text is 11 to 12.5px (phrases, words, piece labels), tool and tab labels 13 to 14px, and the Edits hint and Working note 12 to 13px. All sit on the meta step; none is smaller than 11px and none is body text.
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
- **Alternates shot card (`.shot.has-alternates`):** the only stacked paper at rest on the grid (`sheet-rest`). Its `.shot-alternates` row holds circular dot buttons (`13px`, `border: 1.5px solid ink-2`) above the card's stretched open button: the alternate in the reel is filled (`ink-2`), and the alternate shown on the card carries a 2px Tally (`light`) outline ring. The label reads `"N alternates · X in the reel"` and appends `" · previewing Y"` while showing another option. Hovering or focusing the card plays the shown alternate in a loop (`PagePlayer`) and returns to a still on leave or blur (staying a still under `prefers-reduced-motion: reduce`). On Working versions, `"Use"` (Tally border and text) and `"Not this"` appear on hover, `:focus-within`, or while the inline `"Why not? (optional)"` reason form (`.shot-alternate-reason`) is open; both actions are disabled when the shown alternate is already in the reel.
- **Comment card:** paper, ink border, sheet at rest, 10px 12px. Number in Doto ice, "Shot 03 · 03.60s", then the element in ice or "position", then the text.
- **Empty state:** dashed hairline box with dot terrain along its bottom edge.

### Inputs / Fields
- **Style:** deep-ground field, hairline border, square corners.
- **Focus:** the border turns ice.

### Navigation
- **Rail rows (reels, sections, versions):** text rows with a 1.6px left border; the current row's border is ice (versions and sections) or ink (reels) and it carries `aria-current` and a text cue ("now", "storyboard", "changed 01", "Waiting").
- **Phase nav:** Storyboard and Review share the same shell. The current phase has an ink underline. Approval and rendering live in Review following the 2026-10-06 Picker merge.

### Pinning (signature)
Over the enlarged frame the cursor is the hex with a centre dot. The element under it gets an ice outline with glow, drawn in the editor, never inside the reel's page, and an ice name tag placed outside the element so it never covers the reel's content. A click drops a saved pin (D25): a small filled hex anchor on the exact spot and an ice tag with the comment number and the start of its text, placed outside the element and off the page's content, joined to the anchor by a hairline. Grid stills show the anchor and a number-only tag, stacked clear of nearby tags. The same number appears in the Pins lane and on the comment card.

### Word row (signature)
Under a footage shot's frame, the spoken words sit in a row at full ink with a few muted context words either side. Hovering or focusing a word outlines it and shows a tag below it with the word and its time; a word pin is a numbered hex above the word.

### Time lanes
Shots, Pins and Overlays share one axis. A shot segment's width is its duration; pins sit at their time side by side; overlays sit at their span; an empty Overlays lane reads "None" over dot terrain. On a multi-section reel a Sections lane of bands sits on top, the current band lit.

### Review tab (operate mode, `web/src/review/review.css`, mockup `docs/mockups/2026-10-05-review-edit.html`)
Picture layout lives in the existing Clip tab. Full-frame, half-frame and inset presets lead into Left, Top, Width and Height percentages, displayed to two decimal places. Crop/Fit applies within the selected region. The selected picture has a Tally outline, a Move picture handle and a corner resize handle over the frame. Numeric fields provide the keyboard path. Bring to front and Send to back work on main pictures and inserts, independently of sequence timing. Several pictures share the frame while authored graphics and captions remain above them.

The Review tab keeps the shell and swaps the grid for a player over time lanes, with Edits and Comments tabs in the right column. Its components are all `rv-`:
- **Player** (`rv-well`, `rv-frame`, `rv-video`, `rv-page`, `rv-problem`): the Gate well around a 16:9 frame at 36vh. The footage or the version page fills the frame; `rv-problem` is a centred message inside it only. `rv-caphandle` and `rv-caphint` are the draggable caption with its hover tag.
- **Transport and tools** (`rv-transport`, `rv-play`, `rv-tc`, `rv-zoom`, `rv-tools`, `rv-tool`, `rv-tools-note`, `rv-snip-go`): play, the Doto timecode, Select (V), Blade (B) and Snip (S) as a toolbar with `aria-pressed`, the lit tool in Tally. With Snip on, a note says how to choose a stretch. `rv-snip-go` is the one filled Tally button, which breaks the One Light Rule on purpose: it is the single action that removes footage.
- **Lanes** (`rv-lanes`, `rv-zoomed`, `rv-plane`, `rv-over`, `rv-win`, `rv-ph`): an overview of the whole reel with a window, then the zoomed lanes sharing one Tally playhead. Footage pieces (`rv-piece`, `rv-joint`), captions (`rv-caps`, `rv-phrase`), words (`rv-words`, `rv-w`, `rv-grip`, `rv-w-edit`), clips (`.ov.editable`, `rv-cgrip`, `rv-off`), the selected stretch (`rv-sel`) and transcription progress (`rv-progress`).
- **Element layer** (`rv-elayer`, `rv-elbox`, `rv-elghost`, `rv-elgrip`, `rv-eltag`): the outline, dashed ghost of the home position, corner grip and name tag with the offset, drawn over the frame. A click selects, a drag moves, the grip scales, and the arrow keys nudge (Shift: 10).
- **Right column** (`rv-side`, `rv-tabs`, `rv-panelbody`, `rv-hint`, `rv-undo`, `rv-handoff`, `rv-who`): Edits and Comments tabs, edit cards that name their author with a Remove that shows on hover or focus, and Undo and Redo. Edits persist in Working as they happen. The Versions rail opens Working by default above numbered frozen versions, with a count of edits since the frozen base. A frozen version disables editing and offers Back to Working. `rv-who` in the rail says who built or what froze a version.

Keyboard: Space plays, arrows and Shift+arrows step a frame or a second, Home and End jump, S, B and V pick a tool, `[` and `]` mark a stretch at the playhead, Enter snips or cuts, Escape drops the selection, Ctrl+Z and Ctrl+Y undo and redo, and every control above is reachable by Tab. Motion follows the chrome speeds above; nothing on the Review tab animates over 380ms and reduced motion zeroes all of it.

### Approval and rendering (operate mode, `web/src/Renders.tsx`)
These are the former Picker components, merged into Review. `rv-actions` beside the title groups Approve or Withdraw, the `rv-approved` state and Render. Approval is an owner label and does not gate rendering. Messages use `pk-message` with status semantics.

The Render popover uses `pk-preset` choices and aligned `pk-settings` fields for frame rate, size, quality and audio at cuts. Draft of Working captures the current reel for that job without creating a version. Final and Overlay freeze Working when its content changed; unchanged content reuses the frozen version. Comment hand-off also freezes Working. There is no Save or Discard step. Rendering an explicit frozen version uses that version. `pk-refusal` announces failed settings, contract refusals and overload warnings. Overload requires a separate acknowledgement. Loading and submission disable the affected action.

The top-bar Renders popover holds the project queue (`pk-queue`, `pk-jobs`, `pk-job`, `pk-bar`) and the current reel's past files (`pk-past`, `pk-renders`, `pk-file`, `pk-actions`). Jobs have progress and Cancel. A ready notice offers Play and Show in folder. MP4 playback uses `pk-video` in Review with a way back to the version. ProRes Overlay offers Show in folder. Popovers keep the existing square borders, theme tokens and keyboard dismissal.

### Start screen (`web/src/SimpleMake.tsx`, `web/src/DropZone.tsx`, mockup `docs/mockups/2026-10-26-start-to-export-flow.html`)
The only start screen, for Simple mode and for the editor's New reel. Its top bar holds KINOTTA and the Reel menu only. The dashed drop zone (`rv-dropzone`) takes dropped files and folders, and holds "Choose files…" and "Choose a folder…". Dropped videos are copied into `footage/` with a progress row each. "Or use a video in this project" picks one in place. A picked video replaces the zone and the list with its card (`dx-video`) and Remove: Remove deletes the copy this screen just made, with its playback copy, unless a reel uses it, and otherwise only clears the pick. "Needs on this machine" (`rv-needs`) closes the column. Starting a reel, or opening one from the Reel menu, returns to the view New reel was opened from.

### Auto and Direct (Simple mode, `web/src/SimpleMake.tsx`, mockup `docs/mockups/2026-10-25-simple-default-direction.html`)
After a video is dropped, two equal `dx-choice` panels sit side by side. **Auto** (`dx-choice-primary`) has an ink fill on the pressed shadow and lifts on hover like the primary button. It cuts in the saved default style. **Direct** has a neutral raised panel (`card-raised`) with a hairline border that turns ink on hover. It opens Direction and is never greyed out, because both paths are promoted. A disabled choice has a dashed border. A reel with no footage starts from "No footage? Start from a short brief". After the first cut, **Export** and **Edit** follow the same pair: Export filled, Edit neutral, opening the full editor.

### Direction (`web/src/Direction.tsx`, `dx-`, mockup `docs/mockups/2026-10-25-direction-step.html`)
Five steps, labelled "Direction · step N of 5": What, Style, Fonts and music, Extras, Check. The `dx-stepper` shows each step as a button with a 2px top rule: ink-2 when done, ice with `aria-current="step"` when current, and any step is clickable. Under it, the "So far" chips (`dx-sofar`) jump back to a decision; a chip the owner changed is ice. Steps 1 to 4 offer "Build now with these". Settings filled in by a style are plain, and a value the owner changed is marked "yours" in ice (`dx-yours`). Style settings fold under "Fine-tune the details". Fonts and music take a dropped file anywhere on the page (`DirectionOwnFiles.tsx`) and show a license or rights note. Step 5, Check (`dx-recap`), has one row per decision with a thumbnail and Change, beside "What the agent is told" (`dx-told`): the exact lines sent to the agent, with each rule switchable off for this reel only. "Save as my style" saves for you or for this project.

### Library (`web/src/Library.tsx`, `library-`, mockup `docs/mockups/2026-10-25-effects-library.html`)
Opened from the top bar. Tabs: Effects, Looks, Camera moves, Transitions and Sounds. Effects lists the 25 templates by category in a grid of cards with a looping preview, what each needs, the forms it works with, a copyable request and favourites. Sounds lists the 17 sounds with their durations in Doto. Looks, Camera moves and Transitions are placeholders. "Your music" and "Add to this reel" are deferred by the owner, so the Library promises only Copy request.

### Pinned effects (Storyboard, `web/src/PinnedEffects.tsx`, `fx-`, ADR 0007, mockup `docs/mockups/2026-10-26-pinned-effects-behaviour.html`)
The Effects drawer (`fx-drawer`) holds draggable effect cards (`fx-choice`, grab cursor). Dragging over a frame shows a footprint, "Pin effect here" (`fx-footprint`). A drop leaves a numbered hex anchor (`fx-anchor`, filled ice) at the spot. An agent pin keeps its footprint, labelled "<effect> - planned", until it is built. Each pin has a pin card (`fx-pin-card`) with the Doto number in ice, the effect name, "Shot N" and, on a shot with alternates, the alternate shown. The card status reads "Instant · free · Done", "Needs the agent · Waiting for Build" or "Sent to your agent", and the card holds the note field and Delete. Only frames accept drops. The gap between shots (`fx-gap`) is a dashed vertical "Insert shot" button that opens a dashed form (`fx-insert-form`) describing the new shot. After a built pin note, `fx-keep` asks "Keep this note in this reel's style?" with "Always for this reel" and "Only this version". On a phone, pins and cards show with Delete and Undo, and the drawer says "Adding effects needs a computer." Adding an effect is drag only for now. A keyboard path, like "Pin an element", is a recorded follow-up.

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
