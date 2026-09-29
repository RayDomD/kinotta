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

export interface Project {
  /** The project folder's name. */
  name: string;
  /** Absolute path of the project's reels/ folder. */
  reelsDir: string;
  listReels(): Promise<ReelListing>;
  /** Reads a version's shot list. Throws `KinottaError` (`not-found` or `invalid`). */
  readVersion(slug: string, number: number): Promise<Version>;
  /** A version's comments in number order. Throws `KinottaError` for an unknown reel or version. */
  listComments(slug: string, number: number): Promise<Comment[]>;
  /**
   * Saves a pinned comment to the editor's working state. Throws `KinottaError` `invalid` for empty text,
   * an unknown shot or a position outside the frame, and `not-found` for an unknown reel or version.
   */
  addComment(slug: string, number: number, input: NewComment): Promise<AddedComment>;
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
