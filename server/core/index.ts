import { basename, join, resolve } from 'node:path';
import { listReels } from './_internal/reels.ts';
import type { Project } from './_internal/types.ts';
import { readVersion } from './_internal/version.ts';

export { KinottaError } from './_internal/errors.ts';
export type { Overlay, Project, ReelListing, ReelsState, ReelSummary, Section, Shot, Version } from './_internal/types.ts';

export function openProject(projectDir: string): Project {
  const dir = resolve(projectDir);
  return {
    name: basename(dir),
    reelsDir: join(dir, 'reels'),
    listReels: () => listReels(dir),
    readVersion: (slug, number) => readVersion(dir, slug, number),
  };
}
