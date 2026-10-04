# States per clip (T26, K15): run summary

Date: 2026-10-04. Branch: `feat/storyboard-phase` (local, not pushed). Plan:
`docs/plans/2026-10-04-states-per-clip.md`. Ticket: T26 in `docs/tickets.md` (no GitHub issue yet).
Mockup followed: `docs/mockups/2026-10-04-stills-per-clip.html` (grid B, sheet Y).

## What shipped

- `scripts/shots.py`: a plan clip's `stills` gives one shot per state (`05a`, `05b`, … with
  `"clip": "05"`), each with its still and the spoken span to the next state. A clip without `stills`
  writes the same shots as before.
- Kinotta: `Shot.clip`; the grid card shows a dash bar and "2 of 3" for a clip's states; the enlarged
  shot shows the clip's states as small stills between the frame and "Pin an element", and clicking one
  opens it. Arrow keys still step every shot. Core unchanged (shots pass extra fields through).
- Skill section 5 (when to split a clip: a state per settled change, at most one per ~4 s, at most 4 per
  clip) and section 6 (`05b` is clip 05 in that state).
- broll-project sample: clip 02 split into `02a` to `02c`, used by the e2e tests.

## Deviations from the plan

- A state can set its own `still` (seconds into the state). The sample's clip 05 settles 15.4 s into a
  16.1 s clip, which the default still (1 s in, at most half the span) could never reach. A set still is
  used as given and must fall inside its shot; the default keeps the cap. This applies to the clip-level
  `still` too, which no committed sample relies on.

## Checks

- Typecheck clean, `npm test` 154/154, `npm run test:e2e` 79/79.
- `/impeccable critique` (dual agent): 29/40. It found two CSS collisions in the first build, both fixed
  in `4b33b28`: the part bar's rule had landed inside `.secs .pins-badge` (dashes never drew), and the
  strip's `.state` class collided with the empty-state rule (strip stills at 76 px). The e2e tests now
  assert the dashes and strip stills have size. Detector: 0 findings in the new code.
- `/impeccable audit`: 16/20 (accessibility 3, performance 3, responsive 3, theming 4, integrity 3). No
  P0 or P1 open. P3: strip buttons don't announce "2 of 3" or pin counts; the strip loads one page
  iframe per state.
- Sample reel (`Downloads/kinotta-test`, `sample-broll` v1): clips 02 and 05 have three states each at
  the mockup's still times; 13 shots; `kinotta check` clean. The previous shot list is kept at
  `motion/work/shots-v1-before-states.json`.

## Found on the way

- The stylesheet is one global file with short class names, so a new rule can collide with an old one
  silently. Prefix new feature classes.
