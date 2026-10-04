# Captions on footage reels (T27): run summary

Date: 2026-10-04. Branch: `feat/storyboard-phase` (local, not pushed). Plan: `docs/plans/2026-10-04-captions.md`.
Ticket: T27 in `docs/tickets.md` (no GitHub issue yet).

## Sample pass first

Three looks rendered on the owner's sample (`Downloads/kinotta-test`, 20 s excerpts, throwaway scripts outside
the repo): A plain phrase, B phrase with the spoken word lit, C word by word. The owner picked B and asked for the
look to stay changeable. Two defects found and fixed in the samples before showing them: B lit two words at once
(estimated word times overlap; now only the latest word that has started), C kept an empty box behind unspoken
words (now a tile per word).

## What shipped

- Plan fields: `"transcript"` (path from the plan) and `"captions"`: `true`, or
  `{ "look": "highlight" | "phrase" | "words", "color": "<hex>" }`. Default look highlight, colour the engine accent.
- `engine/build.py --plan`: phrases from the transcript (up to ~6 words, up to 8 to reach a clause end; breaks at
  pauses over 0.3 s and at clause ends once a phrase has 3 words; short gaps held), each a scene `cap-001`… with one
  element `caption` and a span per word. Look and colour sit on each caption, the caption CSS on the page (only
  when captions are on). Clicks pass through the caption scene except on the caption itself.
- `engine/motion.js` `M.page`: shows caption scenes by time and marks words `said` and the current one `now`.
- `scripts/shots.py`: one `CAPTIONS` overlay over the spoken span.
- Skill section 5 (captions on for footage reels, the looks, fix misheard words in `transcript.json` and list
  them in the hand-over) and section 6 (caption pins), `reference/engine-api.md`, `CONTEXT.md` (Captions).

## Deviations from the plan

- None in scope. The footage sample's committed page was rebuilt because `motion.js` changed (its drift test
  requires it); its shot list is unchanged.

## Checks

- Typecheck clean, `npm test` 159/159 (new `tests/engine/captions.test.ts`), `npm run test:e2e` 80/80 (new
  caption test on a composed page in `engine-compose.spec.ts`).
- Sample reel: "Cloud" corrected to "Claude" in `transcript.json`, captions on, 56 phrases, 13 shots,
  `kinotta check` clean. In the editor: captions in the stills and the enlarged frame with the word lit, `caption`
  among the pinnable elements, one Captions entry in the Overlays lane. Backups of the page and transcript before
  this pass are in `motion/work/`.

## Found on the way

- A change of look or colour changes every section (it is on each caption), so the skill only makes one when a
  batch asks, and says so.
