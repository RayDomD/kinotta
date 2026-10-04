/**
 * The parts of the core with no file or process access: the pieces mapping and the edit list's model. The web
 * app imports these from here, so the editor previews an edit with the same code Save uses.
 */
export { pieceMap, toSource, toSourceSpans, toTimeline, toTimelineSpan } from './_internal/pieces.ts';
export type { Piece, PieceMap, PlacedPiece } from './_internal/pieces.ts';
export { MIN_SNIP, applyOperation, applyOperations, describeOperation, editedPieces, operationTouches, planPieces, snipPieces } from './_internal/edit-model.ts';
export type { NewOperation, Operation, Plan, SnipOperation, Sources } from './_internal/edit-model.ts';
