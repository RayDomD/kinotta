# ADR 0007: pinned effects are comments

Status: accepted, 2026-10-25. Not yet implemented; see `docs/plans/2026-10-25-direction-and-storyboard.md`, Phase 5.

An effect dragged onto a Storyboard shot is stored as a comment with an `effect` id. It keeps the comment's frame pin (a position with its shot name and, on a shot with alternates, the alternate the card was showing) and may carry a note. An agent pin is a request, not a Working change, until a build makes it; an instant pin changes Working when it is made, as an undoable edit. "Insert shot" in a gap between shots is a plain comment describing the new shot, with no `effect` id, and always goes to the agent. Effects are not dropped on gaps or the alternates strip (owner decision, 2026-10-26).

Agent pins (an effect that picks words or items from the speech, or any pin with a note) travel in the next comment batch like any other comment. They therefore reuse the hand-off that freezes Working, Undo and Delete, frozen versions, carry-over of unsent comments, parts grouping by shot with its `Rebuild:` line, and the alternates fix that makes Review load the chosen Working revision. All agent pins go to the agent in one run with the next build.

Instant pins (no note, and an effect that needs nothing picked from the speech, such as a title card from the reel title) take a separate server path and are made at once, without waiting for Build. It fills the template with `fill` and the reel style's `--fx-font`, `--fx-ink` and `--fx-accent`, then runs `engine/build.py` locally. That path never imports the agent runner, and a test fails if an instant pin creates an agent job. Writing a note moves an instant pin to the agent path; clearing it moves the pin back.

Alternatives considered:

- A separate pinned-effects store beside comments. Rejected because it would need its own Undo, freeze, carry-over and batch mapping, and each would have to stay in step with the comment versions to keep frozen versions exact and the alternates fix working.
- Always sending pinned effects to the agent. Rejected because effects that need nothing from the speech can be filled locally, and an agent run for them costs tokens and time for no gain in the result.
