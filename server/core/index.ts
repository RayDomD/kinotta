import { basename, join, resolve } from 'node:path';
import { addComment, listComments } from './_internal/comments.ts';
import { listReels } from './_internal/reels.ts';
import type { Project } from './_internal/types.ts';
import { readVersion } from './_internal/version.ts';

export { KinottaError } from './_internal/errors.ts';
export type {
  AddedComment,
  Comment,
  FramePin,
  NewComment,
  NewFramePin,
  Overlay,
  Project,
  ReelListing,
  ReelsState,
  ReelSummary,
  Section,
  Shot,
  Version,
} from './_internal/types.ts';

export function openProject(projectDir: string): Project {
  const dir = resolve(projectDir);
  return {
    name: basename(dir),
    reelsDir: join(dir, 'reels'),
    listReels: () => listReels(dir),
    readVersion: (slug, number) => readVersion(dir, slug, number),
    listComments: (slug, number) => listComments(dir, slug, number),
    addComment: (slug, number, input) => addComment(dir, slug, number, input),
  };
}
