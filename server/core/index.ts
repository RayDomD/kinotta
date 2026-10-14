import { rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { approveVersion, withdrawApproval } from './_internal/approval.ts';
import { buildParts } from './_internal/parts-build.ts';
import { workingPartsPage, workingPartsSnapshot } from './_internal/parts-working.ts';
import { alternatePage } from './_internal/parts-alternates.ts';
import { copyBatch } from './_internal/batch.ts';
import { addOperation, cancelHandoff, discardEdits, readEditList, readEditListNow, readMediaModel, withReelLock, redoEdit, removeOperation, undoEdit } from './_internal/edit-list.ts';
import { captureWorking, freezeEdits } from './_internal/save.ts';
import { readVersion, settleNewest } from './_internal/carry.ts';
import { addComment, deleteComment, editComment, listComments, readNote, setNote } from './_internal/comments.ts';
import { footageFile } from './_internal/footage.ts';
import { importVideo } from './_internal/import.ts';
import { importMedia, listMedia, listProjectMedia, mediaFile, mediaWaveform, referenceMedia, relinkMedia } from './_internal/media-library.ts';
import { createMediaSpeech } from './_internal/media-speech.ts';
import { createMediaBeats } from './_internal/media-beats.ts';
import { soundEffects, soundEffectFile, importSoundEffect } from './_internal/sound-effects.ts';
import { createAudioGeneration } from './_internal/audio-generation.ts';
import { listReels } from './_internal/reels.ts';
import { CLEANUP_RETRIES, CLEANUP_RETRY_MS, checkRenderChoice, prepareRender, runRender } from './_internal/render.ts';
import { mixOverload } from './_internal/media-overload.ts';
import { readRenderSettings, saveRenderSettings } from './_internal/render-settings.ts';
import { listRenders, renderPath, revealRender } from './_internal/past-renders.ts';
import { createRenderQueue, removeStaleDrafts } from './_internal/render-queue.ts';
import { startReel, startReelFromBrief, transcribeWithWhisper } from './_internal/start.ts';
import { checkTools, missingToolsMessage } from './_internal/tools.ts';
import type { EditList, Project, ProjectEvent, RenderJob, RenderRequest, Transcriber } from './_internal/types.ts';
import { listVideos } from './_internal/videos.ts';
import { readCapturedVersion, requireReelDir, newestVersionNumber, listVersions } from './_internal/version.ts';
import { createWatcher } from './_internal/watch.ts';
import { createTranscriptions } from './_internal/transcription.ts';

export { removeStaleDrafts } from './_internal/render-queue.ts';
export { assembleParts } from './_internal/parts-assembler.ts';
export type { PartsInputs, ShotRevision } from './_internal/parts-assembler.ts';
export { scanPage, checkShotsAgainstPage } from './_internal/contract.ts';
export { KinottaError } from './_internal/errors.ts';
export { pieceMap, toSource, toSourceSpans, toTimeline, toTimelineSpan } from './_internal/pieces.ts';
export type { Piece, PieceMap, PlacedPiece } from './_internal/pieces.ts';
export type { NewOperation, Operation, SnipOperation } from './_internal/edit-model.ts';
export { checkTools, missingToolsMessage };
export { versionIssues } from './_internal/footage-issues.ts';
export type { AudioGenerationRequest, GeneratedAudio } from './_internal/audio-generation.ts';
export type {
  SoundEffect,
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
  BuiltPartsVersion,
  Comment,
  ContractIssue,
  PartsManifest,
  PartsAlternate,
  PartsShot,
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
  const edited = async (slug: string, task: () => Promise<EditList>): Promise<EditList> => {
    const list = await task();
    emit({ type: 'edits-changed', reel: slug });
    return list;
  };
  const transcriptions = createTranscriptions(emit);
  const renders = createRenderQueue(emit);
  const speech = createMediaSpeech(dir, options.transcriber ?? transcribeWithWhisper);
  const beats = createMediaBeats(dir);
  const generateAudio = createAudioGeneration(dir);
  const render = async (request: RenderRequest): Promise<RenderJob> => {
    removeStaleDrafts(dir);
    const task = await prepareRender(dir, request);
    if (request.remember === true) await saveRenderSettings(task.reelDir, request.preset, task.settings);
    return renders.add(request, (job, report, signal) => runRender(dir, task, job, report, signal, options.renderSegments));
  };
  return {
    soundEffects,
    soundEffectFile,
    importSoundEffect: (id) => importSoundEffect(dir, id),
    importMedia: (name, body) => importMedia(dir, name, body),
    referenceMedia: (path) => referenceMedia(dir, path),
    listProjectMedia: () => listProjectMedia(dir),
    relinkMedia: (source, path) => relinkMedia(dir, source, path),
    mediaFile: (source, saved) => mediaFile(dir, source, saved),
    mediaWaveform: (source, saved) => mediaWaveform(dir, source, saved),
    listMedia: (filter) => listMedia(dir, filter),
    mediaSpeech: (source, saved) => speech.status(source, saved),
    transcribeMedia: (source, saved) => speech.start(source, saved),
    detectMediaBeats: beats,
    generateAudio,
    readMediaModel: (slug) => readMediaModel(dir, slug),
    name: basename(dir),
    reelsDir: join(dir, 'reels'),
    listReels: () => listReels(dir),
    readVersion: (slug, number) => readVersion(dir, slug, number),
    workingPartsPage: (slug, override) => workingPartsPage(dir, slug, override),
    alternatePage: (slug, number, shot, revision) => alternatePage(dir, slug, number, shot, revision),
    readWorkingVersion: async (slug) => {
      const reelDir = await requireReelDir(dir, slug);
      return withReelLock(reelDir, async () => {
        const list = await readEditListNow(dir, slug);
        const number = await newestVersionNumber(reelDir);
        const version = await readCapturedVersion(dir, slug, number, join(reelDir, `v${list.base}`));
        const parts = version.parts ? await workingPartsSnapshot(dir, slug) : null;
        const shots = parts?.shots.map((shot) => ({ ...shot, section: version.shots.find((original) => original.name === shot.name)?.section }));
        return { ...version, isNewest: true, workingBase: list.base, ...(parts && shots ? { workingParts: { duration: parts.duration, shots, key: parts.key } } : {}) };
      });
    },
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
    addOperation: (slug, operation) => edited(slug, () => addOperation(dir, slug, operation)),
    removeOperation: (slug, id) => edited(slug, () => removeOperation(dir, slug, id)),
    undoEdit: (slug) => edited(slug, () => undoEdit(dir, slug)),
    redoEdit: (slug) => edited(slug, () => redoEdit(dir, slug)),
    discardEdits: (slug) => discardEdits(dir, slug),
    cancelHandoff: (slug) => cancelHandoff(dir, slug),
    freezeEdits: (slug) => freezeEdits(dir, slug),
    buildParts: (slug, by) => buildParts(dir, slug, by),
    startReelFromBrief: (input) => startReelFromBrief(dir, input),
    approveVersion: (slug, number) => approveVersion(dir, slug, number),
    withdrawApproval: (slug, number) => withdrawApproval(dir, slug, number),
    render,
    renderWorking: async (request) => {
      removeStaleDrafts(dir);
      await checkRenderChoice(dir, request);
      if (request.preset !== 'draft') {
        const { version } = await freezeEdits(dir, request.reel, async (stage, number) => { await prepareRender(dir, { ...request, version: number }, stage); }, request.preset === 'final' ? 'Final render' : 'Overlay render');
        return render({ ...request, version });
      }
      const capture = await captureWorking(dir, request.reel);
      const cleanup = () => rm(capture.dir, { recursive: true, force: true, maxRetries: CLEANUP_RETRIES, retryDelay: CLEANUP_RETRY_MS });
      try {
        const draft = { ...request, version: capture.version, working: true as const };
        const task = await prepareRender(dir, draft, capture.dir);
        if (request.remember === true) await saveRenderSettings(task.reelDir, request.preset, task.settings);
        return renders.add(draft, (job, report, signal) => runRender(dir, task, job, report, signal, options.renderSegments), cleanup);
      } catch (error) { await cleanup(); throw error; }
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
