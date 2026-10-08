import { KinottaError } from './errors.ts';

/** A stretch of the source video kept in the reel, in source seconds. */
export interface Piece {
  in: number;
  out: number;
}

/** A piece with where it starts on the timeline. */
export interface PlacedPiece extends Piece {
  at: number;
}

/** A reel's pieces laid end to end: the one mapping between source time and timeline time. */
export interface PieceMap {
  readonly pieces: readonly PlacedPiece[];
  /** Timeline seconds: the pieces' total length. */
  readonly length: number;
}

const EPSILON = 1e-9;

/**
 * Lays pieces end to end in list order. Without pieces the reel is one piece over the whole video, so
 * `videoLength` is needed then. Throws `invalid` for a malformed piece or two that overlap in the source.
 */
export function pieceMap(pieces: readonly Piece[] | undefined, videoLength: number): PieceMap {
  if (pieces !== undefined && !Array.isArray(pieces)) throw new KinottaError('invalid', 'pieces must be a list of source ranges.');
  const list = pieces && pieces.length > 0 ? pieces : [{ in: 0, out: videoLength }];
  let at = 0;
  const placed = list.map((p, i) => {
    if (!p || typeof p !== 'object' || Array.isArray(p) || !Number.isFinite(p.in) || !Number.isFinite(p.out) || p.in < 0 || p.in >= p.out) {
      throw new KinottaError('invalid', `pieces[${i}] needs "in" and "out" in seconds, 0 <= in < out.`);
    }
    const piece = { in: p.in, out: p.out, at };
    at += p.out - p.in;
    return piece;
  });
  const bySource = [...placed].sort((a, b) => a.in - b.in);
  for (let i = 1; i < bySource.length; i += 1) {
    if (bySource[i]!.in < bySource[i - 1]!.out - EPSILON) throw new KinottaError('invalid', 'pieces must not overlap in the source.');
  }
  return { pieces: placed, length: at };
}

/** Timeline time of a source time, or null when it is in a snip. A piece's out belongs to what follows it. */
export function toTimeline(map: PieceMap, sourceTime: number): number | null {
  const piece = map.pieces.find((p) => sourceTime >= p.in && sourceTime < p.out);
  return piece ? piece.at + sourceTime - piece.in : null;
}

/**
 * Source time of a timeline time in 0 to length. A time on a join takes the piece that starts there; the very
 * end takes the last piece's out. Null outside the timeline.
 */
export function toSource(map: PieceMap, timelineTime: number): number | null {
  const piece = map.pieces.find((p) => timelineTime >= p.at && timelineTime < p.at + p.out - p.in);
  if (piece) return piece.in + timelineTime - piece.at;
  const last = map.pieces[map.pieces.length - 1];
  return last && Math.abs(timelineTime - map.length) < EPSILON ? last.out : null;
}

/**
 * A source range on the timeline, or null when it lies in a snip. A range that crosses a snip is trimmed to what
 * remains and closed up; when reordering leaves it in separate places, the longest stretch wins.
 */
export function toTimelineSpan(map: PieceMap, start: number, end: number): { start: number; end: number } | null {
  const runs: { start: number; end: number }[] = [];
  for (const p of map.pieces) {
    const lo = Math.max(start, p.in);
    const hi = Math.min(end, p.out);
    if (hi - lo > EPSILON) runs.push({ start: p.at + lo - p.in, end: p.at + hi - p.in });
  }
  runs.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const run of runs) {
    const prev = merged[merged.length - 1];
    if (prev && run.start - prev.end < EPSILON) prev.end = run.end;
    else merged.push({ ...run });
  }
  return merged.reduce<{ start: number; end: number } | null>((best, r) => (!best || r.end - r.start > best.end - best.start ? r : best), null);
}

/** The source ranges a timeline range plays, in play order (a range over a join yields one per piece it touches). */
export function toSourceSpans(map: PieceMap, start: number, end: number): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  for (const p of map.pieces) {
    const lo = Math.max(start, p.at);
    const hi = Math.min(end, p.at + p.out - p.in);
    if (hi - lo > EPSILON) spans.push({ start: p.in + lo - p.at, end: p.in + hi - p.at });
  }
  return spans;
}
