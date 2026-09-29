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

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Request to ${path} failed (${res.status})`);
  return (await res.json()) as T;
}

export const fetchProject = (): Promise<ProjectInfo> => getJson('/api/project');
export const fetchReels = (): Promise<ReelListing> => getJson('/api/reels');
