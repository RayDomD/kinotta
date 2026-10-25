# Handoff: Auto and Direct, Simple preview, Direction (cloud lane)

## Status

<!-- Keep this block current. -->
- State: in progress (verification running)
- Done: steps 1 to 7 committed on `feat/auto-direct-direction`
- Failed or skipped: none so far

## Where to work

Repo `RayDomD/kinotta`. Start from branch `feat/style-storage` (it holds the style API this work reads) and create `feat/auto-direct-direction`. Push that branch when done. Do not open a pull request and do not merge. The owner pulls it in locally.

Other lanes: `feat/effects-library` (Library page and effects catalogue) and `docs/direction-storyboard` (plans and mockups; read-only for you). Stay out of the Library files (see Scope). If `feat/style-storage` has moved on the remote since this brief was written, rebase on it, do not copy its code.

## Goal

Part of `docs/plans/2026-10-25-direction-and-storyboard.md`. Read the whole Intent, answers 1, 2 and 4 under Open questions, and Phases 2 and 3 (steps 5 to 10). This lane builds what an owner sees: the Auto / Direct choice, Export / Edit after the first cut, and the five-step Direction screen. It reads and writes styles through the API already on `feat/style-storage` (`fetchStyles`, `saveStyle`, `saveDefaultStyle`, `fetchReelStyle`, `copyStyleToReel`; routes under `/api/styles` and `/api/reels/:slug/style`). It does not change how styles are stored.

Mockups to match (on `docs/direction-storyboard`, `docs/mockups/`): `2026-10-25-simple-default-direction.html` (main reference, all five steps and the Check recap), `2026-10-25-start-generate-or-tweak.html`, `2026-10-25-direction-step.html`. The mockups use the older words "Generate now / Tweak first / Open in editor"; the plan's names win: **Auto, Direct, Export, Edit**. Auto and Export are filled buttons; Direct and Edit use the neutral raised panel with a soft border, never greyed out. Use the existing shell and the one light rule in `DESIGN.md`.

## What to do

Do these in order. Commit after each step with a Conventional Commit message. Stop and report if a step needs a decision this brief does not cover.

1. **Make screen** (`web/src/SimpleMode.tsx`, plan step 5): after a video is dropped, show Auto and Direct as two equal choices named as a process. Auto builds straight away with the default style (`defaultId` from `fetchStyles`), or the built-in style that fits the video type before any is saved. Direct opens Direction. A reel with no footage starts from a short brief (keep what `NewReel.tsx` / `BriefReel.tsx` do today).
2. **Server accepts a style** (plan step 7): `POST /api/reels` accepts a style, the reel stores its own copy (use `copyStyleToReel`), and the agent request includes the style and its rules. Keep `MakeOptions` accepted so nothing breaks; map the style onto it for the footage build. The text under "What the agent is told" must come from the same function that builds the request, so the screen and the agent cannot disagree. Add tests next to the existing request tests.
3. **Simple preview** (plan step 6): after the first cut, Export and Edit sit side by side; Edit opens the full editor.
4. **Direction, steps 1 and 2** (plan step 8): new `web/src/Direction.tsx` with the stepper (clickable), the "So far" chips and "Build now with these" on steps 1 to 4. Step 1: What (form, What's it about?, Frame detected from the video; detection only, portrait builds are out of scope). Step 2: Style cards (built-ins and saved), "Start from another reel" (a copy), settings under "Fine-tune the details", changed values marked "yours" (the `yours` field of the style).
5. **Direction, steps 3 and 4** (plan step 9, first half): Fonts in plain words with the brand fonts preselected and labelled "from your brand" (read `reels/brand.md`; the built-in brand is in `skill/kinotta/assets/brand/`); Music row; Extras: effects to try as a plain list of effect ids stored in `style.effects` (do not import the Library files; a picker over the catalogue comes in a later lane) and "Shots and details you want" (`style.shots`).
6. **Check step** (plan step 10): visual recap with one row per decision, thumbnail and Change; "What the agent is told" beside it, including active rules each with a switch to turn it off for this reel; Save as my style (for you or this project).
7. **Own font and music drop** (plan step 9, second half): a drop card in the Fonts and Music rows; files dropped anywhere on Direction are routed by type. Font: sample line, "Use it for: Words / Numbers / Both", copied into the project `fonts/` with a license note. Music: waveform with play and seek, "Cut on its beat / Play under the cut", "Lower it under your voice", saved to project music with a rights note. If this step is too large, stop after steps 1 to 6, mark step 7 skipped in Status, and push.

## Scope

- Touch: `web/src/SimpleMode.tsx`, `web/src/NewReel.tsx`, `web/src/BriefReel.tsx` as needed, new `web/src/Direction*.tsx` and any new files under `web/src/`, `web/src/styles.css` (append a clearly named block; the Library lane also appends there), `web/src/api/_internal/client.ts` (append only), `server/core/` request building and `POST /api/reels` handling, `server/core/_internal/make-options.ts` only to map a style onto it, matching tests under `tests/`, this handoff's Status and Results.
- Do not touch: `server/core/_internal/style.ts` and `skill/kinotta/assets/styles/**` (style storage lane; ask in Results if you need a change), `web/src/Library.tsx`, `server/core/_internal/effects-catalogue.ts`, `skill/kinotta/**`, `web/src/Storyboard.tsx` and `web/src/ShotSheet.tsx` (a separate Storyboard decision is pending), any plan or mockup.
- Do not mention or restate the inline-alternatives decision; it is not part of this lane.
- Stop and report on anything this handoff does not cover. Do not guess.

## Done when

- [ ] Auto builds a first cut in one step after the drop, from the default style or the built-in that fits; Direct opens Direction.
- [ ] A reel started from Direct stores its own copy of the style, and the request shows the style and active rules.
- [ ] Editing a saved style never changes another reel's copy (test).
- [ ] Every Direction step, the Check recap, Save as my style and Start from another reel work in the browser at desktop width and at phone width (state which you ran; screenshots are not a behavior check, so click through).
- [ ] The simple-mode and existing reel-creation paths still work (`MakeOptions` callers unchanged).
- [ ] `npm run typecheck`, `npm test` and the relevant `npm run test:e2e` specs pass; report any failure that also fails on `feat/style-storage`.
- [ ] `git diff --stat feat/style-storage` lists only files in Scope; branch `feat/auto-direct-direction` pushed.

## Results

<!-- Fill in when done: what shipped, what was verified and how, what was skipped, anything outside the brief you noticed. -->
