# Kinotta project instructions

## Changes to existing interactions

Before editing an interaction, read the relevant design decision or plan, inspect its implementation, and compare the user's reference with the running UI. Start with `DESIGN.md` and the relevant files under `docs/mockups/` and `docs/plans/`. The user's latest explicit decision takes precedence over older documents.

State the intended behavior in concrete terms: where the interaction happens, what action triggers it, what visibly changes, and whether it changes Working. Distinguish verified existing behavior, documented design, and a proposed change. A screenshot establishes appearance, but does not establish playback, gestures, navigation, or selection behavior.

When those details are materially ambiguous, ask one focused question before making dependent edits. Once the user has answered, continue without asking again. If the requested behavior is clear, proceed directly. While a question waits, carry on with any work that does not depend on it. When a test shows the app is wrong and no answer has come, mark the test `test.fixme` with the reason, open an issue for the fix, and continue.

Match the work to the requested outcome. Animating reel assets, changing editor controls, and updating authoring guidance are different changes. Completing one does not complete the others. Record an out-of-scope finding separately instead of silently expanding the task.

Verify the exact user interaction on the requested surface. Report what the check demonstrated and what remains unfinished. A valid asset or passing backend check does not establish that the editor interaction works.

## Pending owner decision: inline alternatives

The owner confirmed that alternatives should be previewed, switched, and applied directly within one stacked Storyboard shot card, including animated playback. The card retains its alternate count and indication of the option in the reel. The large chooser and playback only in Review do not satisfy this decision.

This is a requested interaction, not a claim that it is implemented. Read `docs/mockups/2026-10-13-alternates-in-storyboard.html` for earlier context, but use the owner's newer inline-card decision when implementing this change. Preserve the existing animated revisions and the fix that makes Review load the chosen Working revision.
