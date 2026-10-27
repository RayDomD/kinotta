Reads: `../SKILL.md`, project brand sources and section 1 preflight in `new-reel.md`.
Does: Check installation and set up the project brand.
Writes: `reels/brand.md`, project-root `CONTEXT.md`, and copied brand sources when requested.
Owner's check: Confirm the brand summary.

Paths such as `reference/`, `assets/`, `templates/`, `engine/` and `scripts/` are relative to the skill root, not this stage folder.

Run the installation check in section 1 of `new-reel.md` first. For standalone setup, if `reels/brand.md` exists, report it and stop unless the owner wants to redo it.

For standalone setup, offer four choices in one question: use the `DESIGN.md` and brand files found here; copy a brand from another Kinotta project; type colours and typefaces; or use the built-in brand. If copying, ask for the source project path. Copy its `DESIGN.md` and the in-project files its `reels/brand.md` points at into this project, preserving relative paths, and record the source folder in the brand file. Write `reels/brand.md` in the shape below, show its summary, and set `checked:` to today's date once the owner confirms.

After the brand file is checked, write a project-root `CONTEXT.md` as a location map. Point to the actual brand sources identified in `reels/brand.md`; do not copy their values or list reels. Use this shape:

```markdown
# Project context

This folder is a Kinotta project.

- Brand file: `reels/brand.md`
- Brand sources: [paths to the project’s brand sources]
- Reels: `reels/`
- Footage: `footage/`
- Saved project styles: `reels/styles/`
```

If `CONTEXT.md` already exists, ask the owner before adding a short Kinotta section; never overwrite it. When reached from `/kinotta setup`, the operation ends after the brand file and `CONTEXT.md`. When reached from a new reel, return to `new-reel.md` section 3. References to section 3 below follow this routing.

## Brand file (before any build)

For a new reel, follow the existing brand instructions below. For standalone setup, use the selected choice and confirmation above, then complete the `CONTEXT.md` step.

The **brand file** `reels/brand.md` records where the project's brand sources live. It points at
them and never copies their values (no hex codes, font sizes or copy lifted from a source).

**If `reels/brand.md` exists:**

- `checked:` holds a date: read the file and the sources it points at, then go to section 3.
- `checked: no`: don't build. Show the owner the file's summary and ask them to check it. When they
  say it is right (or tell you what to fix and you fix it), set `checked:` to today's date
  (`YYYY-MM-DD`) and go to section 3.

**If it doesn't exist (first use in this project):**

1. Look for `DESIGN.md` at the project root. If it is missing or empty, use the **built-in brand**
   instead of stopping: `assets/brand/brand.md` in this skill (Geist and Geist Mono, the effect
   templates' default colours; fonts and licenses beside it). Write `reels/brand.md` with
   `- Colour and type: built-in brand (Kinotta assets/brand/brand.md)` as its colour and type
   source, set `checked:` to today's date, and tell the owner in one short message: the reel uses
   Kinotta's built-in brand; to replace it, add a `DESIGN.md` (for example `/impeccable init` then
   `/impeccable document`) and delete `reels/brand.md`, or type their own colours and typefaces.
   If they want to type their own, ask for the colours and typefaces, record their answers in the
   brand file under `## Answers (standing in for a missing DESIGN.md)` in place of the built-in
   brand, and set `checked:` once they confirm. Then continue with steps 2 to 4.
2. Find the other sources: logo files, brand guidelines, voice or tone notes, product context,
   imagery, font files. Look at the root and in folders like `brand-guidelines/`, `Assets/`,
   `context/`, `docs/`. Note what you could not find.
3. Write `reels/brand.md` in this shape:

   ```markdown
   # Brand file

   checked: no

   ## Sources

   - Colour and type: `DESIGN.md`
   - Logo: `Assets/logo.svg` (also `Assets/logo-light.svg` for dark grounds)
   - Guidelines: `BRAND-GUIDELINES.md`, `brand-guidelines/`
   - Voice: `context/voice.md`
   - Font files: `Assets/fonts/`

   ## Answers

   Only for what the project has no source for, in the owner's words.
   ```

4. Summarise the file in chat (what each source is, what is missing) and **stop without
   building**. The owner checks it once. On the built-in brand, summarise it the same way but
   don't stop: it is already checked.

Done when `reels/brand.md` exists with `checked:` set to a date and the `CONTEXT.md` step above is complete, or you have stopped and asked.

