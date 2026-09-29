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

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request to ${path} failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export const fetchProject = (): Promise<ProjectInfo> => getJson('/api/project');
export const fetchReels = (): Promise<ReelListing> => getJson('/api/reels');
export const fetchVersion = (slug: string, number: number): Promise<Version> =>
  getJson(`/api/reels/${encodeURIComponent(slug)}/versions/${number}`);

/** Same-origin URL of a version's page. The stage loads it; nothing else builds server paths. */
export const versionPageUrl = (slug: string, number: number): string =>
  `/reels/${encodeURIComponent(slug)}/v${number}/index.html`;
