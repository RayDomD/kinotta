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
}

export interface Version {
  number: number;
  isNewest: boolean;
  /** Seconds. */
  duration: number;
  shots: Shot[];
  /** Empty when the version has none. */
  overlays: Overlay[];
  /** Present only when shots.json has sections. */
  sections?: Section[];
  changedSections?: string[];
}

/** One row of a reel's version rail. */
export interface VersionEntry {
  number: number;
  isNewest: boolean;
  /** v1 in this phase. */
  isStoryboard: boolean;
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
  /** A version's comments in number order. Throws `KinottaError` for an unknown reel or version. */
  listComments(slug: string, number: number): Promise<Comment[]>;
  /**
   * Saves a pinned comment to the editor's working state. Throws `KinottaError` `invalid` for empty text,
   * an unknown shot or a position outside the frame, `not-found` for an unknown reel or version, and `frozen`
   * for a version that is not the newest.
   */
  addComment(slug: string, number: number, input: NewComment): Promise<AddedComment>;
  /**
   * Writes the version's comment batch to `reels/<slug>/v<n>/comments.json` (replacing any earlier copy) and
   * returns the pasteable text. Throws `KinottaError` `invalid` when there are no comments and no note, and `frozen`
   * for a version that is not the newest.
   */
  copyBatch(slug: string, number: number): Promise<CopiedBatch>;
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

export interface Comment {
  id: string;
  /** 1-based position in the version's comments, ordered by shot start then creation. The number shown everywhere. */
  number: number;
  pin: FramePin;
  text: string;
  /** ISO 8601. */
  createdAt: string;
}

export interface NewComment {
  pin: NewFramePin;
  text: string;
}

export interface AddedComment {
  /** The comment just saved. */
  comment: Comment;
  /** Every comment of the version, renumbered. */
  comments: Comment[];
}
