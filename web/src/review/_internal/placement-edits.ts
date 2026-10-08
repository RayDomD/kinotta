import type { MediaPlacement, MediaTimeline, SourcePlacement } from '../../../../server/core/model.ts';
import type { MediaEntry } from '../../api/index.ts';

type Placed = MediaTimeline['placements'][number];

/** Moves smaller than this are rounding, not a different position. */
const EPSILON = 1e-6;
const round = (seconds: number): number => Math.round(seconds * 100) / 100;

/**
 * The move to make when snapping is on: an edge that would pass the playhead or a cut stops on it instead. A point the
 * edge already sits on is not a stop, so the next press moves past it.
 */
export function snapDelta(edges: readonly number[], delta: number, points: readonly number[], reach: number): number {
  let best: number | null = null;
  for (const edge of edges) {
    for (const point of points) {
      const distance = point - edge;
      if (Math.sign(distance) !== Math.sign(delta) || Math.abs(distance) <= EPSILON) continue;
      if (Math.abs(distance) <= Math.abs(delta) + reach + EPSILON && (best === null || Math.abs(distance) < Math.abs(best))) best = distance;
    }
  }
  return round(best ?? delta);
}

/** The edges a move can stop on: the playhead and every placement's start and end, except the moving one. */
export function snapPoints(timeline: MediaTimeline, moving: string, playhead: number): number[] {
  return [playhead, ...timeline.placements.filter((p) => p.id !== moving).flatMap((p) => [p.at, p.at + p.duration])];
}

/** Pointer cuts land on the nearest nearby edge, regardless of approach direction. */
export function snapTime(time: number, points: readonly number[], reach: number): number {
  const nearby = points.filter((point) => Math.abs(point - time) <= reach).sort((a, b) => Math.abs(a - time) - Math.abs(b - time));
  return round(nearby[0] ?? time);
}

/** Trim one end of a placement to the playhead. Null when the playhead is not inside it. */
export function trimToPlayhead(p: Placed, image: boolean, time: number, edge: 'start' | 'end'): Partial<SourcePlacement> | null {
  const local = round(time - p.at);
  if (local <= 0 || local >= p.duration) return null;
  if (p.role === 'gap') return { duration: round(edge === 'end' ? local : p.duration - local) };
  // Images have only a duration. A loop's range is what repeats, so trimming it changes only how long it plays.
  const timed = image || (p.role !== 'main' && !!p.loop);
  if (edge === 'end') {
    if (timed) return { duration: local };
    return p.role === 'main' ? { out: round(p.in + local) } : { out: round(p.in + local), duration: local };
  }
  if (p.role === 'main') return timed ? { duration: round(p.duration - local) } : { in: round(p.in + local) };
  return { at: round(time), duration: round(p.duration - local), ...(timed ? {} : { in: round(p.in + local) }) };
}

/** A new use of the same media with the same settings: right after it in the sequence, or right after it on reel time. */
export function duplicateOf(raw: MediaPlacement, placed: Placed, id: string, sequence: readonly string[]): { placement: MediaPlacement; index?: number } {
  const { origin: _origin, ...copy } = raw;
  if (raw.role === 'main' || raw.role === 'gap') return { placement: { ...copy, id }, index: sequence.indexOf(raw.id) + 1 };
  return { placement: { ...copy, id, at: round(placed.at + placed.duration), ...(raw.attachment ? { attachment: { ...raw.attachment, offset: (raw.attachment.offset ?? 0) + placed.duration } } : {}) } as MediaPlacement };
}

/** Different media in the same role and time. Corrections belong to the old content, so they are not carried. */
export function replacementFor(raw: SourcePlacement, placed: Placed, entry: MediaEntry, id: string): SourcePlacement {
  const { words: _words, origin: _origin, volume: _volume, ...kept } = raw;
  if (entry.kind === 'image' || entry.audio === false) delete kept.track;
  const length = placed.duration;
  if (entry.kind === 'image') return { ...kept, id, source: entry.id, in: 0, out: 0, duration: length };
  const out = Math.min(entry.duration, length);
  const { duration: _duration, ...rest } = kept;
  return { ...rest, id, source: entry.id, in: 0, out, ...(raw.role !== 'main' && raw.duration !== undefined ? { duration: Math.min(raw.duration, out) } : {}), loop: raw.loop && entry.kind !== 'video' ? raw.loop : undefined };
}
