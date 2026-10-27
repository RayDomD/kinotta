Reads: `../SKILL.md`, the saved comment batch and exact frozen version; section 1 preflight in `new-reel.md`, plus sections 2-3 when this procedure calls for brand/style checks. For footage, read the look guidance in section 5 of `footage-reel.md`.
Does: Apply supported mechanical edits to Working, rebuild only requested parts, or follow section 4 (code-only) or section 6 (footage) below.
Writes: Durable Working operations, requested immutable shot revisions and manifest, or `v<n+1>` with answers and `shots.json` last, as the chosen path requires.
Owner's check: Review Working edits in Edits, choose alternatives in Storyboard, or review the next version and its answers in Kinotta.

Paths such as `reference/`, `assets/`, `templates/`, `engine/` and `scripts/` are relative to the skill root, not this stage folder. Numbered section references use the original section numbers: sections 1-3 are in `new-reel.md`, section 4 and section 6 in `04-next-version.md`, and section 5 in `footage-reel.md`. Shared hard rules and "Who built it" are in `../SKILL.md`.

Follow [alternates.md](alternates.md) for parts batches and alternates.

For a picture rebuild from a batch, use the exact frozen version named in the batch as your starting point. Later owner edits are already collecting in Working and will replay onto your new version. Do not apply those edits yourself or copy the journal into the build.

## Small changes to Working

Follow [edit.md](edit.md) for small changes to Working.

## 4. Build the next version from a batch

A pasted batch looks like this:

```
Kinotta comments: Brand intro, v1
Saved as reels/brand-intro/v1/comments.json

1. Shot 02, 03.00s, headline: make this darker
2. Shot 04, 09.50s, position 40% 62%: too busy

Notes
- Shorter overall

Contract issues
- shot 04: starts at 9s but no scene covers that time
```

On a footage reel (its `reel.json` names footage), follow **section 6** instead of the steps below.

1. **Read the batch file** named on the `Saved as` line. It holds each comment's shot, time and
   target, the notes, and, when the owner included them, the contract `issues`. A comment's target
   is an `element` name, or a position (`x`, `y` as fractions of the frame) when `element` is null.
   On a footage reel it can be a `word` of the transcript instead. On a reel with sections the file
   is `comments-<section>.json` and the batch covers that section only.
2. **Confirm `v<n>` is the newest version.** If `v<n+1>` already exists, stop and ask.
3. **Check the brand file as in section 2.** If it says `checked: no`, ask instead of building.
   Then read the reel's style, rules and brand sources as in section 3.
4. **Copy** `reels/<slug>/v<n>/` to `reels/<slug>/v<n+1>/`, leaving out `shots.json`,
   `answers.md`, `edits.json` and every `comments*.json`. Never write into `v<n>`. The copy keeps
   `kinotta-edits.css` and the `<link>` to it in `index.html`: the owner's moved and scaled elements on a
   code-only reel live there, so `v<n+1>` carries `v<n>`'s file (change a rule only when a comment asks for
   that element to move). Never drop the link or the file.
5. **Edit `v<n+1>`** to answer each comment and note. Keep `data-scene` and `data-el` names for
   anything that is still the same thing, so the editor can compare versions; give a new name only
   to something new. On a reel with sections, change only the section the batch covers.
6. **Write `v<n+1>/answers.md`**, one entry per comment in the batch's numbering, then the notes:

   ```markdown
   # Answers to v1 comments

   1. Done. Shot 02 headline: darkened to the deep ink from DESIGN.md.
   2. Partly done. Shot 04: removed the second card; kept the price tag, which the brief needs.
   3. Done. Shot 05 animation: added seek-driven motion that plays and scrubs in Review.

   Notes
   - Done. Cut shot 06; the reel is 13s.
   ```

   Each entry starts with **Done**, **Partly done** or **Not done**, and the last two give the reason.
   Fix every listed contract issue too, and add a line for each under `Contract issues`.
7. **Write `v<n+1>/shots.json` last**, with the updated shots, `changedSections` listing the ids
   of the sections you changed (a reel with no `sections` has one, id `reel`), and `builtBy` set to
   your own agent name (see "Who built it" in `../SKILL.md`).
8. **Check it**: `kinotta check <slug>`, fix, repeat until clean.
9. **Hand over**: repeat the answers list in chat, and say Kinotta will show `v<n+1>` as ready.

Done when `v<n+1>` passes `kinotta check`, `answers.md` answers every comment and note, and `v<n>`
is unchanged.

## 6. Next footage version from a section batch

A footage reel's batch covers one section, from `comments-<section>.json`. You rebuild only that
section's clips from the sources in `motion/` and carry every other section over unchanged. Kinotta
works out which sections changed by comparing each section's scenes and shots with the version
before, and moves every unsent comment forward by itself, to the same moment of the footage in the new version.

1. **Read the batch file** and confirm `v<n>` is the newest version, as in section 4 steps 1 and 2.
   Read the reel's style (`reels/.kinotta/<slug>/style.json`), treating its `rules` as kept notes and
   any `direction` in the request as the owner's ask; a missing reel style falls back to the built-in style
   that fits the video type. The look follows section 5.
2. **Confirm the sources build `v<n>`.** Compose the plan (see "The plan" below) into a scratch file and compare it
   with `reels/<slug>/v<n>/index.html`. If they differ, the sources changed since `v<n>`: stop and ask.
3. **Answer each comment in the batch's section only.** Edit only the clips whose `section` is the
   batch's (their fragments in `motion/clips/` and their entries in the plan). The shot
   number is the clip's `id`; a state's number (`05b`) is its clip's `id` plus a letter, so the comment
   is about clip 05 in that state (its `stills` entry gives the clip-local time). By pin kind:
   - **Element pin** (`element` set): change that element of that clip. The name is the element's `id`;
     keep it for the same thing.
   - **Position pin** (`element` null, `x` and `y` as fractions of the frame): on a panel shot the point
     is usually on the footage around the clip, so read it as placement (move or resize the panel to
     clear that spot) or as a remark about the video itself. You can't change the video: answer Not
     done and say so. On a cutaway the point is on the clip's own canvas: change what is drawn there.
   - **Caption pin** (`element` is `caption`): about the caption said at the shot's time. Fix a wrong
     word in `transcript.json` (only words inside the batch's section). A phrase breaks at pauses and
     clause ends, so a comma or full stop added to a word moves a break. A change of look or colour is
     the plan's `captions` and changes every section, so do it only when the batch asks and say so.
   - **Word pin** (`word` set, with its time): about that spoken moment. Move the clip's change onto
     the word (clip-local time = word time − the clip's `in`), start or end the clip there, or show the
     word's idea, whichever the comment asks.
   Never change another section's clips, their `in` and `out`, or the section bounds. A new clip takes
   the next unused number; never renumber existing clips.
4. **Compose** `v<n+1>`: `python3 $SKILL/engine/build.py --plan <plan> reels/<slug>/v<n+1>/index.html`.
   The page is self-contained, but the version also keeps what it was built from (step 5).
5. **Keep what `v<n+1>` was built from** (every version has its own copy, so the owner can open any
   version and see what it was made of):
   - `v<n+1>/transcript.json`: a copy of the transcript the plan names, with your word fixes in it.
   - `v<n+1>/plan.json`: a copy of the plan you composed from, with `transcript` set to `"transcript.json"`
     and the other relative paths (`video` and each clip's `clip` fragment) rewritten so they reach the same
     files from the version folder. Nothing else about the plan changes: `pieces`, offsets, caption positions
     and `slid` stay as they are.
6. **Write `v<n+1>/answers.md`** as in section 4 step 6: every comment in the batch's numbering, then
   the notes, each Done, Partly done or Not done with a reason.
7. **Write the shot list last**, naming the batch's section as changed:
   `python3 $SKILL/scripts/shots.py <plan> reels/<slug>/v<n+1>/shots.json --built-by <name> <section>`.
8. **Check it**: `kinotta check <slug>`; fix, compose and write the shot list again until clean.
9. **Hand over**: repeat the answers in chat, and say Kinotta will show `v<n+1>` as ready with only
   that section changed.

### The plan

The version named in the batch holds the owner's applied edits in its own plan and transcript. Start a picture rebuild from those exact inputs, rebasing their preserved paths from that version folder. The authored `reels/<slug>/plan.json` or `motion/plan.json` may predate live edits. Never assume it contains the frozen result. Keep these fields exactly as you find them when
you rebuild; losing one undoes an edit the owner made:

- `media`: keep the sources, placement identities, sequence, tracks, track assignments, regions,
  framing, envelopes, attachments and occurrence-specific words. Follow `reference/native-media.md`
  when changing any of these or preserving native sources in a new version.

- `pieces`: `[{ "in", "out" }, …]`, the stretches of the video the reel is made of, in reel order. The
  plan's times (clip `in` and `out`, words, sections) stay in **source** time; `build.py` and `shots.py`
  put them on the reel's timeline themselves. Don't move a clip or a word across a snip by hand.
- `offsets` on a clip: `{ "<element>": { "x", "y", "scale" } }`, the owner's moves and scales of an element,
  with `@clip` standing for the clip's root. Keep the entry for any element you keep; if you rename or
  remove the element, drop its entry and say so in `answers.md`. Never bake an offset into the clip's code
  and leave the entry behind: it would apply twice.
- `captions.position` (`{ "x", "y" }`) and `captions.phrases` (`[{ "at", "x", "y" }]`, `at` the first word's
  source start): where the owner moved the captions. Keep both, and keep `look` and `color` beside them.
  Don't change a phrase's first word's time unless a comment asks; the position follows the word.
- `slid: true` on a clip: the owner slid it off its words. When you re-sync that clip to its words (a word
  pin or a comment asks, or you move its `in` and `out` back onto the words it was written for), delete
  `slid` from the clip. Leave `slid` alone on every clip you don't re-sync.
- Trimmed clips (`in` and `out` the owner set) and a clip's `stills` states stay unless a comment asks to
  change them.

Don't write these fields yourself unless a comment asks for the change they hold.

Done when `v<n+1>` passes `kinotta check`, `answers.md` answers every comment and note, only the
batch's section changed, and `v<n>` is unchanged.
