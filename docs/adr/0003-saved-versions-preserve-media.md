# Saved versions preserve their media content

Versions created with the new media model retain the exact media content they use, even when an originally referenced project file later changes or disappears. We chose reproducible history over retaining only live references, accepting the disk cost while keeping media owned by the project as in ADR 0002. Removing a source from a reel or library leaves saved-version dependencies and disk files intact.
