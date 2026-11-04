# Kinotta project instructions

## Changes to existing interactions

Before editing an interaction, read the relevant design decision or plan, inspect its implementation, and compare the user's reference with the running UI. Start with `DESIGN.md` and the relevant files under `docs/mockups/` and `docs/plans/`. The user's latest explicit decision takes precedence over older documents.

State the intended behavior in concrete terms: where the interaction happens, what action triggers it, what visibly changes, and whether it changes Working. Distinguish verified existing behavior, documented design, and a proposed change. A screenshot establishes appearance, but does not establish playback, gestures, navigation, or selection behavior.

When those details are materially ambiguous, ask one focused question before making dependent edits. Once the user has answered, continue without asking again. If the requested behavior is clear, proceed directly. While a question waits, carry on with any work that does not depend on it. When a test shows the app is wrong and no answer has come, mark the test `test.fixme` with the reason, open an issue for the fix, and continue.

Match the work to the requested outcome. Animating reel assets, changing editor controls, and updating authoring guidance are different changes. Completing one does not complete the others. Record an out-of-scope finding separately instead of silently expanding the task.

Verify the exact user interaction on the requested surface. Report what the check demonstrated and what remains unfinished. A valid asset or passing backend check does not establish that the editor interaction works.

## Inline alternatives

The owner decided that alternatives are previewed, switched, and applied directly within one stacked Storyboard shot card, including animated playback. The card keeps its alternate count and the indication of the option in the reel. The large chooser and playback only in Review do not satisfy this decision.

This is implemented (`docs/plans/2026-10-18-inline-alternates-card.md`, `web/src/Storyboard.tsx`). It was driven in the running Storyboard on 2026-11-04 against the parts fixture with alternates: hovering a card starts one player and leaving stops it; the dots and the Up and Down keys switch the shown alternate without an edit; Use adds one Working edit, moves later shots and undoes with Ctrl+Z; Not this takes an optional reason and Escape cancels it; clicking the card opens the shot sheet on the shown alternate. Not observed: the playback loop's length, because the fixture's shots are static. Keep the existing animated revisions and the fix that makes Review load the chosen Working revision.

## Render tests for editor and media changes

A change under `web/src/review/**` or `server/core/_internal/media-*` requires `npx vitest run --project render` to pass, or every failure must match an open issue by exact test name. Continuous integration skips the render project, which is why these tests must be verified directly. A failure in a file that already has known failures is still a regression unless that exact test name is tracked in an open issue.
