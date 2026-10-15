# Frozen versions preserve their media content

Final and Overlay renders and comment hand-offs freeze the working reel only when its content differs from the last frozen content. A Draft captures immutable inputs for its queue job without adding a version. Explicit numbered-version renders keep using their exact inputs.

A freeze stages the applied plan, transcript, page, offsets and exact media and graphic dependency bytes, validates the requested boundary, then publishes with one rename. Repeated boundaries and undo back to frozen content reuse the existing version. Missing inputs or failed validation publish nothing.

Working keeps a durable authored base, native input anchor, operations, author names and Undo/Redo history outside version folders. The latest frozen pointer and its content identity are separate from that base. Publication never clears the journal or rewrites authored plans. Its recovery journal distinguishes a committed snapshot from an interrupted stage and retains working history. An agent rebuild consumes operations already included in the frozen snapshot and replays later edits, flagging missing targets.

Frozen media keeps content hashes. Replacing an original under an existing source identity is refused. Removing a source from the reel or library leaves preserved version dependencies and disk files intact. We accept the disk cost at meaningful boundaries while keeping media owned by the project, as in ADR 0002.
