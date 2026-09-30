import { basename, join, resolve } from 'node:path';
import { copyBatch } from './_internal/batch.ts';
import { addComment, deleteComment, editComment, listComments, readNote, setNote } from './_internal/comments.ts';
import { footageFile } from './_internal/footage.ts';
import { listReels } from './_internal/reels.ts';
import type { Project } from './_internal/types.ts';
import { listVersions, readVersion } from './_internal/version.ts';
import { createWatcher } from './_internal/watch.ts';

export { KinottaError } from './_internal/errors.ts';
export type {
  AddedComment,
  Comment,
  CommentList,
  CopiedBatch,
  FramePin,
  NewComment,
  NewFramePin,
  NewWordPin,
  NoteSaved,
  Overlay,
  Project,
  ProjectEvent,
  ReelListing,
  ReelsState,
  ReelSummary,
  Section,
  Shot,
  TranscriptWord,
  Version,
  VersionEntry,
  WordPin,
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
    footageFile: (slug) => footageFile(dir, slug),
    listComments: (slug, number) => listComments(dir, slug, number),
    addComment: (slug, number, input) => addComment(dir, slug, number, input),
    editComment: (slug, number, id, text) => editComment(dir, slug, number, id, text),
    deleteComment: (slug, number, id) => deleteComment(dir, slug, number, id),
    readNote: (slug, number) => readNote(dir, slug, number),
    setNote: (slug, number, note) => setNote(dir, slug, number, note),
    copyBatch: (slug, number) => copyBatch(dir, slug, number),
  };
}
