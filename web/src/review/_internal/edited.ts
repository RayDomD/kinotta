import { applyOperations, pieceMap, toSource, toSourceSpans, toTimeline, toTimelineSpan } from '../../../../server/core/model.ts';
import type { Operation, Piece } from '../../../../server/core/model.ts';

/** Moves things from the saved version's timeline to the timeline with the unsaved edits applied, and back for the page. */
export interface Remap {
  /** A span of the saved timeline on the edited one: trimmed to what remains, or null when the edits removed it. */
  span(start: number, end: number): { start: number; end: number } | null;
  /** A time of the saved timeline on the edited one, or null when the edits removed it. */
  point(time: number): number | null;
  /** The saved version's time for a time of the edited timeline: what its page should show. */
  page(time: number): number;
}

/** Two source times this close are the same second. */
const SAME_SECOND = 1e-6;

const same: Remap = { span: (start, end) => ({ start, end }), point: (time) => time, page: (time) => time };

/** Both lists are the pieces in play order; with the same pieces, nothing moves. */
export function remap(saved: readonly Piece[], edited: readonly Piece[]): Remap {
  if (saved === edited) return same;
  const was = pieceMap(saved, 0);
  const now = pieceMap(edited, 0);
  return {
    span(start, end) {
      // The saved timeline range is some source stretches; ones that run on from each other are one stretch, and
      // when the edits leave a stretch in separate places the longest one wins (as the engine does).
      const joined: { start: number; end: number }[] = [];
      for (const part of toSourceSpans(was, start, end).sort((a, b) => a.start - b.start)) {
        const last = joined[joined.length - 1];
        if (last && part.start - last.end < SAME_SECOND) last.end = Math.max(last.end, part.end);
        else joined.push({ ...part });
      }
      let best: { start: number; end: number } | null = null;
      for (const part of joined) {
        const placed = toTimelineSpan(now, part.start, part.end);
        if (placed && (best === null || placed.end - placed.start > best.end - best.start)) best = placed;
      }
      return best;
    },
    point(time) {
      const source = toSource(was, time);
      return source === null ? null : toTimeline(now, source);
    },
    page(time) {
      const source = toSource(now, time);
      return source === null ? time : (toTimeline(was, source) ?? time);
    },
  };
}

/**
 * The source stretches a stretch of the edited timeline plays. Stretches either side of an earlier snip become one,
 * since the gap between them is already gone; one snip is then one operation.
 */
export function sourceStretches(edited: readonly Piece[], start: number, end: number): { from: number; to: number }[] {
  const merged: { from: number; to: number }[] = [];
  for (const span of toSourceSpans(pieceMap(edited, 0), start, end)) {
    const last = merged[merged.length - 1];
    const gapIsEmpty = last !== undefined && span.start >= last.to - 1e-6 && !edited.some((p) => p.in < span.start - 1e-6 && p.out > last.to + 1e-6 && p.in >= last.to - 1e-6);
    if (last && gapIsEmpty) last.to = span.end;
    else merged.push({ from: span.start, to: span.end });
  }
  return merged;
}

/** The saved version's pieces with the unsaved operations applied, placed on the timeline. The saved list itself when there are none. */
export function editedList<T extends Piece>(saved: readonly T[], operations: readonly Operation[]): readonly Piece[] {
  if (operations.length === 0) return saved;
  try {
    const next = applyOperations({ plan: { pieces: saved.map(({ in: from, out }) => ({ in: from, out })) }, words: [] }, operations);
    return pieceMap(next.plan.pieces, 0).pieces;
  } catch {
    return saved;
  }
}
