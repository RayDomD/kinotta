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

export interface Project {
  /** The project folder's name. */
  name: string;
  listReels(): Promise<ReelListing>;
}
