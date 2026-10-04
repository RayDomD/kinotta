export interface ReelSummary {
  /** Folder name under reels/. */
  slug: string;
  /** reel.json title, falling back to the slug. */
  title: string;
  /** Highest vN folder, or null when the reel has no versions yet. */
  newestVersion: number | null;
  /** Newest mtime (ms since epoch) of any file inside the reel. */
  lastChange: number;
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
  /** Handed off to Claude on this version, or on an earlier one that no version since has changed this section in. */
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
  /** Footage reels only: the timed words of transcript.json. Absent when it is missing or unreadable. */
  transcript?: TranscriptWord[];
  /** Footage reels only: why there is no transcript. */
  transcriptProblem?: string;
}

/** One row of a reel's version rail. */
export interface VersionEntry {
  number: number;
  isNewest: boolean;
  /** v1 in this phase. */
  isStoryboard: boolean;
  /** Reels with several sections only, from v2 on: the ids of the sections this version changed. */
  changedSections?: string[];
}

/** What `Project.subscribe` reports. */
export type ProjectEvent =
  | { type: 'version-added'; reel: string; version: number }
  | { type: 'reels-changed' }
  | { type: 'comments-changed'; reel: string; version: number };

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
   * Calls `listener` when a version with a shots.json appears, a reel appears or goes, or a version's saved
   * comments change. Debounced and de-duplicated. Returns the unsubscribe function; watching stops with the last one.
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
   * (`comments-<sectionId>.json`) and the section counts as waiting on Claude. Throws `KinottaError` `invalid` when there are no comments and no note, and `frozen`
   * for a version that is not the newest.
   */
  copyBatch(slug: string, number: number, options?: BatchOptions): Promise<CopiedBatch>;
  /** What the version before could not hand over because its section changed, or null when nothing was left behind. */
  carryNotice(slug: string, number: number): Promise<CarryNotice | null>;
  /** The project's videos (outside reels/) with length, codec and size. */
  listVideos(): Promise<VideoEntry[]>;
  /**
   * Starts a reel from a video in the project, which stays where it is: writes the reel and its plan, transcribes,
   * and builds v1 with `builtBy: "you"`. Throws `KinottaError` `invalid` for a path that is not a video in the project
   * and `not-found` for a missing file; a transcription or build failure throws its reason and leaves the reel without a version.
   */
  startReel(input: NewReel): Promise<StartedReel>;
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

/** Unsent comments that stayed on the version before because their section changed. */
export interface CarryNotice {
  /** The version they stayed on. */
  from: number;
  count: number;
  /** Ids of the sections they belong to. */
  sections: string[];
}

export interface CopiedBatch {
  /** What to paste to Claude: reel, version, each comment as shot, time, element: text, notes, saved path. */
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
  /** Shot number, "03". */
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
  /** Copied to Claude in its section's latest batch. */
  sent?: true;
  /** Once a newer version has settled: whether this comment moved to it. */
  carried?: { to: number; moved: boolean };
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
export type Transcriber = (videoFile: string) => Promise<TranscriptWord[]>;
