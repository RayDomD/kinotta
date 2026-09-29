import { basename, join, resolve } from 'node:path';
import { copyBatch } from './_internal/batch.ts';
import { addComment, listComments } from './_internal/comments.ts';
import { listReels } from './_internal/reels.ts';
import type { Project } from './_internal/types.ts';
import { listVersions, readVersion } from './_internal/version.ts';
import { createWatcher } from './_internal/watch.ts';

export { KinottaError } from './_internal/errors.ts';
export type {
  AddedComment,
  Comment,
  CopiedBatch,
  FramePin,
  NewComment,
  NewFramePin,
  Overlay,
  Project,
  ProjectEvent,
  ReelListing,
  ReelsState,
  ReelSummary,
  Section,
  Shot,
  Version,
  VersionEntry,
} from './_internal/types.ts';

export function openProject(projectDir: string): Project {
  const dir = resolve(projectDir);
  const watcher = createWatcher(join(dir, 'reels'));
  return {
    name: basename(dir),
    reelsDir: join(dir, 'reels'),
    listReels: () => listReels(dir),
    readVersion: (slug, number) => readVersion(dir, slug, number),
    listVersions: (slug) => listVersions(dir, slug),
    subscribe: watcher.subscribe,
    listComments: (slug, number) => listComments(dir, slug, number),
    addComment: (slug, number, input) => addComment(dir, slug, number, input),
    copyBatch: (slug, number) => copyBatch(dir, slug, number),
  };
}
