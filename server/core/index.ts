import { basename, join, resolve } from 'node:path';
import { copyBatch } from './_internal/batch.ts';
import { addOperation, cancelHandoff, discardEdits, readEditList, redoEdit, removeOperation, undoEdit } from './_internal/edit-list.ts';
import { saveEdits } from './_internal/save.ts';
import { readVersion, settleNewest } from './_internal/carry.ts';
import { addComment, deleteComment, editComment, listComments, readNote, setNote } from './_internal/comments.ts';
import { footageFile } from './_internal/footage.ts';
import { importVideo } from './_internal/import.ts';
import { listReels } from './_internal/reels.ts';
import { startReel, startReelFromBrief, transcribeWithWhisper } from './_internal/start.ts';
import { checkTools, missingToolsMessage } from './_internal/tools.ts';
import type { Project, ProjectEvent, Transcriber } from './_internal/types.ts';
import { listVideos } from './_internal/videos.ts';
import { listVersions } from './_internal/version.ts';
import { createWatcher } from './_internal/watch.ts';
import { createTranscriptions } from './_internal/transcription.ts';

export { KinottaError } from './_internal/errors.ts';
export { pieceMap, toSource, toSourceSpans, toTimeline, toTimelineSpan } from './_internal/pieces.ts';
export type { Piece, PieceMap, PlacedPiece } from './_internal/pieces.ts';
export type { NewOperation, Operation, SnipOperation } from './_internal/edit-model.ts';
export { checkTools, missingToolsMessage };
export type {
  AddedComment,
  BatchOptions,
  Comment,
  ContractIssue,
  CommentList,
  CopiedBatch,
  EditList,
  FramePin,
  ImportedVideo,
  NewBriefReel,
  NewComment,
  NewFramePin,
  NewReel,
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
  SavedVersion,
  StartedBriefReel,
  StartedReel,
  TranscriptionProgress,
  ToolCheck,
  ToolId,
  ToolStatus,
  TranscriptWord,
  Transcriber,
  Version,
  VideoEntry,
  VersionEntry,
  WordPin,
} from './_internal/types.ts';

export interface ProjectOptions {
  /** Turns a video into timed words when a reel starts. Defaults to the skill's audio transcription. */
  transcriber?: Transcriber;
}

export function openProject(projectDir: string, options: ProjectOptions = {}): Project {
  const dir = resolve(projectDir);
  const watcher = createWatcher(join(dir, 'reels'));
  const listeners = new Set<(event: ProjectEvent) => void>();
  const transcriptions = createTranscriptions((event) => listeners.forEach((listener) => listener(event)));
  return {
    name: basename(dir),
    reelsDir: join(dir, 'reels'),
    listReels: () => listReels(dir),
    readVersion: (slug, number) => readVersion(dir, slug, number),
    listVersions: (slug) => listVersions(dir, slug),
    subscribe: (listener) => {
      listeners.add(listener);
      const stopWatching = watcher.subscribe(settling(dir, listener));
      return () => {
        listeners.delete(listener);
        stopWatching();
      };
    },
    footageFile: (slug) => footageFile(dir, slug),
    listComments: (slug, number) => listComments(dir, slug, number),
    addComment: (slug, number, input) => addComment(dir, slug, number, input),
    editComment: (slug, number, id, text) => editComment(dir, slug, number, id, text),
    deleteComment: (slug, number, id) => deleteComment(dir, slug, number, id),
    readNote: (slug, number) => readNote(dir, slug, number),
    setNote: (slug, number, note) => setNote(dir, slug, number, note),
    copyBatch: (slug, number, options) => copyBatch(dir, slug, number, options),
    listVideos: () => listVideos(dir),
    importVideo: (name, body) => importVideo(dir, name, body),
    startReel: (input) => startReel(dir, options.transcriber ?? transcribeWithWhisper, transcriptions, input),
    transcriptionProgress: (slug) => transcriptions.progress(slug),
    whenTranscribed: (slug) => transcriptions.whenDone(slug),
    readEditList: (slug) => readEditList(dir, slug),
    addOperation: (slug, operation) => addOperation(dir, slug, operation),
    removeOperation: (slug, id) => removeOperation(dir, slug, id),
    undoEdit: (slug) => undoEdit(dir, slug),
    redoEdit: (slug) => redoEdit(dir, slug),
    discardEdits: (slug) => discardEdits(dir, slug),
    cancelHandoff: (slug) => cancelHandoff(dir, slug),
    saveEdits: (slug) => saveEdits(dir, slug),
    startReelFromBrief: (input) => startReelFromBrief(dir, input),
  };
}

/**
 * A new version hands over its predecessor's unsent comments, and the reel's unsaved edits replay onto its sources (flagging
 * the ones whose targets are gone), before anyone hears that it exists.
 */
function settling(dir: string, listener: (event: ProjectEvent) => void): (event: ProjectEvent) => void {
  return (event) => {
    if (event.type === 'version-added') void settleNewest(dir, event.reel).then(() => readEditList(dir, event.reel)).catch(() => undefined).then(() => listener(event));
    else listener(event);
  };
}
