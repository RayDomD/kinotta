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

/** Splits the piece holding a source time into two at it. Removes nothing. */
export interface CutOperation {
  id: string;
  kind: 'cut';
  at: number;
}

/** Moves the piece at index `from` of the current play order to index `to` (its place in the order after the move). */
export interface MovePieceOperation {
  id: string;
  kind: 'move-piece';
  from: number;
  to: number;
}

/** Changes the text of the word that starts at a source time. `was` is what it read, kept only to word the edit in the panel. */
export interface WordTextOperation {
  id: string;
  kind: 'word-text';
  at: number;
  text: string;
  was?: string;
}

/** Re-times the word that starts at a source time: its new start and end, in source seconds. Phrase breaks stay automatic. */
export interface WordTimingOperation {
  id: string;
  kind: 'word-timing';
  at: number;
  start: number;
  end: number;
}

/** Everything the edit list can hold. */
export type Operation = SnipOperation | CutOperation | MovePieceOperation | WordTextOperation | WordTimingOperation;

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

function applyCut(sources: Sources, op: CutOperation): Sources {
  if (!Number.isFinite(op.at) || op.at < 0) throw new KinottaError('invalid', 'A cut needs a time in the footage, in seconds.');
  const pieces = planPieces(sources.plan);
  const index = pieces.findIndex((p) => op.at - p.in > MIN_SNIP && p.out - op.at > MIN_SNIP);
  if (index < 0 && pieces.some((p) => Math.abs(op.at - p.in) <= MIN_SNIP || Math.abs(op.at - p.out) <= MIN_SNIP)) throw new KinottaError('invalid', 'There is already a cut there.');
  if (index < 0) throw new KinottaError('invalid', 'That time is not inside the footage that is in the reel.');
  const piece = pieces[index]!;
  const at = round(op.at);
  const next = [...pieces.slice(0, index), { in: piece.in, out: at }, { in: at, out: piece.out }, ...pieces.slice(index + 1)];
  return { ...sources, plan: { ...sources.plan, pieces: next } };
}

/** How many separate stretches of the timeline the source range `start` to `end` plays in: 1 when it is contiguous. */
function sectionRuns(pieces: readonly Piece[], start: number, end: number): number {
  let runs = 0;
  let at = 0;
  let runEnd = Number.NaN;
  for (const p of pieces) {
    const lo = Math.max(start, p.in);
    const hi = Math.min(end, p.out);
    if (hi - lo > MIN_SNIP) {
      const from = at + lo - p.in;
      if (!(Math.abs(from - runEnd) < MIN_SNIP)) runs += 1;
      runEnd = at + hi - p.in;
    }
    at += p.out - p.in;
  }
  return runs;
}

function applyMovePiece(sources: Sources, op: MovePieceOperation): Sources {
  const pieces = planPieces(sources.plan);
  const valid = (n: number): boolean => Number.isInteger(n) && n >= 0 && n < pieces.length;
  if (!valid(op.from) || !valid(op.to)) throw new KinottaError('invalid', 'That piece, or the place to move it to, is not in the reel.');
  if (op.from === op.to) throw new KinottaError('invalid', 'The piece is already there.');
  const next = [...pieces];
  next.splice(op.to, 0, next.splice(op.from, 1)[0]!);
  // Sections stay contiguous: a move that would cut a section's footage in two on the timeline is refused.
  const split = (sources.plan.sections ?? []).find((s) => sectionRuns(next, s.start, s.end) > 1);
  if (split) throw new KinottaError('invalid', `That would split the section "${split.name}". Cut at the section's edge first, or move the whole section.`);
  return { ...sources, plan: { ...sources.plan, pieces: next } };
}

/** Index of the word that starts at a source time (within a hair of it), or throws `invalid`. */
export function wordIndexAt(words: readonly TranscriptWord[], at: number): number {
  if (!Number.isFinite(at)) throw new KinottaError('invalid', 'A word edit needs the time the word starts at, in seconds.');
  let best = -1;
  words.forEach((w, i) => {
    if (Math.abs(w.start - at) <= MIN_SNIP && (best < 0 || Math.abs(w.start - at) < Math.abs(words[best]!.start - at))) best = i;
  });
  if (best < 0) throw new KinottaError('invalid', 'There is no word that starts there. An earlier edit may have moved it.');
  return best;
}

function applyWordText(sources: Sources, op: WordTextOperation): Sources {
  const text = typeof op.text === 'string' ? op.text.trim() : '';
  if (text === '') throw new KinottaError('invalid', 'A word cannot be empty.');
  const index = wordIndexAt(sources.words, op.at);
  const words = sources.words.map((w, i) => (i === index ? { ...w, text } : w));
  return { ...sources, words };
}

function applyWordTiming(sources: Sources, op: WordTimingOperation): Sources {
  if (!Number.isFinite(op.start) || !Number.isFinite(op.end) || op.start < 0 || op.end - op.start <= MIN_SNIP) {
    throw new KinottaError('invalid', 'A word needs a start before its end, in seconds.');
  }
  const index = wordIndexAt(sources.words, op.at);
  const start = round(op.start);
  const end = round(op.end);
  if (sources.words.some((w, i) => i !== index && w.start < end - MIN_SNIP && w.end > start + MIN_SNIP)) {
    throw new KinottaError('invalid', 'That would run the word over the one next to it.');
  }
  return { ...sources, words: sources.words.map((w, i) => (i === index ? { ...w, start, end } : w)) };
}

/** The sources with one operation written into them. Throws `invalid` for an operation that cannot apply. */
export function applyOperation(sources: Sources, op: Operation): Sources {
  switch (op.kind) {
    case 'snip':
      return applySnip(sources, op);
    case 'cut':
      return applyCut(sources, op);
    case 'move-piece':
      return applyMovePiece(sources, op);
    case 'word-text':
      return applyWordText(sources, op);
    case 'word-timing':
      return applyWordTiming(sources, op);
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
    case 'cut':
      return false;
    // Which sections a move changes depends on the pieces; Save compares each section's order on the timeline instead.
    case 'move-piece':
      return false;
    // A word edit changes the captions and spoken line of the section the word is in (before or after a re-time).
    case 'word-text':
      return op.at >= section.start && op.at < section.end;
    case 'word-timing':
      return (op.at >= section.start && op.at < section.end) || (op.start < section.end && op.end > section.start);
  }
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Piece letters: A, B, C, then AA, AB. */
export function pieceLetter(index: number): string {
  return index < LETTERS.length ? LETTERS[index]! : `${LETTERS[Math.floor(index / LETTERS.length) - 1]}${LETTERS[index % LETTERS.length]}`;
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
    case 'cut':
      return { target: 'Footage', text: `Cut into two pieces at ${clock(op.at)}` };
    case 'move-piece':
      return { target: 'Footage', text: `Moved piece ${pieceLetter(op.from)} to place ${op.to + 1}` };
    case 'word-text':
      return { target: 'Word', text: op.was ? `Changed “${op.was}” to “${op.text}”` : `Changed the word to “${op.text}”` };
    case 'word-timing':
      return { target: 'Word', text: `Re-timed to ${clock(op.start)} to ${clock(op.end)}` };
  }
}

/** The pieces on the timeline after the operations, with where each starts. */
export function editedPieces(plan: Plan, ops: readonly Operation[]) {
  return pieceMap(applyOperations({ plan, words: [] }, ops).plan.pieces, plan.duration ?? 0);
}
