# Handoff: Built-in brand, skill fallback, glossary and ADR (cloud lane)

## Status

<!-- Keep this block current. -->
- State: done, test run pending (see Results)
- Done: steps 1 to 5
- Failed or skipped: none

## Where to work

Repo `RayDomD/kinotta`. Start from branch `docs/direction-storyboard` and create `feat/built-in-brand`. Push that branch when done. Do not open a pull request and do not merge. The owner pulls it in locally.

Two other lanes are working in parallel on `feat/style-storage` (server style storage and built-in styles) and `feat/effects-library` (effects catalogue and Library page). Stay out of their files (see Scope) so all three merge cleanly.

## Goal

Part of `docs/plans/2026-10-25-direction-and-storyboard.md`. Read its Intent bullets "Brand and Style" and "Rules live in a style", answers 3 and 4 under Open questions, and Phase 1 step 2, Phase 6 steps 15 (brand part only), 16 (plan pointer only) and 17.

The point: Kinotta must build for a beginner who has only a video and no `DESIGN.md`. Today `skill/kinotta/SKILL.md` section 2 stops when `DESIGN.md` is missing. It should fall back to a built-in brand.

## What to do

1. **Built-in brand** in `skill/kinotta/assets/brand/`:
   - `brand.md`: the default colours and type for a project with no `DESIGN.md`, in the same spirit as the brand file shape in SKILL.md section 2. Start from the defaults the effect templates already use in `skill/kinotta/templates/effects/shared.css` (`--fx-font`, `--fx-ink`, `--fx-accent`, `--fx-ground`), so built-in brand and templates agree.
   - Fonts: the owner plans to open source Kinotta, so every font file must be redistributable (SIL Open Font License or similar). Add the font files (woff2) and each font's license text beside them, plus a `LICENSES.md` listing name, license, source URL. If `shared.css` names a font that is not OFL, pick an OFL font close to it and say so in Results.
2. **SKILL.md section 2 only**: when `DESIGN.md` is missing or empty, use the built-in brand from `assets/brand/` and tell the owner that it is in use and how to replace it, instead of stopping. Keep the existing "proceed without" answers path as an option for owners who want to type their own colours. Do not change section 3 (taste lists) or any other section; that waits for the style storage lane.
3. **Glossary** in `CONTEXT.md`: add Brand, Style, built-in style, built-in brand, rule, pinned effect, instant pin, agent pin. Match the file's existing format and tone. Definitions come from the plan, not new ideas.
4. **ADR** `docs/adr/0007-pinned-effects-are-comments.md` (check the next free number in `docs/adr/` and match the existing ADRs' format): a pinned effect is a comment with an `effect` id, so it rides the existing batch, Undo, frozen versions and carry-over. Instant pins (no note, nothing picked from the speech) take a separate server path that never reaches the agent runner. Record the alternatives considered (a separate pinned-effects store; always via the agent).
5. **Plan pointer**: in `docs/plans/2026-10-20-simple-mode-flow.md` Phase 6, add one line saying rules now go into the reel's style, not `~/.kinotta/taste.md`, per `docs/plans/2026-10-25-direction-and-storyboard.md` answer 4. Change nothing else in that plan.

## Scope

- Touch: `skill/kinotta/assets/brand/**` (new), `skill/kinotta/SKILL.md` section 2 only, `CONTEXT.md`, `docs/adr/0007-*.md` (new), `docs/plans/2026-10-20-simple-mode-flow.md` (one line), this handoff file's Status and Results.
- Do not touch: `server/**`, `web/**`, `tests/**`, `skill/kinotta/assets/styles/**`, `skill/kinotta/templates/**`, any other plan.
- Stop and report on anything this handoff does not cover. Do not guess.

## Done when

- [ ] `skill/kinotta/assets/brand/` has `brand.md`, the font files, a license file per font and `LICENSES.md`; every font is OFL or equally redistributable (state each license in Results).
- [ ] `git diff docs/direction-storyboard -- skill/kinotta/SKILL.md` shows changes inside section 2 only.
- [ ] `CONTEXT.md` has the eight terms; `docs/adr/` has the new ADR; the simple-mode-flow plan has its one-line pointer.
- [ ] `npm run typecheck` and `npm test` pass (nothing here should affect them; report any failure that also fails on `docs/direction-storyboard`).
- [ ] `git diff --stat docs/direction-storyboard` lists only files in Scope; branch `feat/built-in-brand` pushed.

## Results

- Built-in brand in `skill/kinotta/assets/brand/`: `brand.md` (Geist for words, Geist Mono for numbers and code; colours are the `shared.css` effect tokens, with `--fx-ground` `#181b1d` from the templates' fallback), `fonts/Geist-Variable.woff2` and `fonts/GeistMono-Medium.woff2` (byte copies of `engine/fonts/`), `fonts/OFL-Geist.txt` and `fonts/OFL-GeistMono.txt`, and `LICENSES.md`.
- Fonts: `shared.css` names Geist, which is OFL, so no substitute was needed. Geist and Geist Mono are both SIL Open Font License 1.1, Copyright (c) 2023 Vercel, in collaboration with basement.studio, source https://github.com/vercel/geist-font.
- `skill/kinotta/SKILL.md` section 2: a missing or empty `DESIGN.md` now writes `reels/brand.md` pointing at the built-in brand, already checked, tells the owner it is in use and how to replace it (add a `DESIGN.md` and delete `reels/brand.md`), and continues. Typing their own colours and typefaces stays an option and records answers as before. Step 4 no longer stops on the built-in brand.
- `CONTEXT.md`: Brand, Built-in brand, Style, Built-in style and Rule under "Brand and taste"; Pinned effect, Instant pin and Agent pin under "Feedback".
- `docs/adr/0007-pinned-effects-are-comments.md`, in the format of ADR 0006, with both alternatives.
- `docs/plans/2026-10-20-simple-mode-flow.md` Phase 6: one pointer line.
- Not covered, left as is: the `CONTEXT.md` "Taste list" entry still describes taste lists as rules for every reel; it should change when section 3 moves to styles.
- Checks: `npm run typecheck` passes. `npm test`: see the follow-up line below.
