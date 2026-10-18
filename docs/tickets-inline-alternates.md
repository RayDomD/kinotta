# Tickets: inline alternates card

Preview, play, choose and dismiss a shot's alternates on its Storyboard card. Spec: `docs/plans/2026-10-18-inline-alternates-card.md`. Behaviour mockup: `docs/mockups/2026-10-18-inline-alternates-card.html`.

Work the frontier top to bottom. This is a linear chain.

## T1: Preview an alternate on the card

**What to build:** On a Working parts reel, the card of a shot with two or more alternates lets you change which alternate it shows, without changing the reel. Clicking a dot, or pressing Up or Down with the card focused, switches the still and its frame pins to that alternate. The line reads "N alternates · X in the reel · previewing Y" while the card shows another alternate. Clicking the card, or pressing Enter, opens the shot sheet on the alternate the card is showing.

**Blocked by:** None. It can start immediately.

**Model:** mid

- [ ] Clicking a dot shows that alternate's still on the card and does not open the shot sheet.
- [ ] With the card focused, Up and Down step through the undismissed alternates. The page does not scroll, and Left, Right and the other existing keys are unaffected.
- [ ] The dot in the reel and the dot shown are visibly distinct, and the line text says which alternate is being previewed.
- [ ] Frame pins on the card follow the shown alternate, by the same rule as the shot sheet.
- [ ] Previewing changes nothing on the server: the Working version and the Edits list are unchanged.
- [ ] Opening the sheet from the card shows the alternate the card was showing. The sheet's own strip and keys are unchanged.
- [ ] `Storyboard.verify.ts` reports the shown revision, and its invariants pass in the e2e test.
- [ ] Cards without alternates, and single-page reels, are unchanged.

## T2: Play the shown alternate on hover or focus

**What to build:** Pointing at a card with alternates, or focusing it, plays the alternate it shows in a loop of that alternate's length, starting at the shot's start. Leaving or blurring the card returns it to a still. Only one card in the grid plays at a time, and nothing plays until you hover or focus a card.

**Blocked by:** T1.

**Model:** mid

- [ ] Hovering a card with alternates plays the shown alternate, and the page time advances and loops within that alternate's length.
- [ ] Switching alternates while the card plays restarts playback on the newly shown alternate.
- [ ] Hovering a second card stops the first. At most one player exists in the DOM.
- [ ] Keyboard focus starts playback the same way, and blur stops it.
- [ ] With `prefers-reduced-motion: reduce`, the card shows the still and does not loop.
- [ ] Before any hover, the grid loads exactly the stills it loads today.

## T3: Use and Not this on the card

**What to build:** A card with alternates shows "Use" and "Not this" for the alternate it is showing. Use puts it in the reel as a Working edit: later shots move, and Ctrl+Z undoes it. Not this opens a small reason field on the card. Confirming dismisses the alternate with the reason, which may be empty, and Escape cancels. Neither action applies to the alternate already in the reel or to a frozen version.

**Blocked by:** T1.

**Model:** mid

- [ ] Use adds the existing alternate-choice edit for the shown alternate. The Working version reports it in the reel, the Edits list shows it, and later shots move by the parts rule.
- [ ] Undo restores the previous alternate and shot timing.
- [ ] Not this with a reason adds the existing dismiss edit carrying that reason. The dot leaves the card, and the card shows the alternate in the reel.
- [ ] Escape closes the reason field without an edit, and focus returns to the card.
- [ ] After a dismissal, focus is on the card, not lost.
- [ ] Both actions are disabled for the alternate in the reel and while edits are busy, and they are absent on frozen versions.
- [ ] Clicking an action never opens the shot sheet.
- [ ] The existing alternates browser tests, and the parts and working configs, still pass.
