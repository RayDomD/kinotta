import { basename, resolve } from 'node:path';
import { listReels } from './_internal/reels.ts';
import type { Project } from './_internal/types.ts';

export type { Project, ReelListing, ReelsState, ReelSummary } from './_internal/types.ts';

export function openProject(projectDir: string): Project {
  const dir = resolve(projectDir);
  return { name: basename(dir), listReels: () => listReels(dir) };
}
