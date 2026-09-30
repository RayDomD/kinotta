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
  /** Footage reels with a transcript: the words spoken over the shot, and the same words joined. */
  words?: TranscriptWord[];
  spoken?: string;
}

export interface TranscriptWord {
  text: string;
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
  shots: number;
  implicit?: true;
}

export interface Version {
  number: number;
  isNewest: boolean;
  duration: number;
  shots: Shot[];
  overlays: Overlay[];
  sections: Section[];
  changedSections?: string[];
  /** Footage reels only. */
  footage?: { path: string; exists: boolean };
  transcript?: TranscriptWord[];
  transcriptProblem?: string;
}

/** One row of a reel's version rail. */
export interface VersionEntry {
  number: number;
  isNewest: boolean;
  /** v1 in this phase. */
  isStoryboard: boolean;
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
export const fetchComments = async (slug: string, number: number): Promise<Comment[]> =>
  (await getJson<{ comments: Comment[] }>(`${versionPath(slug, number)}/comments`)).comments;

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

/** Saves the version's comment batch into its folder (replacing any earlier copy) and returns the text to paste. */
export const copyBatch = (slug: string, number: number): Promise<CopiedBatch> =>
  requestJson(`${versionPath(slug, number)}/batch`, { method: 'POST' });

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
