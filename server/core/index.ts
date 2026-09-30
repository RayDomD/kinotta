import { basename, join, resolve } from 'node:path';
import { copyBatch } from './_internal/batch.ts';
import { carryNotice, readVersion, settleNewest } from './_internal/carry.ts';
import { addComment, deleteComment, editComment, listComments, readNote, setNote } from './_internal/comments.ts';
import { footageFile } from './_internal/footage.ts';
import { listReels } from './_internal/reels.ts';
import type { Project, ProjectEvent } from './_internal/types.ts';
import { listVersions } from './_internal/version.ts';
import { createWatcher } from './_internal/watch.ts';

export { KinottaError } from './_internal/errors.ts';
export type {
  AddedComment,
  BatchOptions,
  CarryNotice,
  Comment,
  ContractIssue,
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
    subscribe: (listener) => watcher.subscribe(settling(dir, listener)),
    footageFile: (slug) => footageFile(dir, slug),
    listComments: (slug, number) => listComments(dir, slug, number),
    addComment: (slug, number, input) => addComment(dir, slug, number, input),
    editComment: (slug, number, id, text) => editComment(dir, slug, number, id, text),
    deleteComment: (slug, number, id) => deleteComment(dir, slug, number, id),
    readNote: (slug, number) => readNote(dir, slug, number),
    setNote: (slug, number, note) => setNote(dir, slug, number, note),
    copyBatch: (slug, number, options) => copyBatch(dir, slug, number, options),
    carryNotice: (slug, number) => carryNotice(dir, slug, number),
  };
}

/** A new version hands over its predecessor's unsent comments before anyone hears that it exists. */
function settling(dir: string, listener: (event: ProjectEvent) => void): (event: ProjectEvent) => void {
  return (event) => {
    if (event.type === 'version-added') void settleNewest(dir, event.reel).then(() => listener(event));
    else listener(event);
  };
}
