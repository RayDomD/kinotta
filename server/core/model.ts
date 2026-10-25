/**
 * The parts of the core with no file or process access: the pieces mapping and the edit list's model. The web
 * app imports these from here, so the editor previews an edit with the same code Save uses.
 */
export { pieceMap, toSource, toSourceSpans, toTimeline, toTimelineSpan } from './_internal/pieces.ts';
export { placementBeats } from './_internal/media-beat-model.ts';
export { validateBeats } from './_internal/media-model.ts';
export type { BeatGrid } from './_internal/media-model.ts';
export type { Piece, PieceMap, PlacedPiece } from './_internal/pieces.ts';
export { captionPhrases, legacyMedia, mediaSpans, mediaTimeline, mediaWithTracks, mediaWords, pictureAt, pictureOrder, placementTime, remapMediaMoment, timelineMoment, trackGain } from './_internal/media-model.ts';
export type { GapPlacement, MediaCaptionPhrase, MediaMoment, MediaPlacement, MediaPlan, MediaSource, MediaTimeline, MediaTrack, PictureRegion, SourcePlacement } from './_internal/media-model.ts';
export { audioFades, audioGain, describeOverload, mixAt } from './_internal/media-audio.ts';
export type { MixSample } from './_internal/media-audio.ts';
export { DUCK_DEFAULTS, MAX_DUCK_DB, MIN_DUCK_RAMP, MAX_DUCK_RAMP, duckSpeechSpans, duckVolume } from './_internal/media-duck.ts';
export type { DuckSettings, SpeechSpan } from './_internal/media-duck.ts';
export { MAX_GENERATED_SECONDS, EQ_TYPES, EQ_MIN_HZ, EQ_MAX_HZ, EQ_MAX_DB, EQ_MIN_Q, EQ_MAX_Q, EQ_DEFAULT_Q, EQ_MAX_FILTERS } from './_internal/media-model.ts';
export type { TrackFilter } from './_internal/media-model.ts';
export { MEDIA_AUDIO_RATE, EQ_PRESETS, activeTrackEq, trackEqFilters, webAudioEqQ } from './_internal/media-eq.ts';
export { BUILT_BY_YOU, CLIP_ROOT, MAX_SCALE, MIN_CLIP, MIN_SCALE, MIN_SNIP, applyOperation, applyOperations, describeOperation, editedPieces, mediaEditingPlan, mediaPlanTimeline, operationTouches, pieceLetter, planPieces, snipPieces, wordIndexAt } from './_internal/edit-model.ts';
export type { CaptionOffset, CaptionPhrasePositionOperation, CaptionPositionOperation, CaptionsPlan, ClipAttachmentOperation, ClipSlideOperation, ClipSplitOperation, ClipState, ClipTrimOperation, CutOperation, ElementOffset, ElementOffsetOperation, MovePieceOperation, NewOperation, Operation, PhrasePosition, PhraseTextOperation, Plan, PlanClip, SnipOperation, Sources, WordTextOperation, WordTimingOperation } from './_internal/edit-model.ts';

/** Product targets shared by the picker preview and the background authoring request. */
export const BROLL_COVERAGE_PERCENT = { light: 20, medium: 40, heavy: 60 } as const;
export const BROLL_SHOT_SECONDS = { calm: 5.5, normal: 3, fast: 1.4 } as const;
export type BrollAmount = keyof typeof BROLL_COVERAGE_PERCENT;
export type VisualPace = keyof typeof BROLL_SHOT_SECONDS;

export function brollTargets(broll: BrollAmount, pace: VisualPace, durationSeconds: number): { coveragePercent: number; shotSeconds: number; count: number } {
  const coveragePercent = BROLL_COVERAGE_PERCENT[broll];
  const shotSeconds = BROLL_SHOT_SECONDS[pace];
  const duration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
  return { coveragePercent, shotSeconds, count: Math.round(duration * coveragePercent / 100 / shotSeconds) };
}

/** Direction's choices and the agent's style lines, shared so "What the agent is told" is what the agent receives. */
export { FORMS, FRAMES, LOOKS, agentTold, formById, frameOf, lookById, musicChoice, styleLook, styleMakeOptions } from './_internal/direction.ts';
export type { FormDefinition, Frame, LookDefinition, MusicChoice, ToldContext } from './_internal/direction.ts';
