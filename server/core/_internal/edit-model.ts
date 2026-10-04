import { KinottaError } from './errors.ts';
import { pieceMap } from './pieces.ts';
import type { Piece } from './pieces.ts';
import type { TranscriptWord } from './types.ts';

/**
 * The edit list's model: what an operation is, and what each kind does to a reel's sources. Pure, with no file or
 * browser access, so Save (in core) and the editor's preview (in the web app, through `server/core/model.ts`) run the
 * same code. A new kind of edit is one member of `Operation`, one `apply` function, and a line in each `switch` below.
 */

/** The plan a reel's sources hold. Only the fields an operation touches are named; the rest passes through. */
export interface Plan {
  /** Source seconds of the video. */
  duration?: number;
  pieces?: Piece[];
  sections?: { id: string; name: string; start: number; end: number }[];
  [key: string]: unknown;
}

/** What operations change: the reel's plan and transcript words. */
export interface Sources {
  plan: Plan;
  words: TranscriptWord[];
}

/** Removes a stretch of the footage (source seconds); the timeline closes over it. */
export interface SnipOperation {
  id: string;
  kind: 'snip';
  from: number;
  to: number;
}

/** Everything the edit list can hold. */
export type Operation = SnipOperation;

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
/** An operation as the caller sends it: the core gives it an id. */
export type NewOperation = DistributiveOmit<Operation, 'id'>;

/** Less than this of footage is not a snip. */
export const MIN_SNIP = 0.005;
const MICROSECOND = 1e6;
const SECONDS_PER_MINUTE = 60;
const HUNDREDTHS = 100;

const round = (seconds: number): number => Math.round(seconds * MICROSECOND) / MICROSECOND;

/** The plan's pieces, or one piece over the whole video when it has none. */
export function planPieces(plan: Plan): Piece[] {
  if (plan.pieces && plan.pieces.length > 0) return plan.pieces;
  if (typeof plan.duration !== 'number') throw new KinottaError('invalid', 'The plan has no pieces and no duration, so there is nothing to edit.');
  return [{ in: 0, out: plan.duration }];
}

/** Pieces with a source range taken out: a piece it covers goes, one it crosses is trimmed, one it sits inside is split in two. */
export function snipPieces(pieces: readonly Piece[], from: number, to: number): Piece[] {
  const kept: Piece[] = [];
  let removed = false;
  for (const piece of pieces) {
    const lo = Math.max(from, piece.in);
    const hi = Math.min(to, piece.out);
    if (hi - lo <= MIN_SNIP) {
      kept.push({ in: piece.in, out: piece.out });
      continue;
    }
    removed = true;
    if (lo - piece.in > MIN_SNIP) kept.push({ in: piece.in, out: round(lo) });
    if (piece.out - hi > MIN_SNIP) kept.push({ in: round(hi), out: piece.out });
  }
  if (!removed) throw new KinottaError('invalid', 'That stretch is already cut out of the reel.');
  if (kept.length === 0) throw new KinottaError('invalid', 'That would remove the whole reel.');
  return kept;
}

function applySnip(sources: Sources, op: SnipOperation): Sources {
  if (!Number.isFinite(op.from) || !Number.isFinite(op.to) || op.from < 0 || op.to - op.from <= MIN_SNIP) {
    throw new KinottaError('invalid', 'A snip needs a stretch of footage, "from" before "to", in seconds.');
  }
  return { ...sources, plan: { ...sources.plan, pieces: snipPieces(planPieces(sources.plan), op.from, op.to) } };
}

/** The sources with one operation written into them. Throws `invalid` for an operation that cannot apply. */
export function applyOperation(sources: Sources, op: Operation): Sources {
  switch (op.kind) {
    case 'snip':
      return applySnip(sources, op);
  }
}

/** The sources with every operation applied in order. */
export function applyOperations(sources: Sources, ops: readonly Operation[]): Sources {
  return ops.reduce(applyOperation, sources);
}

/** Whether an operation changes what a section (a span of source seconds) shows, beyond moving it on the timeline. */
export function operationTouches(op: Operation, section: { start: number; end: number }): boolean {
  switch (op.kind) {
    case 'snip':
      return op.from < section.end && op.to > section.start;
  }
}

const clock = (seconds: number): string => {
  const hundredths = Math.round(Math.max(0, seconds) * HUNDREDTHS);
  const whole = Math.floor(hundredths / HUNDREDTHS);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(Math.floor(whole / SECONDS_PER_MINUTE))}:${pad(whole % SECONDS_PER_MINUTE)}.${pad(hundredths % HUNDREDTHS)}`;
};

/** What the Edits panel shows for an operation: the part of the reel it is about, and what it did, in plain words. */
export function describeOperation(op: Operation): { target: string; text: string } {
  switch (op.kind) {
    case 'snip':
      return { target: 'Footage', text: `Snipped ${(op.to - op.from).toFixed(1)}s (${clock(op.from)} to ${clock(op.to)})` };
  }
}

/** The pieces on the timeline after the operations, with where each starts. */
export function editedPieces(plan: Plan, ops: readonly Operation[]) {
  return pieceMap(applyOperations({ plan, words: [] }, ops).plan.pieces, plan.duration ?? 0);
}
