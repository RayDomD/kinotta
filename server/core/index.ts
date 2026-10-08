import { basename, join, resolve } from 'node:path';
import { approveVersion, withdrawApproval } from './_internal/approval.ts';
import { copyBatch } from './_internal/batch.ts';
import { addOperation, cancelHandoff, discardEdits, readEditList, readMediaModel, redoEdit, removeOperation, undoEdit } from './_internal/edit-list.ts';
import { saveEdits } from './_internal/save.ts';
import { readVersion, settleNewest } from './_internal/carry.ts';
import { addComment, deleteComment, editComment, listComments, readNote, setNote } from './_internal/comments.ts';
import { footageFile } from './_internal/footage.ts';
import { importVideo } from './_internal/import.ts';
import { importMedia, listMedia, listProjectMedia, mediaFile, mediaWaveform, referenceMedia, relinkMedia } from './_internal/media-library.ts';
import { createMediaSpeech } from './_internal/media-speech.ts';
import { listReels } from './_internal/reels.ts';
import { checkRenderChoice, prepareRender, runRender } from './_internal/render.ts';
import { mixOverload } from './_internal/media-overload.ts';
import { readRenderSettings, saveRenderSettings } from './_internal/render-settings.ts';
import { listRenders, renderPath, revealRender } from './_internal/past-renders.ts';
import { createRenderQueue } from './_internal/render-queue.ts';
import { startReel, startReelFromBrief, transcribeWithWhisper } from './_internal/start.ts';
import { checkTools, missingToolsMessage } from './_internal/tools.ts';
import type { Project, ProjectEvent, RenderJob, RenderRequest, Transcriber } from './_internal/types.ts';
import { listVideos } from './_internal/videos.ts';
import { listVersions } from './_internal/version.ts';
import { createWatcher } from './_internal/watch.ts';
import { createTranscriptions } from './_internal/transcription.ts';

export { KinottaError } from './_internal/errors.ts';
export { pieceMap, toSource, toSourceSpans, toTimeline, toTimelineSpan } from './_internal/pieces.ts';
export type { Piece, PieceMap, PlacedPiece } from './_internal/pieces.ts';
export type { NewOperation, Operation, SnipOperation } from './_internal/edit-model.ts';
export { checkTools, missingToolsMessage };
export { versionIssues } from './_internal/footage-issues.ts';
export type {
  MediaSpeech,
  MediaWaveform,
  ProjectMediaFile,
  MediaEditingModel,
  ImportedMedia,
  MediaEntry,
  MediaFilter,
  AddedComment,
  Approval,
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
  MixOverload,
  NoteSaved,
  OverloadSpan,
  Overlay,
  Project,
  ProjectEvent,
  RenderJob,
  RenderPreset,
  RenderFile,
  RenderRequest,
  RenderSettings,
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
  ToolUse,
  TranscriptWord,
  Transcriber,
  Version,
  VideoEntry,
  VersionEntry,
  Withdrawal,
  WordPin,
} from './_internal/types.ts';

export interface ProjectOptions {
  /** Turns a video into timed words when a reel starts. Defaults to the skill's audio transcription. */
  transcriber?: Transcriber;
  /** How many parallel segments every render runs in; tests pin it. Otherwise the CPU and the render's length decide. */
  renderSegments?: number;
}

export function openProject(projectDir: string, options: ProjectOptions = {}): Project {
  const dir = resolve(projectDir);
  const watcher = createWatcher(join(dir, 'reels'));
  const listeners = new Set<(event: ProjectEvent) => void>();
  const emit = (event: ProjectEvent): void => listeners.forEach((listener) => listener(event));
  const transcriptions = createTranscriptions(emit);
  const renders = createRenderQueue(emit);
  const speech = createMediaSpeech(dir, options.transcriber ?? transcribeWithWhisper);
  const render = async (request: RenderRequest): Promise<RenderJob> => {
    const task = await prepareRender(dir, request);
    if (request.remember === true) await saveRenderSettings(task.reelDir, request.preset, task.settings);
    return renders.add(request, (job, report, signal) => runRender(dir, task, job, report, signal, options.renderSegments));
  };
  return {
    importMedia: (name, body) => importMedia(dir, name, body),
    referenceMedia: (path) => referenceMedia(dir, path),
    listProjectMedia: () => listProjectMedia(dir),
    relinkMedia: (source, path) => relinkMedia(dir, source, path),
    mediaFile: (source, saved) => mediaFile(dir, source, saved),
    mediaWaveform: (source, saved) => mediaWaveform(dir, source, saved),
    listMedia: (filter) => listMedia(dir, filter),
    mediaSpeech: (source, saved) => speech.status(source, saved),
    transcribeMedia: (source, saved) => speech.start(source, saved),
    readMediaModel: (slug) => readMediaModel(dir, slug),
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
    approveVersion: (slug, number) => approveVersion(dir, slug, number),
    withdrawApproval: (slug, number) => withdrawApproval(dir, slug, number),
    render,
    saveAndRender: async (request) => {
      await checkRenderChoice(dir, request);
      // Save refusing or failing throws here, so no render of stale or pending content starts (AM40).
      const { version } = await saveEdits(dir, request.reel);
      return { version, job: await render({ ...request, version }) };
    },
    mixOverload: (slug, version) => mixOverload(dir, slug, version),
    renderJobs: () => renders.jobs(),
    renderSettings: (slug) => readRenderSettings(dir, slug),
    listRenders: (slug) => listRenders(dir, slug),
    revealRender: (slug, file) => revealRender(dir, slug, file),
    renderFile: (slug, file) => renderPath(dir, slug, file),
    whenRendered: (jobId) => renders.whenDone(jobId),
    cancelRender: (jobId) => renders.cancel(jobId),
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
