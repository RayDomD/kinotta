---
title: Simple pin mode
date: 2026-10-21
status: Done
summary: Pin icon toggles pin mode; click drops a pin with a comment bubble at the pin; no scrubber, no big composer
spec:
---

## Intent

- Problem: Pinning in Simple mode always picks on click, then opens a large "Pin at… / What should change here?" form under the player. A separate "Playhead" range slider sits under the timeline. Both are clutter.
- Why: Owner wants pin -> comment -> list, with nothing in between.
- Proposed outcome: A pin icon turns pin mode on. In pin mode, clicking the picture (or the timeline) drops a pin and a small comment bubble opens at the pin. Enter saves it to Your pins; Esc cancels.
- Affected: `web/src/SimpleMode.tsx`, `web/src/SimpleTimeline.tsx`, `web/src/simple.css`, `web/src/review/_internal/MediaEditor.tsx`, `Review.tsx`, `web/src/stage/_internal/PagePlayer.tsx` (bubble placement only), `tests/e2e/simple-mode.spec.ts`.
- Constraints: Owner decision 2026-10-21: comment bubble sits next to the pin on the picture. Notes stay required. Simple pins still add no Working operations. Detailed editor pin flow unchanged.
- Out of scope: Detailed editor, server, type-and-lanes plan, other Simple plans.
- Open questions: none.

## Goal

In Simple mode: no "Simple playhead" range input and no `sm-composer` form. A pin icon button (aria-pressed) near the player toggles pin mode. Pin mode off: clicking the picture does nothing special and clicking the timeline seeks. Pin mode on: the hex cursor/hover shows; a click pauses, drops the draft pin and opens a bubble beside it with autofocused textarea; Enter saves (Shift+Enter newline), Esc or click-away with empty text cancels. The saved pin appears in Your pins. Pin mode stays on until toggled off (or `P` key).

## Approach

Reuse the existing `simple.onPin` draft + `comments.save` path; move the textarea from the form below into a bubble rendered over the frame at the draft pin's x/y using PagePlayer's existing outside-placement helper. Gate `onFramePick` and timeline pinning on a `pinMode` flag passed through `simple`. Timeline-click pins open the bubble at the pin's timeline marker position over the frame centre (x/y 0.5) as today.

## Steps

1. Add `pinMode` state + pin icon toggle in SimpleMode; pass via `simple` prop.
2. Gate frame pick / hover cursor and SimpleTimeline pinning on `pinMode`; timeline click seeks otherwise.
3. Remove the Simple playhead range input and the `sm-composer` form.
4. Render the comment bubble at the draft pin; Enter/Esc behaviour; save to list.
5. Update empty-state copy ("Turn on the pin, then click the picture").
6. Update e2e tests for the new flow; typecheck, build, e2e (simple, review, pins, alternates); screenshots.

## Risks

- Bubble overflowing the frame edge near borders: use the existing content-aware placement.
- Keyboard `P` clashing with existing shortcuts: check keys map before binding.

## Changelog

- 2026-10-21: Drafted from owner request; bubble-at-pin chosen.
- 2026-10-21: Approved by owner; dispatched to codex.
- 2026-10-21: Implementation started. Preserve the shared picker and detailed pin flow; pass Simple mode's toggle, draft and bubble through Review to PagePlayer. Use existing content-aware placement, then verify mouse/keyboard saving, cancellation and edge placement.
- 2026-10-21: Completed in `422a32d`. Pin icon/P toggles mode; picture/timeline picks open an autofocused bubble beside the draft hex. Enter saves, Shift+Enter adds a line, Esc/empty click-away cancels. Removed the range scrubber and lower composer; timeline supports keyboard seeking. Content-aware placement keeps bubbles in the picture and leaves the draft hex visible. Typecheck/build passed; all 40 simple-mode, review, pins and alternates e2e tests passed. Screenshots in `tests/artifacts/simple-pin-mode/`; session summary records evidence. Goal meets Intent; marked Done.
