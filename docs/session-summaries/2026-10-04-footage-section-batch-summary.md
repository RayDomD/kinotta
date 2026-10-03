# Next footage version from a section's comments (T24): run summary

Date: 2026-10-04. Branch: `feat/storyboard-phase` (local, not pushed). Plan:
`docs/plans/2026-10-04-footage-section-batch.md`. Ticket: T24 (#27), criteria ticked in `docs/tickets.md`.

## What shipped

- `SKILL.md` section 6: confirm the `motion/` sources still build `v<n>`, edit only the batch section's
  clips, rules for element, position and word pins, compose `v<n+1>`, `answers.md` for every comment and
  note, shot list last with the section as changed, check, hand over. Section 4 routes footage reels here.
- `engine/build.py --plan`: the engine script loads first and each clip's style and script sit inside
  its scene, so a clip whose motion alone changed counts as a changed section. The footage sample's page
  is rebuilt.
- `tests/engine/batch.test.ts`: a motion-only edit to clip 03 makes v2 with `changedSections`
  `['sync-problem']` and no claim mismatch; a rebuild with no edits changes nothing.

## Checks

- Typecheck clean, `npm test` 149/149, `npm run test:e2e` 77/77 (the pixel test still passes on the new
  page structure).
- Not done: a dry run of section 6 against a pasted batch in the editor. The section-change behaviour is
  covered by the test above; carrying unsent comments forward is the core's existing F4 behaviour.

## Open

- A change to the shared engine (`motion.js`, `base.css`) sits outside the scenes and would not show as
  a changed section.
