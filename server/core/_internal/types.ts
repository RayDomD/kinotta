import type { CaptionsPlan, ElementOffset, NewOperation, Operation, PlanClip } from './edit-model.ts';
import type { PlacedPiece } from './pieces.ts';

export interface ReelSummary {
  /** Folder name under reels/. */
  slug: string;
  /** reel.json title, falling back to the slug. */
  title: string;
  /** Highest vN folder, or null when the reel has no versions yet. */
  newestVersion: number | null;
  /** Newest mtime (ms since epoch) of any file inside the reel. */
  lastChange: number;
  /**
   * Set on a reel started from a brief: the brief, and the request that was copied for building it. The reel is
   * waiting while `newestVersion` is null.
   */
  brief?: { text: string; request: string };
}

export type ReelsState = 'ok' | 'no-reels-folder' | 'no-reels';

export interface ReelListing {
  state: ReelsState;
  /** Newest change first. Empty unless state is 'ok'. */
  reels: ReelSummary[];
}

export interface Shot {
  /** Two-digit string, "01". */
  number: string;
  /** Seconds. */
  start: number;
  /** Seconds, running to the next shot's start (or the reel duration for the last shot). */
  duration: number;
  title: string;
  description: string;
  /** Footage reels only, passed through as parsed. */
  section?: string;
  type?: string;
  line?: { start: number; end: number };
  /** Footage reels with a readable transcript: the words whose start falls inside `line`. */
  words?: TranscriptWord[];
  /** The words of `words` joined with spaces, the shot's spoken line. */
  spoken?: string;
}

export interface TranscriptWord {
  text: string;
  /** Seconds. */
  start: number;
  end: number;
}

export interface Overlay {
  kind: string;
  name: string;
  start: number;
  end: number;
}

export interface Section {
  id: string;
  name: string;
  start: number;
  end: number;
  /** How many of the version's shots belong to this section. */
  shots: number;
  /** Set on the one section a reel gets when shots.json declares none. */
  implicit?: true;
  /** Handed off to an agent on this version, or on an earlier one that no version since has changed this section in. */
  waiting?: true;
}

/** One way a version breaks the timing contract (ADR 0001). The message is plain words and complete on its own. */
export interface ContractIssue {
  code: string;
  /** Shot number, when the problem belongs to one shot. */
  shot?: string;
  /** Scene name, when it belongs to one scene. */
  scene?: string;
  message: string;
}

export interface Version {
  number: number;
  isNewest: boolean;
  /** Seconds. */
  duration: number;
  shots: Shot[];
  /** Empty when the version has none. */
  overlays: Overlay[];
  /** Never empty: a reel without declared sections has one implicit section. On a reel with sections every shot names its own. */
  sections: Section[];
  /** Static contract problems, in reading order. Empty for a version that keeps the contract. */
  issues: ContractIssue[];
  /**
   * Sections whose contents differ from the version before, or that the version's shots.json claims changed.
   * Computed from v2 on; v1 passes the claim through.
   */
  changedSections?: string[];
  /** Sections the claim and the comparison disagree on: claimed changed but identical, or the reverse. */
  claimMismatch?: string[];
  /** Footage reels only: the footage file named in reel.json, which stays where it is in the project. */
  footage?: { path: string; exists: boolean };
  /** Footage reels only: the pieces of the video the reel plays, in play order, with where each starts on the timeline. One piece over the whole video when the plan has none. */
  pieces?: PlacedPiece[];
  /** Footage reels only: the timed words of the version's transcript.json, on the reel's timeline (a word in a snip is gone). Absent when it is missing or unreadable. */
  transcript?: TranscriptWord[];
  /** Footage reels only: why there is no transcript. */
  transcriptProblem?: string;
  /** Footage reels only: the `captions` of the version's plan (`true`, or the look, colour and caption positions). Absent when captions are off. */
  captions?: true | CaptionsPlan;
  /** Footage reels only: the clips of the version's plan, in source seconds, with their `slid` flag. Absent when the version has no plan. */
  clips?: PlanClip[];
  /** Who made the version: `you` for one Kinotta built, else an agent's name. Absent on versions that do not say. */
  builtBy?: string;
  /**
   * Code-only reels only (no footage, no plan): the names of the page's scenes, and the element offsets its `kinotta-edits.css`
   * holds, by scene then element (`@clip` is the scene itself). Only these can be edited.
   */
  code?: { scenes: string[]; offsets: Record<string, Record<string, ElementOffset>> };
  /** Set when the version has no shots: the request to copy for b-roll over its transcript. */
  brollRequest?: string;
}

/** One row of a reel's version rail. */
export interface VersionEntry {
  number: number;
  isNewest: boolean;
  /** v1 in this phase. */
  isStoryboard: boolean;
  /** Reels with several sections only, from v2 on: the ids of the sections this version changed. */
  changedSections?: string[];
  /** Who made the version, as its shots.json says. */
  builtBy?: string;
  /** The version has an `approval.json`: it is final. */
  approved: boolean;
}

/** What approving a version returns. `warning` names the contract issues an approved version still has (R10). */
export interface Approval {
  approved: true;
  /** When the version was first approved, as an ISO time. */
  at: string;
  warning?: string;
}

/** What withdrawing an approval returns. */
export interface Withdrawal {
  approved: false;
}

/** A render's named defaults (R2): Draft is a quick check of any version, Final and Overlay are the deliverables. */
export type RenderPreset = 'draft' | 'final' | 'overlay';

export interface RenderRequest {
  reel: string;
  version: number;
  preset: RenderPreset;
  /** How a footage reel's audio joins at a cut (R9): about 20 ms fades (`smooth`, the default) or none (`hard`). */
  audio?: 'smooth' | 'hard';
}

/** One render in the project's queue. Held in memory: a restart forgets it (R8). */
export interface RenderJob {
  id: string;
  reel: string;
  version: number;
  preset: RenderPreset;
  state: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  /** From 0 to 1. */
  progress: number;
  /** Seconds left, an estimate; null until there is progress to base it on. */
  remaining: number | null;
  /** The finished file, relative to the project folder with `/` separators. Set when `state` is `done`. */
  output?: string;
  /** Why it failed, when `state` is `failed`. */
  error?: string;
}

/** What `Project.subscribe` reports. */
export type ProjectEvent =
  | { type: 'version-added'; reel: string; version: number }
  | { type: 'reels-changed' }
  | { type: 'comments-changed'; reel: string; version: number }
  | { type: 'approval-changed'; reel: string; version: number; approved: boolean }
  | { type: 'transcription-progress'; reel: string; progress: TranscriptionProgress }
  | { type: 'render-progress'; job: RenderJob };

/** How a reel's background transcription stands. `remaining` is an estimate in seconds, null until there is progress to base it on. */
export interface TranscriptionProgress {
  state: 'running' | 'done' | 'failed';
  /** Seconds of audio in the video. */
  duration: number;
  /** Seconds of it transcribed so far. */
  processed: number;
  remaining: number | null;
  /** Why it failed, when `state` is `failed`. */
  error?: string;
}

export interface Project {
  /** The project folder's name. */
  name: string;
  /** Absolute path of the project's reels/ folder. */
  reelsDir: string;
  listReels(): Promise<ReelListing>;
  /** Reads a version's shot list. Throws `KinottaError` (`not-found` or `invalid`). */
  readVersion(slug: string, number: number): Promise<Version>;
  /** A reel's version folders, oldest first. Throws `KinottaError` `not-found` for an unknown reel. */
  listVersions(slug: string): Promise<VersionEntry[]>;
  /**
   * Calls `listener` when a version with a shots.json appears, a reel appears or goes, a version's saved
   * comments change, or a version's `approval.json` appears or goes. Debounced and de-duplicated. Returns the unsubscribe function; watching stops with the last one.
   */
  subscribe(listener: (event: ProjectEvent) => void): () => void;
  /** Absolute path of the reel's footage file, or null (code-only reel, file missing, or a path outside the project). */
  footageFile(slug: string): Promise<string | null>;
  /** A version's comments in number order. Throws `KinottaError` for an unknown reel or version. */
  listComments(slug: string, number: number): Promise<Comment[]>;
  /**
   * Saves a pinned comment to the editor's working state. Throws `KinottaError` `invalid` for empty text,
   * an unknown shot or a position outside the frame, `not-found` for an unknown reel or version, and `frozen`
   * for a version that is not the newest.
   */
  addComment(slug: string, number: number, input: NewComment): Promise<AddedComment>;
  /**
   * Changes a comment's text; its pin stays. Throws `KinottaError` `invalid` for empty text, `not-found` for an
   * unknown reel, version or comment id, and `frozen` for a version that is not the newest.
   */
  editComment(slug: string, number: number, id: string, text: string): Promise<AddedComment>;
  /** Removes a comment and its pin; the rest are renumbered without gaps. Same errors as `editComment` except `invalid`. */
  deleteComment(slug: string, number: number, id: string): Promise<CommentList>;
  /** The note on the whole reel for a version; an empty string when there is none. */
  readNote(slug: string, number: number): Promise<string>;
  /**
   * Sets the version's note on the whole reel (trimmed; an empty string clears it). Throws `invalid` for a note longer
   * than 4000 characters and `frozen` for a version that is not the newest.
   */
  setNote(slug: string, number: number, note: string): Promise<NoteSaved>;
  /**
   * Writes the version's comment batch to `reels/<slug>/v<n>/comments.json` (replacing any earlier copy) and
   * returns the pasteable text. A reel with several sections needs `sectionId`: the batch is then that section's
   * (`comments-<sectionId>.json`) and the section counts as waiting on an agent. Throws `KinottaError` `invalid` when there are no comments and no note, and `frozen`
   * for a version that is not the newest.
   */
  copyBatch(slug: string, number: number, options?: BatchOptions): Promise<CopiedBatch>;
  /** The project's videos (outside reels/) with length, codec and size. */
  listVideos(): Promise<VideoEntry[]>;
  /**
   * Starts a reel from a video in the project, which stays where it is: writes the reel and its plan and returns at once.
   * Transcription then runs in the background (see `transcriptionProgress`); when it ends the transcript, the captions and the
   * sections are written and v1 is built with `builtBy: "you"`. Until then the reel has no version, its footage plays and
   * edits collect. Throws `KinottaError` `invalid` for a path that is not a video in the project and `not-found` for a missing
   * file. A transcription or build failure leaves the reel without a version and is reported by `transcriptionProgress`.
   */
  startReel(input: NewReel): Promise<StartedReel>;
  /** How the reel's transcription stands, or null when none has run since the server started. Changes arrive as `transcription-progress` events. */
  transcriptionProgress(slug: string): TranscriptionProgress | null;
  /** Resolves when the reel's transcription and v1 build have ended (done or failed); at once when none is running. */
  whenTranscribed(slug: string): Promise<void>;
  /** The reel's unsaved edits (empty when there are none). */
  readEditList(slug: string): Promise<EditList>;
  /**
   * Adds an operation to the edit list and writes the list to the reel folder. Throws `invalid` for an operation that does
   * not apply (a snip outside the footage, one already cut out, one that would remove everything) and `frozen` for a list
   * made on an older version.
   */
  addOperation(slug: string, operation: NewOperation): Promise<EditList>;
  /**
   * Drops one operation by id and keeps the later ones (the result is worked out again from the rest). Throws `not-found`
   * for an unknown id, `invalid` when the remaining operations no longer apply, `frozen` for a stale list.
   */
  removeOperation(slug: string, id: string): Promise<EditList>;
  /**
   * Steps the edit list back to before its last change (an add or a removal), or forward again with `redoEdit`. Both
   * histories are kept in `edit-list.json`, so they survive a reload. Throws `invalid` when there is nothing to step to.
   */
  undoEdit(slug: string): Promise<EditList>;
  redoEdit(slug: string): Promise<EditList>;
  /** Drops the edit list, with its undo and redo history. */
  discardEdits(slug: string): Promise<EditList>;
  /** Ends the hand-off a copied batch started, so Save is allowed again. Does nothing when no batch is out. */
  cancelHandoff(slug: string): Promise<EditList>;
  /**
   * Builds the next version from the edit list with no agent: writes the operations into the reel's plan and transcript,
   * builds `v<n+1>` (with its own plan and transcript, `edits.json`, `changedSections`, `builtBy: "you"`) and clears the
   * list. Throws `invalid` for an empty list, a batch that is out or a build that fails, in which case there is no new
   * version, the sources are as they were and the list is kept.
   */
  saveEdits(slug: string): Promise<SavedVersion>;
  /**
   * Brings a dropped video into `<project>/footage/`, streaming `body` to disk. A file already there with the same
   * content is reused (`copied: false`). An HEVC or ProRes video also gets an H.264 playback copy, which
   * `footageFile` serves; the original is never altered. Throws `KinottaError` `invalid` for a name that is not a
   * video extension or a file that is not a readable video.
   */
  importVideo(name: string, body: AsyncIterable<Uint8Array>): Promise<ImportedVideo>;
  /**
   * Starts a reel from a short brief: writes `reel.json` with the title and the brief, and returns the request to give
   * whoever builds it. The reel has no version (it is waiting) until a version with a shots.json appears. Throws
   * `KinottaError` `invalid` for an empty title or brief.
   */
  startReelFromBrief(input: NewBriefReel): Promise<StartedBriefReel>;
  /**
   * Marks a version final by writing `v<n>/approval.json` (`{ approvedBy: "you", at }`); nothing else in the version changes,
   * and approving again keeps the first time. A version with contract issues is approved with a `warning` naming them.
   * Only the editor's HTTP API calls this; `kinotta` has no approve command (R17). Throws `not-found` for an unknown reel or version.
   */
  approveVersion(slug: string, number: number): Promise<Approval>;
  /** Deletes the version's `approval.json`; renders already made stay. Throws `not-found` for an unknown reel or version. */
  withdrawApproval(slug: string, number: number): Promise<Withdrawal>;
  /**
   * Queues a render and returns the job as queued; it runs after the jobs before it, one at a time, and reports through
   * `render-progress` events. Throws `not-found` for an unknown reel or version, and `invalid` for a render this build
   * can't make (for now, anything but a Draft of a code-only reel).
   */
  render(request: RenderRequest): Promise<RenderJob>;
  /** The jobs waiting or running, in queue order. */
  renderJobs(): RenderJob[];
  /** Resolves with the job once it is done, failed or cancelled. Throws `not-found` for an unknown job. */
  whenRendered(jobId: string): Promise<RenderJob>;
  /**
   * Cancels a render (R8): a queued job is dropped at once; a running one has its processes stopped and its temp output and
   * `renders/.work-<job>/` removed, and this resolves once they are gone. A finished job comes back unchanged. Throws
   * `not-found` for an unknown job.
   */
  cancelRender(jobId: string): Promise<RenderJob>;
}

/** A reel's unsaved edits: operations on named targets, in the order they were made. */
export interface EditList {
  /** The version the edits are against: the newest when they were made. */
  base: number;
  operations: Operation[];
  /** Undo has a list to step back to. */
  canUndo: boolean;
  /** Redo has a list to step forward to (a new change ends it). */
  canRedo: boolean;
  /** The list was made on a version that is no longer the newest; it cannot take edits or be saved. */
  stale?: true;
  /** A comment batch is out for the newest version: Save is blocked with this reason until the next version or `cancelHandoff`. */
  handedOff?: { version: number; copiedAt: string; reason: string };
  /**
   * Operations that no longer apply to the version they were replayed onto, by id, with the reason. They stay in the list so
   * the owner can drop or redo them; they are left out of the preview, and Save is blocked while any remain.
   */
  flagged?: Record<string, string>;
}

export interface SavedVersion {
  /** The number of the version Save built. */
  version: number;
}

export interface ImportedVideo {
  /** Relative to the project folder, with forward slashes: where the video is, whether just copied or already there. */
  path: string;
  /** False when an identical file was already in footage/ and the dropped one was discarded. */
  copied: boolean;
  /** True when this video has an H.264 copy for playback (HEVC or ProRes). */
  playbackCopy: boolean;
}

/** A reel started from a brief instead of a video. */
export interface NewBriefReel {
  title: string;
  brief: string;
}

export interface StartedBriefReel {
  slug: string;
  /** The request naming the reel and the brief, ready to paste. */
  request: string;
}

/** What a batch covers, and what the editor adds to it beyond the comments. */
export interface BatchOptions {
  /** On a reel with several sections: the section to copy. Required there, ignored on a one-section reel. */
  section?: string;
  /** Add the contract issues to the batch text and file: the version's static ones plus `runtimeIssues`. */
  includeIssues?: boolean;
  /** Problems only the browser can see, such as a page with no seek(). Plain-word messages. */
  runtimeIssues?: string[];
}

export interface CopiedBatch {
  /** What to paste to an agent: reel, version, each comment as shot, time, element: text, notes, saved path. */
  text: string;
  /** Where the batch was saved, relative to the project root with forward slashes. */
  file: string;
  count: number;
}

/** What the caller supplies for a frame pin; the core fills in the rest. */
export interface NewFramePin {
  /** Omitted for a frame pin. */
  kind?: 'frame';
  /** Shot number, "03". */
  shot: string;
  /** Fractions of the frame, 0 to 1. */
  x: number;
  y: number;
  /** The clicked element's `data-el` name, or null for a position-only pin. */
  element: string | null;
}

export interface FramePin {
  kind: 'frame';
  version: number;
  /** The shot's section, or null. */
  section: string | null;
  shot: string;
  /** The shot's start, in seconds. */
  time: number;
  /** Fractions of the frame, rounded to 3 decimals. */
  x: number;
  y: number;
  element: string | null;
}

/** What the caller supplies for a word pin: a word of the shot's spoken line, by its start time and text. */
export interface NewWordPin {
  kind: 'word';
  /** Shot number, "03". Empty on a version with no shots: the pin then belongs to the transcript. */
  shot: string;
  /** The word's start, in seconds. */
  time: number;
  /** The word as the transcript spells it. */
  word: string;
}

/** A comment pinned to a spoken word. The core stores the transcript's own text and time for it. */
export interface WordPin {
  kind: 'word';
  version: number;
  /** The shot's section, or null. */
  section: string | null;
  shot: string;
  /** The word's start, in seconds. */
  time: number;
  word: string;
}

export interface Comment {
  id: string;
  /** 1-based position in the version's comments, ordered by pin time then creation. The number shown everywhere. */
  number: number;
  pin: FramePin | WordPin;
  text: string;
  /** ISO 8601. */
  createdAt: string;
  /** Copied to an agent in its section's latest batch. */
  sent?: true;
  /** Once a newer version has settled: this unsent comment moved on to it. */
  carried?: { to: number };
  /**
   * Set when the comment's moment was snipped out of the footage: its text is kept, its pin sits where the snip closed up,
   * and it waits to be re-pinned (a new comment) or deleted. `element-removed`: the element it is pinned on is gone from the
   * version it moved to; it keeps its text and waits the same way. A gone moment is the one shown when both apply.
   */
  state?: 'moment-removed' | 'element-removed';
}

export interface NewComment {
  pin: NewFramePin | NewWordPin;
  text: string;
}

export interface CommentList {
  /** Every comment of the version, renumbered. */
  comments: Comment[];
}

export interface NoteSaved extends CommentList {
  /** The note as saved: trimmed. */
  note: string;
}

export interface AddedComment {
  /** The comment just saved. */
  comment: Comment;
  /** Every comment of the version, renumbered. */
  comments: Comment[];
}

/** One video in the project, as the New reel screen lists it. */
export interface VideoEntry {
  /** Relative to the project folder, with forward slashes. */
  path: string;
  /** The file name. */
  name: string;
  /** A reel title taken from the file name. */
  suggestedTitle: string;
  /** Seconds. */
  duration: number;
  codec: string;
  /** Bytes. */
  size: number;
}

export interface NewReel {
  /** Project-relative path of the video. */
  video: string;
  /** The reel's name; the video's file name when absent or blank. */
  title?: string;
}

export interface StartedReel {
  slug: string;
}

/** Turns a video's speech into timed words. The default is the skill's audio transcription; tests pass a fake. */
export type Transcriber = (videoFile: string, onProgress?: (processedSeconds: number) => void) => Promise<TranscriptWord[]>;

export type ToolId = 'python' | 'ffmpeg' | 'faster-whisper' | 'chromium';

/** What a tool is for: starting a reel from a video, or rendering. */
export type ToolUse = 'video' | 'render';

export interface ToolStatus {
  id: ToolId;
  name: string;
  present: boolean;
  /** How to install it on this machine. */
  hint: string;
  neededFor: ToolUse[];
}

export interface ToolCheck {
  tools: ToolStatus[];
  missing: ToolStatus[];
}
