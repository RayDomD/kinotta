# Simple picture pins: blocked investigation

2026-10-21. No feature code shipped. The approved goal still answers the Intent, but implementation stopped at the brief's explicit boundary: if frame picking needs a change in `PagePlayer` or `PictureLayers`, stop and report.

The plan assumes the Review editor's existing frame picker already supplies a hex cursor, hover outline and element name tag. In the running app at `http://localhost:5174`, after Working loaded, enabling Pin and hovering the frame produced a computed `crosshair` cursor and no element outline/name tag. `web/src/stage/_internal/PagePlayer.tsx:362` confirms that its full-frame button sets `cursor: 'crosshair'`, has only a click handler, and calls `hitTest` on click. Reusing this picker alone cannot satisfy the approved hover feedback. No changes were made to that file or to the detailed editor.

Checks completed:

- Inspected the approved plan, DESIGN.md pinning rules, Simple mode mockup/context, implementation and existing e2e coverage.
- Loaded the real Simple studio and waited for its authored page to become ready before capturing `tests/artifacts/simple-picture-pins/before-simple.png` at 1280x800.
- Opened the same reel in the editor, waited for Pin to become enabled, enabled it and hovered the frame. Captured `tests/artifacts/simple-picture-pins/before-editor-pin.png` at 1280x800 and checked the cursor/overlay DOM.
- No pins were saved and no playback/Working edits were made by this investigation.
- Typecheck, build and acceptance e2e were not run: implementation stopped before code edits. No after screenshots exist. No e2e `start-server.mjs` processes were launched; the live app/API were left running.

Footage-only finding: source inspection shows the picker spans the full loaded authored-page container without requiring a visible authored scene. Actual footage-only clicking and any centre/null-element fallback remain unverified; no fallback was implemented.

Deviation: plan status moved from Approved through investigation to Blocked, rather than Done. The required hex cursor and hover feedback need an expanded scope permitting `PagePlayer` changes before implementation can continue. The unavailable `/implement` and `/code-review` skills were reported before proceeding with direct investigation.
