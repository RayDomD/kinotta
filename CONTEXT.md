# Kinotta

A review editor for AI-made motion graphics and footage edits: Claude builds a reel inside a project,
you comment on it in context, and Claude builds the next version from your comments.

## Language

### Reels and versions

**Reel**:
One video deliverable inside a project, such as a product showreel or a b-roll edit.
_Avoid_: Video, project, clip

**Version**:
A frozen build of a reel, produced by Claude from one comment batch. It never changes after it exists.
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
One item on the timeline's video track: either a footage take or a scene.
_Avoid_: Segment, track item

**Transcript**:
The timed words spoken in a reel's footage, saved with the reel. Claude plans b-roll against it, and each shot shows the line it covers.
_Avoid_: Subtitles, SRT

**Captions**:
The transcript shown on a footage reel's page, a phrase at a time, each phrase its own scene with an element named caption.
_Avoid_: Subtitles, burn-ins

**Overlay**:
A clip layered above the main clips, such as b-roll or a lower third.
_Avoid_: B-roll track, layer

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
The comments on one section of a version (or on the whole reel, when it has one section), handed to Claude together to produce the next version.
It can be copied again, with changes, until the next version exists. Only a handed-off batch freezes; unsent comments on sections the next version left unchanged move forward to it.
_Avoid_: Feedback round, export

**Approval**:
Your mark that a version is final. Only an approved version gets rendered.
_Avoid_: Sign-off, lock

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
