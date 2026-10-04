import type { CaptionsPlan, NewOperation, Operation, PlanClip } from '../../../../server/core/model.ts';

export interface ReelSummary {
  slug: string;
  title: string;
  newestVersion: number | null;
  lastChange: number;
}

export type ReelsState = 'ok' | 'no-reels-folder' | 'no-reels';

export interface ReelListing {
  state: ReelsState;
  reels: ReelSummary[];
}

export interface ProjectInfo {
  name: string;
}

export interface Shot {
  number: string;
  start: number;
  duration: number;
  title: string;
  description: string;
  /** Footage reels only. */
  section?: string;
  type?: 'cutaway' | 'panel';
  line?: { start: number; end: number };
  /** Set when the shot is one state of a clip that changes (05a, 05b, …): the clip's number. */
  clip?: string;
  /** Footage reels with a transcript: the words spoken over the shot (on the timeline), and the same words joined. */
  words?: TranscriptWord[];
  spoken?: string;
}

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
}

/** A stretch of the source video (seconds) kept in the reel, and where it starts on the reel's timeline. */
export interface VersionPiece {
  in: number;
  out: number;
  at: number;
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
  shots: number;
  implicit?: true;
  /** Handed off to Claude, with no newer version having changed the section yet. */
  waiting?: true;
}

/** One way a version breaks the timing contract, found by the server's static check. */
export interface ContractIssue {
  code: string;
  shot?: string;
  scene?: string;
  /** Plain words, complete on its own ("shot 04: no named elements"). */
  message: string;
}

export interface Version {
  number: number;
  isNewest: boolean;
  duration: number;
  shots: Shot[];
  overlays: Overlay[];
  sections: Section[];
  /** Empty for a version that keeps the timing contract. */
  issues: ContractIssue[];
  changedSections?: string[];
  claimMismatch?: string[];
  /** Footage reels only. */
  footage?: { path: string; exists: boolean };
  /** Footage reels only: the stretches of the video the reel plays, in play order, with where each starts on the timeline. */
  pieces?: VersionPiece[];
  transcript?: TranscriptWord[];
  transcriptProblem?: string;
  /** Footage reels only: the plan's `captions` (`true`, or the look, colour and caption positions). Absent when captions are off. */
  captions?: true | CaptionsPlan;
  /** Footage reels only: the plan's clips in source seconds, with their `slid` flag. */
  clips?: PlanClip[];
  builtBy?: string;
}

/** One row of a reel's version rail. */
export interface VersionEntry {
  number: number;
  isNewest: boolean;
  /** v1 in this phase. */
  isStoryboard: boolean;
  /** Reels with several sections only: the ids of the sections this version changed. */
  changedSections?: string[];
  /** Who made the version: `you`, or an agent's name. */
  builtBy?: string;
}

/** What the server reports as it happens. */
export type ProjectEvent =
  | { type: 'version-added'; reel: string; version: number }
  | { type: 'reels-changed' }
  | { type: 'comments-changed'; reel: string; version: number };

export interface FramePin {
  kind: 'frame';
  version: number;
  section: string | null;
  shot: string;
  /** The shot's start, in seconds. */
  time: number;
  /** Fractions of the frame, 0 to 1. */
  x: number;
  y: number;
  /** The pinned element's name, or null for a position-only pin. */
  element: string | null;
}

/** A pin on a spoken word of the shot's line. */
export interface WordPin {
  kind: 'word';
  version: number;
  section: string | null;
  shot: string;
  /** The word's start, in seconds. */
  time: number;
  word: string;
}

export interface Comment {
  id: string;
  /** Position in the version's comments by pin time then creation. The number shown everywhere. */
  number: number;
  pin: FramePin | WordPin;
  text: string;
  createdAt: string;
  /** Copied to Claude in its section's latest batch. */
  sent?: true;
  /** Once a newer version has settled: this unsent comment moved on to it. */
  carried?: { to: number };
  /** The comment's moment was snipped out of the footage: it keeps its text and waits to be re-pinned or deleted. */
  state?: 'moment-removed';
}

export interface CommentsOfVersion {
  comments: Comment[];
}

export interface NewComment {
  pin: { shot: string; x: number; y: number; element: string | null } | { kind: 'word'; shot: string; time: number; word: string };
  text: string;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request to ${path} failed (${res.status})`);
  }
  return (await res.json()) as T;
}

const getJson = <T>(path: string): Promise<T> => requestJson<T>(path);
const versionPath = (slug: string, number: number): string => `/api/reels/${encodeURIComponent(slug)}/versions/${number}`;

export const fetchProject = (): Promise<ProjectInfo> => getJson('/api/project');
export const fetchReels = (): Promise<ReelListing> => getJson('/api/reels');
/** A reel's versions, oldest first. */
export const fetchVersions = async (slug: string): Promise<VersionEntry[]> =>
  (await getJson<{ versions: VersionEntry[] }>(`/api/reels/${encodeURIComponent(slug)}/versions`)).versions;
export const fetchVersion = (slug: string, number: number): Promise<Version> => getJson(versionPath(slug, number));

/** A version's comments, in number order. */
export const fetchComments = (slug: string, number: number): Promise<CommentsOfVersion> =>
  getJson(`${versionPath(slug, number)}/comments`);

/** Saves a pinned comment. Resolves with the saved comment and the version's renumbered comments. */
export const addComment = (slug: string, number: number, input: NewComment): Promise<{ comment: Comment; comments: Comment[] }> =>
  requestJson(`${versionPath(slug, number)}/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

const commentPath = (slug: string, number: number, id: string): string => `${versionPath(slug, number)}/comments/${encodeURIComponent(id)}`;
const jsonBody = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** Changes a comment's text. Resolves with the edited comment and the version's comments. */
export const editComment = (slug: string, number: number, id: string, text: string): Promise<{ comment: Comment; comments: Comment[] }> =>
  requestJson(commentPath(slug, number, id), jsonBody('PATCH', { text }));

/** Removes a comment and its pin. Resolves with the version's renumbered comments. */
export const deleteComment = async (slug: string, number: number, id: string): Promise<Comment[]> =>
  (await requestJson<{ comments: Comment[] }>(commentPath(slug, number, id), { method: 'DELETE' })).comments;

/** The version's note on the whole reel, empty when there is none. */
export const fetchNote = async (slug: string, number: number): Promise<string> =>
  (await getJson<{ note: string }>(`${versionPath(slug, number)}/note`)).note;

/** Saves the version's note on the whole reel (an empty string clears it). Resolves with the note as saved. */
export const saveNote = async (slug: string, number: number, note: string): Promise<string> =>
  (await requestJson<{ note: string }>(`${versionPath(slug, number)}/note`, jsonBody('PUT', { note }))).note;

export interface CopiedBatch {
  /** The pasteable text for Claude. */
  text: string;
  /** Where the batch was saved, relative to the project root. */
  file: string;
  count: number;
}

/** What a batch covers and carries beyond the comments. */
export interface BatchOptions {
  /** On a reel with several sections: the section to copy. */
  section?: string;
  /** Add the contract issues to the batch. The server adds its own; `runtimeIssues` are the ones only this browser saw. */
  includeIssues?: boolean;
  runtimeIssues?: string[];
}

/**
 * Saves a comment batch into the version's folder (replacing any earlier copy) and returns the text to paste. A reel
 * with several sections copies one section, named by `options.section`.
 */
export const copyBatch = (slug: string, number: number, options: BatchOptions = {}): Promise<CopiedBatch> => {
  const { section, ...extra } = options;
  const url = `${versionPath(slug, number)}/batch${section === undefined ? '' : `?section=${encodeURIComponent(section)}`}`;
  return requestJson(url, extra.includeIssues ? jsonBody('POST', extra) : { method: 'POST' });
};

/** Same-origin URL of a version's page. The stage loads it; nothing else builds server paths. */
export const versionPageUrl = (slug: string, number: number): string =>
  `/reels/${encodeURIComponent(slug)}/v${number}/index.html`;

/** Listens to the server's change events. Returns the function that stops listening; the browser reconnects on its own. */
export function subscribe(onEvent: (event: ProjectEvent) => void): () => void {
  const source = new EventSource('/api/events');
  source.onmessage = (message: MessageEvent<string>) => {
    try {
      onEvent(JSON.parse(message.data) as ProjectEvent);
    } catch {
      // A message that is not an event is ignored.
    }
  };
  return () => source.close();
}

/** Same-origin URL of a footage reel's footage file (served with byte ranges so video can seek). */
export const footageUrl = (slug: string): string => `/footage/${encodeURIComponent(slug)}`;

/** A video in the project, as the New reel screen lists it. */
export interface VideoEntry {
  /** Relative to the project folder. */
  path: string;
  name: string;
  /** A reel name taken from the file name. */
  suggestedTitle: string;
  /** Seconds. */
  duration: number;
  codec: string;
  /** Bytes. */
  size: number;
}

/** The project's videos, for the New reel screen. */
export const listVideos = async (): Promise<VideoEntry[]> => (await getJson<{ videos: VideoEntry[] }>('/api/videos')).videos;

/**
 * Starts a reel from a video in the project. Resolves with the new reel's slug once its first version is built,
 * which takes as long as the transcription does.
 */
export const startReel = (input: { video: string; title: string }): Promise<{ slug: string }> =>
  requestJson('/api/reels', jsonBody('POST', input));

/** A reel's unsaved edits. A `stale` list was made on a version that is no longer the newest. */
export interface EditList {
  base: number;
  operations: Operation[];
  canUndo: boolean;
  canRedo: boolean;
  stale?: true;
}

const editsPath = (slug: string): string => `/api/reels/${encodeURIComponent(slug)}/edits`;

export const fetchEdits = (slug: string): Promise<EditList> => getJson(editsPath(slug));
export const addOperation = (slug: string, operation: NewOperation): Promise<EditList> => requestJson(editsPath(slug), jsonBody('POST', operation));
/** Drops one operation and keeps the later ones. */
export const removeOperation = (slug: string, id: string): Promise<EditList> => requestJson(`${editsPath(slug)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const undoEdit = (slug: string): Promise<EditList> => requestJson(`${editsPath(slug)}/undo`, { method: 'POST' });
export const redoEdit = (slug: string): Promise<EditList> => requestJson(`${editsPath(slug)}/redo`, { method: 'POST' });
export const discardEdits = (slug: string): Promise<EditList> => requestJson(editsPath(slug), { method: 'DELETE' });
/** Builds the next version from the edits. Resolves with its number. */
export const saveEdits = async (slug: string): Promise<number> =>
  (await requestJson<{ version: number }>(`/api/reels/${encodeURIComponent(slug)}/save`, { method: 'POST' })).version;
