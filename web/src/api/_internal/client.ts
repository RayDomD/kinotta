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
  duration: number;
  shots: Shot[];
  overlays: Overlay[];
  sections?: Section[];
  changedSections?: string[];
}

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

export interface Comment {
  id: string;
  /** Position in the version's comments by shot start then creation. The number shown everywhere. */
  number: number;
  pin: FramePin;
  text: string;
  createdAt: string;
}

export interface NewComment {
  pin: { shot: string; x: number; y: number; element: string | null };
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

/** Same-origin URL of a version's page. The stage loads it; nothing else builds server paths. */
export const versionPageUrl = (slug: string, number: number): string =>
  `/reels/${encodeURIComponent(slug)}/v${number}/index.html`;
