/**
 * The parts of the core with no file or process access: the pieces mapping and the edit list's model. The web
 * app imports these from here, so the editor previews an edit with the same code Save uses.
 */
export { pieceMap, toSource, toSourceSpans, toTimeline, toTimelineSpan } from './_internal/pieces.ts';
export type { Piece, PieceMap, PlacedPiece } from './_internal/pieces.ts';
export { BUILT_BY_YOU, CLIP_ROOT, MAX_SCALE, MIN_CLIP, MIN_SCALE, MIN_SNIP, applyOperation, applyOperations, describeOperation, editedPieces, operationTouches, pieceLetter, planPieces, snipPieces, wordIndexAt } from './_internal/edit-model.ts';
export type { CaptionOffset, CaptionPhrasePositionOperation, CaptionPositionOperation, CaptionsPlan, ClipSlideOperation, ClipState, ClipTrimOperation, CutOperation, ElementOffset, ElementOffsetOperation, MovePieceOperation, NewOperation, Operation, PhrasePosition, Plan, PlanClip, SnipOperation, Sources, WordTextOperation, WordTimingOperation } from './_internal/edit-model.ts';
