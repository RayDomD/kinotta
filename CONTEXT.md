# Kinotta

An editor for motion graphics and footage edits that works with or without AI. You cut and fix a reel
yourself, or an agent builds it inside a project, you comment on it in context, and the agent builds the next
version from your comments.

## Language

### Reels and versions

**Reel**:
One video deliverable inside a project, such as a product showreel or a b-roll edit.
_Avoid_: Video, project, clip

**Version**:
A frozen build of a reel, made by your Save or by an agent from one comment batch, retaining the exact media, transcript and plan it was built from.
Only the newest version of a reel takes comments; older versions can be viewed but not commented on.
_Avoid_: Draft, revision, iteration

**Storyboard**:
A version with every scene built in its final look but not animated, plus a shot list. A reel's first version is always a storyboard, and every version stays one until motion can be reviewed.
_Avoid_: Mockup, sketch

**Shot**:
One storyboard entry: a number, a start time, a title, and a description of what happens.
_Avoid_: Frame, panel, slide

**Section**:
A named stretch of a reel, a few minutes long, chosen by topic from the transcript. It groups shots so a long reel can be reviewed one part at a time.
_Avoid_: Chapter, chunk, part

**Scene**:
A timed piece of a version's page, with a start time and a length.
_Avoid_: Segment, section

**Element**:
A named thing inside a scene that a click can land on, such as a headline, logo or panel.
_Avoid_: Node, layer, component

**Clip**:
A generated graphic with its own timing on the reel, such as animated b-roll or a lower third.
_Avoid_: Footage take, placement, segment

**Source**:
Underlying media used in a reel, such as a video, image or audio recording. The same source can be used more than once and across reels in its project.
_Avoid_: Placement

**Placement**:
One timed use of a source in a reel, independently editable and commentable even when the same source appears elsewhere.
_Avoid_: Source, clip

**Transcript**:
The timed words from a speech source, reused by its placements and retained with each version. An agent plans word-linked graphics against them, and a shot shows the line it covers.
_Avoid_: Subtitles, SRT

**Captions**:
The timed words from the chosen speech placement shown on the reel's frame. Their text and position can be adjusted for that placement without changing another use of the same source.
_Avoid_: Subtitles, burn-ins

**Overlay**:
A clip layered above the main clips, such as b-roll or a lower third.
_Avoid_: B-roll track, layer

**Split screen**:
An arrangement showing different pictures at the same moment in separate regions of the reel's frame.
_Avoid_: Picture-in-picture

**Free layout**:
An arrangement of several source placements in custom regions of the reel's frame, each with its own timing and framing. Regions can overlap, with an order deciding which picture is in front.
_Avoid_: Two-source preset

### Editing

**Agent**:
An AI coding tool that builds versions from the reel's sources, such as Claude. Optional: Kinotta works without one.
_Avoid_: AI, bot, assistant

**Edit list**:
Your unsaved changes to the newest version, kept on disk as operations until you Save or Discard them.
_Avoid_: Draft, changes, pending

**Save**:
Writing the edit list into the reel's sources and building the next version from them.
_Avoid_: Commit, export, publish

**Piece**:
A timed stretch of a video source in the reel's main sequence. A footage reel is an ordered sequence of pieces, with any deliberate gaps between them.
_Avoid_: Clip, segment, take

**Cut**:
A split of one piece into two at a moment, which removes nothing.
_Avoid_: Split, blade, splice

**Snip**:
Removing a stretch of footage so the timeline closes over it.
_Avoid_: Delete, trim, ripple

**Offset**:
A move and scale applied to an element on top of its own animation.
_Avoid_: Nudge, transform, override

### Audio

**Original sound**:
The sound recorded with a footage source, including its speech and background sound.
_Avoid_: Voiceover

**Music**:
Audio added to a reel as its musical background.
_Avoid_: Original sound

**Sound effect**:
Audio added to mark an action or moment in a reel.
_Avoid_: Music, voiceover

**Voiceover**:
Narration added to a reel separately from the sound recorded with its footage. It can be imported or recorded inside Kinotta.
_Avoid_: Original sound

**Solo**:
A preview-only choice that lets you hear one sound in isolation without changing the rendered mix.
_Avoid_: Mute

**Mute**:
An edit that silences a placement in both playback and its rendered version.
_Avoid_: Solo

### Feedback

**Pin**:
The anchor of a comment: a version, a time, and either a position on the frame (plus the element under it when there is one) or a word of the transcript.
_Avoid_: Marker, annotation

**Comment**:
One piece of feedback attached to a pin.
_Avoid_: Note, annotation

**Note**:
Feedback on a whole reel that belongs to no single moment.
_Avoid_: General comment

**Comment batch**:
The comments on one section of a version (or on the whole reel, when it has one section), handed to an agent together to produce the next version.
It can be copied again, with changes, until the next version exists. Only a handed-off batch freezes; unsent comments on sections the next version left unchanged move forward to it.
_Avoid_: Feedback round, export

**Approval**:
Your mark that a version is final. It is a label only: rendering doesn't need it. Several versions of a reel can be approved.
_Avoid_: Sign-off, lock

**Render**:
A video file made from a version: Draft (a quick check of any version), Final (the whole reel as an MP4) or Overlay (the clips and captions with transparency).
_Avoid_: Export, bounce

**Preset**:
The kind of render (Draft, Final or Overlay), which fills in its settings: frame rate, size, quality and audio at cuts.
_Avoid_: Profile, template

### Brand and taste

**Taste list**:
Rules you apply to every reel, which Claude reads before each build. Claude may suggest a rule; only you add one.
_Avoid_: Style memory, preferences

**Brand file**:
The project's record of where its brand sources live, written by Claude on first use and checked by you before any reel is built. It points at the project's design system rather than copying it, and holds your answers only where the project has no source.
_Avoid_: Brand config, brand kit

**Timing contract**:
The rules every version follows so the editor can control time: timed scenes, named elements, and a jump to any second.
_Avoid_: Composition format, spec
