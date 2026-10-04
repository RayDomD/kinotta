import { MIN_SNIP, applyOperations, pieceMap, toSource, toSourceSpans, toTimeline, toTimelineSpan, wordIndexAt } from '../../../../server/core/model.ts';
import type { Operation, Piece, Plan } from '../../../../server/core/model.ts';
import type { TranscriptWord, Version } from '../../api/index.ts';

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

/** Where a caption sits relative to its default place, in pixels of the 1920x1080 page, and whether the phrase has a position of its own. */
export interface CaptionShift {
  x: number;
  y: number;
  own: boolean;
  /** The reel-wide part of the offset. */
  wide: { x: number; y: number };
  /** The phrase's first word's start in source seconds with the unsaved re-times applied: what a phrase position names. */
  key: number;
}

/**
 * The offset of each caption phrase with the unsaved operations applied over the saved version's captions: the reel-wide
 * position plus the phrase's own, found by its first word. `phraseStarts` are the phrases' first-word starts in source
 * seconds and `words` the saved words in source seconds. Null when the version has captions off.
 */
export function captionShifts(captions: Version['captions'], operations: readonly Operation[], words: readonly TranscriptWord[], phraseStarts: readonly number[]): CaptionShift[] | null {
  if (captions === undefined) return null;
  let plan: Plan = { captions };
  let edited: readonly TranscriptWord[] = words;
  try {
    const moves = operations.filter((op) => op.kind === 'caption-position' || op.kind === 'caption-phrase-position' || op.kind === 'word-timing');
    ({ plan, words: edited } = applyOperations({ plan, words: [...words] }, moves));
  } catch {
    // The list no longer applies to these words; the saved positions show.
  }
  const positions = typeof plan.captions === 'object' ? plan.captions : {};
  return phraseStarts.map((start) => {
    let key = start;
    try {
      key = edited[wordIndexAt(words, start)]!.start;
    } catch {
      // No word opens a phrase there; the phrase keeps the reel-wide position.
    }
    const own = positions.phrases?.find((p) => Math.abs(p.at - key) <= MIN_SNIP);
    const wide = { x: positions.position?.x ?? 0, y: positions.position?.y ?? 0 };
    return { x: wide.x + (own?.x ?? 0), y: wide.y + (own?.y ?? 0), own: own !== undefined, wide, key };
  });
}
