import { KinottaError } from './errors.ts';
import { pieceMap } from './pieces.ts';
import type { Piece } from './pieces.ts';
import type { TranscriptWord } from './types.ts';
import type { MediaPlacement, MediaPlan, MediaSource, MediaTrack, SourcePlacement } from './media-model.ts';
import { legacyMedia, mediaSpans, mediaTimeline, mediaWithTracks, mediaWords } from './media-model.ts';

/** An attached graphic must retain its whole source range to one microsecond. */
const ATTACHED_RANGE_TOLERANCE = 1e-6;
/** Caption looks the page builder draws: the same list as the engine's CAPTION_LOOKS. */
const CAPTION_LOOKS: readonly string[] = ['highlight', 'phrase', 'words'];

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isOffset = (value: unknown): boolean => isRecord(value) && Number.isFinite(value.x) && Number.isFinite(value.y);

/**
 * Refuses a native plan whose clips, sections or caption settings are not the shapes the editor and the page builder
 * read, naming what is wrong, rather than failing later on a missing field. Mirrors the engine's check_plan_parts.
 */
function checkPlanParts(plan: Plan): void {
  const wholeCycle = (cycle: unknown): boolean => cycle === undefined || (Number.isInteger(cycle) && (cycle as number) >= 0);
  const range = (start: unknown, end: unknown): boolean => Number.isFinite(start) && Number.isFinite(end) && (start as number) < (end as number);
  if (plan.clips !== undefined && !Array.isArray(plan.clips)) throw new KinottaError('invalid', "A plan's clips must be a list.");
  for (const [index, clip] of (plan.clips ?? []).entries()) {
    if (!isRecord(clip) || typeof clip.id !== 'string') throw new KinottaError('invalid', `The clip at position ${index + 1} needs a text id.`);
    if (clip.placement === undefined) continue;
    if (typeof clip.placement !== 'string') throw new KinottaError('invalid', `The clip ${clip.id} names its placement with text.`);
    if (!range(clip.in, clip.out)) throw new KinottaError('invalid', `The clip ${clip.id} needs its source range: "in" before "out", in seconds.`);
    if (!wholeCycle(clip.cycle)) throw new KinottaError('invalid', `The clip ${clip.id} names a loop cycle that is not a whole number from 0.`);
  }
  if (plan.sections !== undefined && !Array.isArray(plan.sections)) throw new KinottaError('invalid', "A plan's sections must be a list.");
  for (const [index, section] of (plan.sections ?? []).entries()) {
    if (!isRecord(section) || typeof section.id !== 'string') throw new KinottaError('invalid', `The section at position ${index + 1} needs a text id.`);
    if (section.placement === undefined) continue;
    if (typeof section.placement !== 'string') throw new KinottaError('invalid', `The section ${section.id} names its placement with text.`);
    if (!range(section.start, section.end)) throw new KinottaError('invalid', `The section ${section.id} needs its source range: "start" before "end", in seconds.`);
    if (!wholeCycle(section.cycle)) throw new KinottaError('invalid', `The section ${section.id} names a loop cycle that is not a whole number from 0.`);
  }
  const captions: unknown = plan.captions;
  if (captions === undefined || captions === null || typeof captions === 'boolean') return;
  if (!isRecord(captions)) throw new KinottaError('invalid', 'The captions setting must be true or an object of caption settings.');
  if (captions.look !== undefined && !CAPTION_LOOKS.includes(captions.look as string)) throw new KinottaError('invalid', `The captions look must be one of ${CAPTION_LOOKS.join(', ')}.`);
  if (captions.color !== undefined && typeof captions.color !== 'string') throw new KinottaError('invalid', 'The captions color must be a CSS color in text.');
  if (captions.position !== undefined && !isOffset(captions.position)) throw new KinottaError('invalid', 'The captions position needs a numeric x and y.');
  if (captions.phrases === undefined) return;
  if (!Array.isArray(captions.phrases) || !captions.phrases.every((p) => isOffset(p) && Number.isFinite((p as Record<string, unknown>).at) && ['string', 'undefined'].includes(typeof (p as Record<string, unknown>).placement))) {
    throw new KinottaError('invalid', 'The captions phrase positions must be a list, each with a numeric at, x and y.');
  }
}

/**
 * The edit list's model: what an operation is, and what each kind does to a reel's sources. Pure, with no file or
 * browser access, so Save (in core) and the editor's preview (in the web app, through `server/core/model.ts`) run the
 * same code. A new kind of edit is one member of `Operation`, one `apply` function, and a line in each `switch` below.
 */

/** An offset in pixels of the 1920x1080 page, from where captions sit by default. */
export interface CaptionOffset {
  x: number;
  y: number;
}

/** A phrase's own offset, keyed by its first word's start in source seconds. It adds to the reel-wide one. */
export interface PhrasePosition extends CaptionOffset {
  at: number;
  placement?: string;
}

/** The plan's `captions` once it is more than `true`: the look and colour pass through. */
export interface CaptionsPlan {
  look?: string;
  color?: string;
  position?: CaptionOffset;
  phrases?: PhrasePosition[];
}

/** One state of a clip that changes (`stills`): `from` is clip-local seconds, `still` seconds into the state. */
export interface ClipState {
  from: number;
  title?: string;
  still?: number;
  [key: string]: unknown;
}

/** Where an element sits against where the clip puts it: CSS px of its parent's space, and a scale factor about its centre. */
export interface ElementOffset {
  x: number;
  y: number;
  scale: number;
}

/** The reserved element name for a clip's root: moving it moves the whole clip. */
export const CLIP_ROOT = '@clip';
/** The `builtBy` of a version Kinotta built from the owner's edits, not an agent. */
export const BUILT_BY_YOU = 'you';

/** A b-roll clip of the plan: `in` and `out` are source seconds; `slid` marks one moved off the words it was placed on. */
export interface PlanClip {
  id: string;
  title?: string;
  in: number;
  out: number;
  /** When set, in/out belong to this footage occurrence instead of reel time. */
  placement?: string;
  /** Which pass of a looping placement the source range means, from 0. Required for a loop, absent otherwise. */
  cycle?: number;
  attachmentBroken?: boolean;
  /** Fragment identity retained by explicit splits, including when the fragment path is implicit. */
  splitFrom?: string;
  /** Seconds into the clip the shot's still is drawn, for a clip with one state. */
  still?: number;
  stills?: ClipState[];
  slid?: boolean;
  /** Offsets by element name (a `data-el`, or `@clip` for the clip's root). the engine applies them with CSS `translate` and `scale`. */
  offsets?: Record<string, ElementOffset>;
  [key: string]: unknown;
}

/** The plan a reel's sources hold. Only the fields an operation touches are named; the rest passes through. */
export interface Plan {
  media?: MediaPlan;
  /** Source seconds of the video. */
  duration?: number;
  pieces?: Piece[];
  clips?: PlanClip[];
  captions?: boolean | CaptionsPlan;
  sections?: { id: string; name: string; start: number; end: number; placement?: string; cycle?: number; partOf?: string }[];
  [key: string]: unknown;
}

/** What operations change: the reel's plan and transcript words. */
export interface Sources {
  plan: Plan;
  words: TranscriptWord[];
  /** Probed legacy footage metadata, kept outside the authored plan. */
  videoAudio?: boolean;
}

/** Native attached ranges on reel time. Keep all section parts and retain broken graphics for explicit repair. */
export function mediaPlanTimeline(plan: Plan): Plan {
  if (!plan.media) return plan;
  checkPlanParts(plan);
  const media = plan.media;
  const sections = (plan.sections ?? []).flatMap((section) => {
    if (!section.placement) return [section];
    const spans = mediaSpans(media, section.placement, section.start, section.end, plan.duration, section.cycle);
    return spans.map((span, index) => ({ ...section, id: index === 0 ? section.id : `${section.id}~part-${index + 1}`, name: spans.length > 1 ? `${section.name} (part ${index + 1})` : section.name, start: span.start, end: span.end, ...(spans.length > 1 ? { partOf: section.id } : {}) }));
  });
  const clips = (plan.clips ?? []).map((clip) => {
    if (!clip.placement) return clip;
    const spans = mediaSpans(media, clip.placement, clip.in, clip.out, plan.duration, clip.cycle);
    const span = spans[0];
    if (spans.length !== 1 || !span || Math.abs(span.sourceStart - clip.in) > ATTACHED_RANGE_TOLERANCE || Math.abs(span.sourceEnd - clip.out) > ATTACHED_RANGE_TOLERANCE) return { ...clip, attachmentBroken: true };
    const section = sections.find((s) => (s.id === clip.section || s.partOf === clip.section) && s.start <= span.start && s.end >= span.end);
    return { ...clip, in: span.start, out: span.end, attachmentBroken: false, ...(section ? { section: section.id } : {}) };
  });
  return { ...plan, duration: mediaTimeline(media, plan.duration).duration, sections, clips };
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
  /** Required for a word in the new media model. `at` remains source time. */
  placement?: string;
}

/** Re-times the word that starts at a source time: its new start and end, in source seconds. Phrase breaks stay automatic. */
export interface WordTimingOperation {
  placement?: string;
  id: string;
  kind: 'word-timing';
  at: number;
  start: number;
  end: number;
}

/**
 * Retypes a caption phrase: the words from `from` to `to` (a first word's start and a last word's end, in source seconds)
 * become the words of `text`. The same count keeps each word's timing; another count spreads the new words over the old
 * span by their length. Empty text removes the words. `was` is what the phrase read, kept only to word the edit in the panel.
 */
export interface PhraseTextOperation {
  placement?: string;
  id: string;
  kind: 'phrase-text';
  from: number;
  to: number;
  text: string;
  was?: string;
}

/** Moves every caption: the reel-wide offset (`captions.position`). A new one replaces the last. */
export interface CaptionPositionOperation {
  id: string;
  kind: 'caption-position';
  x: number;
  y: number;
}

/** Moves one caption phrase: its own offset, on top of the reel-wide one, keyed by its first word's start in source seconds. */
export interface CaptionPhrasePositionOperation {
  id: string;
  kind: 'caption-phrase-position';
  at: number;
  x: number;
  y: number;
  placement?: string;
}

/** Trims a clip: its new `in` and `out`, in source seconds. */
export interface ClipTrimOperation {
  id: string;
  kind: 'clip-trim';
  clip: string;
  /** Native repair target, including a legacy range being converted on this first edit. */
  placement?: string;
  in: number;
  out: number;
}

/** Explicit repair of a graphic's word-linked source range. */
export interface ClipAttachmentOperation {
  id: string;
  kind: 'clip-attachment';
  clip: string;
  placement: string;
  in: number;
  out: number;
  /** The pass of a looping placement the range means, from 0. Required to attach to a loop. */
  cycle?: number;
}

export interface ClipSplitOperation {
  id: string;
  kind: 'clip-split';
  clip: string;
}

/** Slides a clip along the footage by `delta` seconds (negative is earlier) and marks it `slid`: off the words it was placed on. */
export interface ClipSlideOperation {
  id: string;
  kind: 'clip-slide';
  clip: string;
  placement?: string;
  delta: number;
}

/** Moves and scales one element of a clip: its new offset, replacing the last one. An offset of 0, 0 at scale 1 puts it back. */
export interface ElementOffsetOperation {
  id: string;
  kind: 'element-offset';
  clip: string;
  element: string;
  x: number;
  y: number;
  scale: number;
}

/** Everything the edit list can hold. */
export interface PlacementAddOperation {
  id: string;
  kind: 'placement-add';
  placement: MediaPlacement;
  source?: MediaSource;
  /** Main-sequence insertion index. Omitted means append. */
  index?: number;
}

export interface PlacementChangeOperation {
  id: string;
  kind: 'placement-change';
  placement: string;
  changes: Partial<Pick<SourcePlacement, 'track' | 'in' | 'out' | 'at' | 'duration' | 'loop' | 'speech' | 'gain' | 'mute' | 'fadeIn' | 'fadeOut' | 'volume' | 'framing' | 'attachment'>>;
}

export interface PlacementRemoveOperation {
  id: string;
  kind: 'placement-remove';
  placement: string;
}

export interface PlacementMoveOperation {
  id: string;
  kind: 'placement-move';
  placement: string;
  index: number;
}

/** Inserts draw after footage. Their list order decides which overlapping picture is in front. */
export interface PlacementLayerOperation {
  id: string;
  kind: 'placement-layer';
  placement: string;
  direction: 'front' | 'back';
}

/** Cuts one use into two at a moment, removing nothing. The second half gets `<id>~<operation id>`. */
export interface PlacementSplitOperation {
  id: string;
  kind: 'placement-split';
  placement: string;
  /** Seconds from the start of the placement. */
  at: number;
}

/** Removes a timeline range from the main sequence. Footage sound stays with the surviving pieces. */
export interface PlacementSnipOperation { id: string; kind: 'placement-snip'; from: number; to: number }

export interface PlacementReplaceOperation {
  id: string;
  kind: 'placement-replace';
  target: string;
  placement: MediaPlacement;
  source?: MediaSource;
}

export interface TrackAddOperation { id: string; kind: 'track-add'; track: MediaTrack }
export interface TrackChangeOperation { id: string; kind: 'track-change'; track: string; changes: Partial<Pick<MediaTrack, 'name' | 'gain' | 'mute'>> }
export interface TrackMoveOperation { id: string; kind: 'track-move'; track: string; index: number }
export interface TrackRemoveOperation { id: string; kind: 'track-remove'; track: string }
export interface PlacementDetachOperation { id: string; kind: 'placement-detach'; placement: string; track: string }

export type Operation =
  | TrackAddOperation
  | TrackChangeOperation
  | TrackMoveOperation
  | TrackRemoveOperation
  | PlacementDetachOperation
  | PlacementAddOperation
  | PlacementChangeOperation
  | PlacementRemoveOperation
  | PlacementMoveOperation
  | PlacementLayerOperation
  | PlacementReplaceOperation
  | PlacementSplitOperation
  | PlacementSnipOperation
  | SnipOperation
  | CutOperation
  | MovePieceOperation
  | WordTextOperation
  | WordTimingOperation
  | PhraseTextOperation
  | CaptionPositionOperation
  | CaptionPhrasePositionOperation
  | ClipTrimOperation
  | ClipAttachmentOperation
  | ClipSplitOperation
  | ClipSlideOperation
  | ElementOffsetOperation;

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
/** An operation as the caller sends it: the core gives it an id. */
export type NewOperation = DistributiveOmit<Operation, 'id'>;

/** Less than this of footage is not a snip. */
export const MIN_SNIP = 0.005;
/** A clip is never trimmed shorter than this (seconds). */
export const MIN_CLIP = 0.2;
/** An element is scaled within these factors. */
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 10;
const MICROSECOND = 1e6;
const SECONDS_PER_MINUTE = 60;
const HUNDREDTHS = 100;
const PERCENT = 100;
/** A split this close to either end would leave a half too short to see or hear. */
const SPLIT_EDGE = 0.01;

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
  if (sources.plan.media) {
    const media = sources.plan.media;
    if (!op.placement) throw new KinottaError('invalid', 'A word edit needs its placement identity.');
    const placement = media.placements.find((p) => p.id === op.placement);
    if (!placement || placement.role === 'gap' || (placement.role === 'main' ? !media.sequence.includes(placement.id) : !placement.speech)) throw new KinottaError('invalid', `Speech placement ${op.placement} is missing.`);
    const source = media.sources.find((s) => s.id === placement.source);
    const before = placement.words ?? source?.words ?? [];
    const index = wordIndexAt(before, op.at);
    if (before[index]!.start < placement.in || before[index]!.start >= placement.out) throw new KinottaError('invalid', 'That word was removed from its placement.');
    const words = before.map((w, i) => i === index ? { ...w, text } : w);
    const next = { ...media, placements: media.placements.map((p) => p.id === placement.id ? { ...placement, words } : p) };
    return { ...sources, plan: { ...sources.plan, media: next }, words: mediaWords(next, sources.plan.duration ?? 0) };
  }
  const index = wordIndexAt(sources.words, op.at);
  const words = sources.words.map((w, i) => (i === index ? { ...w, text } : w));
  return { ...sources, words };
}

/** A word's share of a retyped phrase's span: its letters plus one for the gap after it. */
const wordWeight = (text: string): number => text.length + 1;

function applyPhraseText(sources: Sources, op: PhraseTextOperation): Sources {
  // Empty text deliberately removes the words; missing or non-text is a malformed edit, not a removal.
  if (typeof op.text !== 'string') throw new KinottaError('invalid', 'A caption edit needs its new text. Empty text removes the words.');
  if (sources.plan.media) return changePlacementWords(sources, op.placement, op.from, op.to, (words) => applyPhraseText({ plan: {}, words }, op).words);
  if (!Number.isFinite(op.from) || !Number.isFinite(op.to) || op.to <= op.from) throw new KinottaError('invalid', 'A caption edit needs the span of its words, "from" before "to", in seconds.');
  const inside = (w: TranscriptWord): boolean => w.start >= op.from - MIN_SNIP && w.end <= op.to + MIN_SNIP;
  const first = sources.words.findIndex(inside);
  if (first < 0) throw new KinottaError('invalid', 'There are no words there. An earlier edit may have moved them.');
  let last = first;
  while (last + 1 < sources.words.length && inside(sources.words[last + 1]!)) last += 1;
  const old = sources.words.slice(first, last + 1);
  const texts = typeof op.text === 'string' ? op.text.split(/\s+/).filter((t) => t !== '') : [];
  if (texts.join(' ') === old.map((w) => w.text).join(' ')) throw new KinottaError('invalid', 'The caption already reads that.');
  let next: TranscriptWord[];
  if (texts.length === old.length) next = old.map((w, i) => ({ ...w, text: texts[i]! }));
  else {
    const start = old[0]!.start;
    const span = old[old.length - 1]!.end - start;
    const total = texts.reduce((sum, t) => sum + wordWeight(t), 0);
    let at = 0;
    next = texts.map((text) => {
      const from = round(start + (span * at) / total);
      at += wordWeight(text);
      return { text, start: from, end: round(start + (span * at) / total) };
    });
  }
  return { ...sources, words: [...sources.words.slice(0, first), ...next, ...sources.words.slice(last + 1)] };
}

/** The plan's captions as an object to change, or `invalid` when captions are off. */
function captionsOf(plan: Plan): CaptionsPlan {
  if (plan.captions === true) return {};
  if (plan.captions && typeof plan.captions === 'object') return plan.captions;
  throw new KinottaError('invalid', 'Captions are off for this reel, so there is nothing to move.');
}

/** The plan with these captions: `position` and `phrases` left out when empty, and `true` kept when nothing else is set. */
function withCaptions(plan: Plan, captions: CaptionsPlan): Plan {
  const { position, phrases, ...rest } = captions;
  const next: CaptionsPlan = { ...rest, ...(position ? { position } : {}), ...(phrases && phrases.length > 0 ? { phrases } : {}) };
  return { ...plan, captions: Object.keys(next).length === 0 && plan.captions === true ? true : next };
}

function offsetOf(op: { x: number; y: number }): CaptionOffset {
  if (!Number.isFinite(op.x) || !Number.isFinite(op.y)) throw new KinottaError('invalid', 'A caption position needs x and y as numbers, in pixels.');
  return { x: round(op.x), y: round(op.y) };
}

const isOrigin = (offset: CaptionOffset): boolean => offset.x === 0 && offset.y === 0;

function applyCaptionPosition(sources: Sources, op: CaptionPositionOperation): Sources {
  const { position: _was, ...captions } = captionsOf(sources.plan);
  const offset = offsetOf(op);
  return { ...sources, plan: withCaptions(sources.plan, isOrigin(offset) ? captions : { ...captions, position: offset }) };
}

function applyCaptionPhrasePosition(sources: Sources, op: CaptionPhrasePositionOperation): Sources {
  const captions = captionsOf(sources.plan);
  const offset = offsetOf(op);
  let words = sources.words;
  if (sources.plan.media) {
    if (!op.placement) throw new KinottaError('invalid', 'A caption phrase needs its placement identity.');
    const media = sources.plan.media;
    const placement = media.placements.find((p) => p.id === op.placement);
    if (!placement || placement.role === 'gap' || op.at < placement.in || op.at >= placement.out) throw new KinottaError('invalid', 'That caption placement or word is missing.');
    words = placement.words ?? media.sources.find((s) => s.id === placement.source)!.words ?? [];
  }
  const at = words[wordIndexAt(words, op.at)]!.start;
  const others = (captions.phrases ?? []).filter((p) => p.placement !== op.placement || Math.abs(p.at - at) > MIN_SNIP);
  return { ...sources, plan: withCaptions(sources.plan, { ...captions, phrases: isOrigin(offset) ? others : [...others, { at, ...offset, ...(op.placement ? { placement: op.placement } : {}) }].sort((a, b) => a.at - b.at) }) };
}

/** A phrase position follows its first word when that word is re-timed: it is keyed by the word's start. */
function followWord(plan: Plan, from: number, to: number, placement?: string): Plan {
  const captions = plan.captions;
  if (!captions || typeof captions !== 'object' || !captions.phrases?.some((p) => Math.abs(p.at - from) <= MIN_SNIP)) return plan;
  const moved = captions.phrases.map((p) => (p.placement === placement && Math.abs(p.at - from) <= MIN_SNIP ? { ...p, at: to } : p));
  const unique = moved.filter((p, i) => moved.findIndex((q) => q.placement === p.placement && Math.abs(q.at - p.at) <= MIN_SNIP) === i);
  return { ...plan, captions: { ...captions, phrases: unique.sort((a, b) => a.at - b.at) } };
}

function applyWordTiming(sources: Sources, op: WordTimingOperation): Sources {
  if (sources.plan.media) {
    const changed = changePlacementWords(sources, op.placement, op.at, op.at, (words) => {
    const placement = sources.plan.media!.placements.find((p) => p.id === op.placement)!;
    if (placement.role === 'gap' || op.start < placement.in || op.end > placement.out) throw new KinottaError('invalid', 'The word must stay inside its placement range.');
    return applyWordTiming({ plan: {}, words }, op).words;
    });
    return { ...changed, plan: followWord(changed.plan, op.at, round(op.start), op.placement) };
  }
  if (!Number.isFinite(op.start) || !Number.isFinite(op.end) || op.start < 0 || op.end - op.start <= MIN_SNIP) {
    throw new KinottaError('invalid', 'A word needs a start before its end, in seconds.');
  }
  const index = wordIndexAt(sources.words, op.at);
  const start = round(op.start);
  const end = round(op.end);
  if (sources.words.some((w, i) => i !== index && w.start < end - MIN_SNIP && w.end > start + MIN_SNIP)) {
    throw new KinottaError('invalid', 'That would run the word over the one next to it.');
  }
  const was = sources.words[index]!.start;
  return { ...sources, plan: followWord(sources.plan, was, start), words: sources.words.map((w, i) => (i === index ? { ...w, start, end } : w)) };
}

function clipIndex(plan: Plan, id: string): number {
  const index = (plan.clips ?? []).findIndex((c) => c.id === id);
  if (index < 0) throw new KinottaError('invalid', `There is no clip "${id}" in the plan.`);
  return index;
}

const withClip = (plan: Plan, index: number, clip: PlanClip): Plan => ({ ...plan, clips: plan.clips!.map((c, i) => (i === index ? clip : c)) });

/** A clip's states kept to those that begin inside its (trimmed) length, and a `still` that no longer falls inside its state dropped. */
function fitStates(clip: PlanClip): PlanClip {
  const length = clip.out - clip.in;
  const { stills, still, ...rest } = clip;
  const kept = stills?.filter((s) => s.from < length - MIN_SNIP);
  const spanOf = (i: number): number => (kept![i + 1]?.from ?? length) - kept![i]!.from;
  const states = kept?.map(({ still: at, ...state }, i) => (at !== undefined && at < spanOf(i) ? { ...state, still: at } : state));
  const firstSpan = states ? spanOf(0) : length;
  return { ...rest, ...(states ? { stills: states } : {}), ...(still !== undefined && still < firstSpan ? { still } : {}) };
}

function applyClipTrim(sources: Sources, op: ClipTrimOperation): Sources {
  const index = clipIndex(sources.plan, op.clip);
  const clip = sources.plan.clips![index]!;
  if (op.placement !== undefined && op.placement !== clip.placement) throw new KinottaError('invalid', 'That graphic attachment changed. Choose it again.');
  const from = round(op.in);
  const to = round(op.out);
  if (!Number.isFinite(op.in) || !Number.isFinite(op.out) || from < 0 || to - from < MIN_CLIP) {
    throw new KinottaError('invalid', `A clip needs to be at least ${MIN_CLIP} s long, starting at 0 s or later.`);
  }
  const placement = clip.placement && sources.plan.media?.placements.find((p) => p.id === clip.placement || p.origin === clip.placement);
  const duration = placement && placement.role !== 'gap' ? sources.plan.media!.sources.find((s) => s.id === placement.source)?.duration : sources.plan.duration;
  if (typeof duration === 'number' && to > duration + MIN_SNIP) throw new KinottaError('invalid', 'A clip cannot run past the end of the footage.');
  if (Math.abs(from - clip.in) <= MIN_SNIP && Math.abs(to - clip.out) <= MIN_SNIP) throw new KinottaError('invalid', `Clip ${op.clip} already runs there.`);
  return { ...sources, plan: withClip(sources.plan, index, fitStates({ ...clip, in: from, out: to })) };
}

function applyClipAttachment(sources: Sources, op: ClipAttachmentOperation): Sources {
  const index = clipIndex(sources.plan, op.clip);
  const media = sources.plan.media;
  const placement = media?.placements.find((p) => p.id === op.placement);
  if (!media || !placement || placement.role === 'gap' || op.out - op.in < MIN_CLIP) throw new KinottaError('invalid', 'Choose a surviving footage range to repair this attachment.');
  const spans = mediaSpans(media, op.placement, op.in, op.out, sources.plan.duration, op.cycle);
  if (spans.length !== 1 || Math.abs(spans[0]!.sourceStart - op.in) > MIN_SNIP || Math.abs(spans[0]!.sourceEnd - op.out) > MIN_SNIP) throw new KinottaError('invalid', 'That attachment is missing or interrupted. Choose a continuous surviving range.');
  const { cycle: _previous, ...clip } = sources.plan.clips![index]!;
  return { ...sources, plan: withClip(sources.plan, index, fitStates({ ...clip, placement: op.placement, ...(op.cycle !== undefined ? { cycle: op.cycle } : {}), in: round(op.in), out: round(op.out) })) };
}

function applyClipSplit(sources: Sources, op: ClipSplitOperation): Sources {
  const index = clipIndex(sources.plan, op.clip);
  const clip = sources.plan.clips![index]!;
  if (!sources.plan.media || !clip.placement) throw new KinottaError('invalid', 'Choose an attached graphic to split.');
  const spans = mediaSpans(sources.plan.media, clip.placement, clip.in, clip.out, sources.plan.duration, clip.cycle);
  if (spans.length < 2 || spans.some((part) => part.sourceEnd - part.sourceStart < MIN_CLIP)) throw new KinottaError('invalid', 'Splitting needs at least two surviving parts, each long enough to show.');
  const parts = spans.map((part, i) => fitStates({ ...clip, id: i === 0 ? clip.id : `${clip.id}~${op.id}~${i + 1}`, splitFrom: clip.splitFrom ?? clip.id, in: part.sourceStart, out: part.sourceEnd }));
  return { ...sources, plan: { ...sources.plan, clips: sources.plan.clips!.flatMap((c, i) => i === index ? parts : [c]) } };
}

function applyClipSlide(sources: Sources, op: ClipSlideOperation): Sources {
  const index = clipIndex(sources.plan, op.clip);
  const clip = sources.plan.clips![index]!;
  if (op.placement !== undefined && op.placement !== clip.placement) throw new KinottaError('invalid', 'That graphic attachment changed. Choose it again.');
  if (!Number.isFinite(op.delta) || Math.abs(op.delta) <= MIN_SNIP) throw new KinottaError('invalid', 'A slide needs a distance, in seconds.');
  const from = round(clip.in + op.delta);
  const to = round(clip.out + op.delta);
  if (from < 0) throw new KinottaError('invalid', 'A clip cannot slide before the start of the footage.');
  const placement = clip.placement && sources.plan.media?.placements.find((p) => p.id === clip.placement || p.origin === clip.placement);
  const duration = placement && placement.role !== 'gap' ? sources.plan.media!.sources.find((s) => s.id === placement.source)?.duration : sources.plan.duration;
  if (typeof duration === 'number' && to > duration + MIN_SNIP) throw new KinottaError('invalid', 'A clip cannot slide past the end of the footage.');
  return { ...sources, plan: withClip(sources.plan, index, { ...clip, in: from, out: to, slid: true }) };
}

function applyElementOffset(sources: Sources, op: ElementOffsetOperation): Sources {
  const index = clipIndex(sources.plan, op.clip);
  const clip = sources.plan.clips![index]!;
  // The name goes into a CSS attribute selector in the built page.
  if (typeof op.element !== 'string' || op.element === '' || /["\\<>\s]/.test(op.element)) throw new KinottaError('invalid', 'The element needs a name without spaces or quotes.');
  if (!Number.isFinite(op.x) || !Number.isFinite(op.y) || !Number.isFinite(op.scale)) throw new KinottaError('invalid', 'An offset needs x, y and scale as numbers.');
  if (op.scale < MIN_SCALE || op.scale > MAX_SCALE) throw new KinottaError('invalid', `The scale needs to be between ${MIN_SCALE} and ${MAX_SCALE}.`);
  const offset: ElementOffset = { x: round(op.x), y: round(op.y), scale: round(op.scale) };
  const { offsets: was, ...rest } = clip;
  const { [op.element]: _replaced, ...others } = was ?? {};
  const home = offset.x === 0 && offset.y === 0 && offset.scale === 1;
  const offsets = home ? others : { ...others, [op.element]: offset };
  return { ...sources, plan: withClip(sources.plan, index, Object.keys(offsets).length > 0 ? { ...rest, offsets } : rest) };
}

function changePlacementWords(sources: Sources, id: string | undefined, from: number, to: number, edit: (words: TranscriptWord[]) => TranscriptWord[]): Sources {
  if (!id) throw new KinottaError('invalid', 'A speech edit needs its placement identity.');
  const media = sources.plan.media!;
  const placement = media.placements.find((p) => p.id === id);
  if (!placement || placement.role === 'gap' || (placement.role === 'main' ? !media.sequence.includes(id) : !placement.speech)) throw new KinottaError('invalid', `Speech placement ${id} is missing.`);
  if (from < placement.in || from >= placement.out || to > placement.out) throw new KinottaError('invalid', 'That word was removed from its placement.');
  const source = media.sources.find((s) => s.id === placement.source)!;
  const words = edit(placement.words ?? source.words ?? []);
  return withMedia(sources, { ...media, placements: media.placements.map((p) => p.id === id ? { ...placement, words } : p) });
}

export function editableMedia(sources: Sources): MediaPlan {
  if (sources.plan.media) return mediaWithTracks(sources.plan.media);
  const legacy = legacyMedia(sources.plan);
  if (legacy) return mediaWithTracks({ ...legacy, sources: legacy.sources.map((s) => ({ ...s, words: sources.words, ...(sources.videoAudio !== undefined ? { audio: sources.videoAudio } : {}) })) });
  return { schema: 1, tracks: [], sources: [], placements: [], sequence: [] };
}

/** A read-only native view of a legacy source plan. Its authored ranges keep source anchors during conversion. */
export function mediaEditingPlan(sources: Sources): Plan {
  const media = editableMedia(sources);
  if (!media.legacy || sources.plan.media) return { ...sources.plan, media };
  const root = media.sources[0]!.id;
  const captions = sources.plan.captions;
  return {
    ...sources.plan, media, duration: mediaTimeline(media, sources.plan.duration).duration,
    clips: sources.plan.clips?.map((c) => ({ ...c, placement: c.placement ?? root })),
    sections: sources.plan.sections?.map((s) => ({ ...s, placement: s.placement ?? root })),
    ...(captions && typeof captions === 'object' && captions.phrases ? { captions: { ...captions, phrases: captions.phrases.map((phrase) => ({ ...phrase, placement: phrase.placement ?? media.placements.find((p) => p.role !== 'gap' && p.in <= phrase.at && p.out > phrase.at)?.id })) } } : {}),
  };
}

function withMedia(sources: Sources, media: MediaPlan): Sources {
  media = mediaWithTracks(media);
  const timeline = mediaTimeline(media, sources.plan.duration ?? 0);
  // Remember a followed item's last valid position for explicit repair if its moment is later removed.
  const placed = { ...media, placements: media.placements.map((p) => {
    if (p.role === 'gap' || !p.attachment) return p;
    const current = timeline.placements.find((candidate) => candidate.id === p.id)!;
    return current.attachmentBroken ? p : { ...p, at: current.at };
  }) };
  return { ...sources, plan: { ...sources.plan, media: placed, duration: timeline.duration }, words: mediaWords(placed, timeline.duration) };
}

/** Refuses an added or replacing placement sent without its details, before anything reads them. */
function requirePlacementDetails(placement: unknown): void {
  if (placement === null || typeof placement !== 'object' || Array.isArray(placement)) throw new KinottaError('invalid', 'A new placement needs its details: an identity, a role and its media.');
}

function applyPlacementAdd(sources: Sources, op: PlacementAddOperation): Sources {
  requirePlacementDetails(op.placement);
  const media = editableMedia(sources);
  if (media.placements.some((p) => p.id === op.placement.id)) throw new KinottaError('invalid', `Placement ${op.placement.id} already exists. Duplicate with a new identity.`);
  const nextSources = [...media.sources];
  if (op.source) {
    const existing = nextSources.find((s) => s.id === op.source!.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(op.source)) throw new KinottaError('invalid', 'Replacement media needs a new source identity.');
    if (!existing) nextSources.push(op.source);
  }
  const sequence = [...media.sequence];
  if (op.placement.role === 'main' || op.placement.role === 'gap') {
    const index = op.index ?? sequence.length;
    if (!Number.isInteger(index) || index < 0 || index > sequence.length) throw new KinottaError('invalid', 'Choose an existing position in the main sequence.');
    sequence.splice(index, 0, op.placement.id);
  }
  let placement = op.placement;
  const tracks = [...media.tracks!];
  const sourceId = placement.role !== 'gap' ? placement.source : undefined;
  const source = nextSources.find((s) => s.id === sourceId);
  if (placement.role !== 'gap' && placement.role !== 'insert' && !placement.track && source && source.kind !== 'image' && source.audio !== false) {
    const id = placement.role === 'main' ? 'track:speech' : `track:${placement.id}`;
    if (!tracks.some((t) => t.id === id)) tracks.push({ id, name: placement.role === 'main' ? 'Speech' : source.name ?? source.id, order: Math.max(-1, ...tracks.map((t) => t.order)) + 1, gain: 1, mute: false });
    placement = { ...placement, track: id };
  }
  return withMedia(sources, { ...media, tracks, sources: nextSources, placements: [...media.placements, placement], sequence });
}

function applyPlacementChange(sources: Sources, op: PlacementChangeOperation): Sources {
  const media = editableMedia(sources);
  if (!media.placements.some((p) => p.id === op.placement)) throw new KinottaError('invalid', `Placement ${op.placement} is missing.`);
  const allowed = new Set(['track', 'in', 'out', 'at', 'duration', 'loop', 'speech', 'gain', 'mute', 'fadeIn', 'fadeOut', 'volume', 'framing', 'attachment']);
  if (!op.changes || Object.keys(op.changes).some((key) => !allowed.has(key))) throw new KinottaError('invalid', 'A placement change cannot replace its identity or source.');
  const current = mediaTimeline(media, sources.plan.duration ?? 0).placements.find((p) => p.id === op.placement)!;
  const changes = current.role !== 'gap' && current.attachment && op.changes.at !== undefined && !Object.hasOwn(op.changes, 'attachment')
    ? { ...op.changes, attachment: { ...current.attachment, offset: (current.attachment.offset ?? 0) + op.changes.at - current.at } } : op.changes;
  return withMedia(sources, { ...media, placements: media.placements.map((p) => {
    if (p.id !== op.placement) return p;
    const next = { ...p, ...changes };
    if (next.role === 'main' && p.role !== 'gap' && p.duration !== undefined && media.sources.find((s) => s.id === next.source)?.kind === 'video' && changes.duration === undefined && (changes.in !== undefined || changes.out !== undefined)) next.duration = next.out - next.in;
    return next;
  }) });
}

function applyPlacementRemove(sources: Sources, op: PlacementRemoveOperation): Sources {
  const media = editableMedia(sources);
  if (!media.placements.some((p) => p.id === op.placement)) throw new KinottaError('invalid', `Placement ${op.placement} is missing.`);
  const sequence = media.sequence.filter((id) => id !== op.placement);
  const base = media.sequence.length > 0 && sequence.length === 0 ? { ...sources, plan: { ...sources.plan, duration: 0 } } : sources;
  return withMedia(base, { ...media, placements: media.placements.filter((p) => p.id !== op.placement), sequence });
}

function applyPlacementLayer(sources: Sources, op: PlacementLayerOperation): Sources {
  const media = editableMedia(sources);
  const p = media.placements.find((placement) => placement.id === op.placement);
  if (!p || p.role !== 'insert' || media.sources.find((source) => source.id === p.source)?.kind === 'audio') throw new KinottaError('invalid', 'Choose an insert picture to change its front/back order.');
  if (op.direction !== 'front' && op.direction !== 'back') throw new KinottaError('invalid', 'Picture order must be front or back.');
  const others = media.placements.filter((placement) => placement.id !== p.id);
  return withMedia(sources, { ...media, placements: op.direction === 'front' ? [...others, p] : [p, ...others] });
}

function applyPlacementMove(sources: Sources, op: PlacementMoveOperation): Sources {
  const media = editableMedia(sources);
  if (!media.sequence.includes(op.placement)) throw new KinottaError('invalid', `Main placement ${op.placement} is missing.`);
  if (!Number.isInteger(op.index) || op.index < 0 || op.index >= media.sequence.length) throw new KinottaError('invalid', 'Choose an existing position in the main sequence.');
  const sequence = media.sequence.filter((id) => id !== op.placement);
  sequence.splice(op.index, 0, op.placement);
  return withMedia(sources, { ...media, sequence });
}

function applyPlacementReplace(sources: Sources, op: PlacementReplaceOperation): Sources {
  requirePlacementDetails(op.placement);
  const media = editableMedia(sources);
  if (!media.placements.some((p) => p.id === op.target)) throw new KinottaError('invalid', `Placement ${op.target} is missing.`);
  if (media.placements.some((p) => p.id === op.placement.id)) throw new KinottaError('invalid', 'Replacement needs a new identity.');
  const index = media.sequence.indexOf(op.target);
  if ((index >= 0) !== (op.placement.role === 'main' || op.placement.role === 'gap')) throw new KinottaError('invalid', 'Replacement must keep the same sequence or added-media role.');
  const removed = applyPlacementRemove(sources, { id: op.id, kind: 'placement-remove', placement: op.target });
  return applyPlacementAdd(removed, { id: op.id, kind: 'placement-add', placement: op.placement, source: op.source, ...(index >= 0 ? { index } : {}) });
}

/** The manual level at a placement-local moment, before fades: the initial gain ramped through each volume point. */
function levelAt(p: SourcePlacement, time: number): number {
  let previous = { at: 0, gain: p.gain ?? 1 };
  for (const point of p.volume ?? []) {
    if (time < point.at) return previous.gain + (point.gain - previous.gain) * (time - previous.at) / (point.at - previous.at);
    previous = point;
  }
  return previous.gain;
}

function applyPlacementSplit(sources: Sources, op: PlacementSplitOperation): Sources {
  const media = editableMedia(sources);
  const p = media.placements.find((placement) => placement.id === op.placement);
  if (!p) throw new KinottaError('invalid', `Placement ${op.placement} is missing.`);
  const image = p.role !== 'gap' && media.sources.find((s) => s.id === p.source)?.kind === 'image';
  const length = p.role === 'gap' || image ? p.duration! : p.role === 'main' ? p.out - p.in : p.duration ?? p.out - p.in;
  if (p.role !== 'gap' && p.loop) throw new KinottaError('invalid', 'A looping sound cannot be split. Turn Loop off first, or trim it.');
  if (!Number.isFinite(op.at) || op.at <= SPLIT_EDGE || op.at >= length - SPLIT_EDGE) throw new KinottaError('invalid', 'Split at a moment inside the placement.');
  const id = `${p.id}~${op.id}`;
  const origin = p.origin ?? p.id;
  let first: MediaPlacement;
  let second: MediaPlacement;
  if (p.role === 'gap') {
    first = { ...p, duration: op.at };
    second = { ...p, id, origin, duration: length - op.at };
  } else {
    // One envelope across the cut: the first half ends on the level reached, the second starts from it.
    const level = levelAt(p, op.at);
    const later = (p.volume ?? []).filter((point) => point.at > op.at);
    const earlier = (p.volume ?? []).filter((point) => point.at < op.at);
    const firstVolume = later.length > 0 ? [...earlier, { at: op.at, gain: level }] : earlier;
    const range = image ? {} : { out: p.in + op.at };
    first = { ...p, ...range, ...(p.duration !== undefined ? { duration: op.at } : {}), ...(p.fadeOut !== undefined ? { fadeOut: 0 } : {}), volume: firstVolume };
    second = {
      ...p, id, origin, gain: level, volume: later.map((point) => ({ ...point, at: point.at - op.at })),
      ...(image ? {} : { in: p.in + op.at }),
      ...(p.duration !== undefined ? { duration: length - op.at } : {}),
      ...(p.role !== 'main' ? { at: p.at! + op.at } : {}),
      ...(p.attachment ? { attachment: { ...p.attachment, offset: (p.attachment.offset ?? 0) + op.at } } : {}),
      ...(p.fadeIn !== undefined ? { fadeIn: 0 } : {}),
    };
    if (first.volume!.length === 0) delete first.volume;
    if (second.volume!.length === 0) delete second.volume;
  }
  const placements = media.placements.flatMap((placement) => {
    if (placement.id === p.id) return [first, second];
    // An attachment created on an already split half follows the newly named half that retains its moment.
    if (p.role === 'main' && second.role === 'main' && placement.role !== 'gap' && placement.attachment?.placement === p.id && placement.attachment.time >= second.in) return [{ ...placement, attachment: { ...placement.attachment, placement: second.id } }];
    return [placement];
  });
  const index = media.sequence.indexOf(p.id);
  const sequence = index < 0 ? media.sequence : [...media.sequence.slice(0, index + 1), id, ...media.sequence.slice(index + 1)];
  const captions = sources.plan.captions;
  const plan = {
    ...sources.plan,
    clips: sources.plan.clips?.map((c) => c.placement === p.id ? { ...c, placement: origin } : c),
    sections: sources.plan.sections?.map((s) => s.placement === p.id ? { ...s, placement: origin } : s),
    ...(captions && typeof captions === 'object' && captions.phrases ? { captions: { ...captions, phrases: captions.phrases.map((phrase) => phrase.placement === p.id && second.role !== 'gap' && phrase.at >= second.in ? { ...phrase, placement: second.id } : phrase) } } : {}),
  };
  return withMedia({ ...sources, plan }, { ...media, placements, sequence });
}

function applyPlacementSnip(sources: Sources, op: PlacementSnipOperation): Sources {
  const media = editableMedia(sources);
  const timeline = mediaTimeline(media, sources.plan.duration ?? 0);
  if (!Number.isFinite(op.from) || !Number.isFinite(op.to) || op.from < 0 || op.to > timeline.duration || op.to - op.from <= MIN_SNIP) throw new KinottaError('invalid', 'Choose a stretch inside the footage timeline to snip.');
  const affected = timeline.placements.filter((p) => media.sequence.includes(p.id) && p.at < op.to && p.at + p.duration > op.from);
  if (!affected.length) throw new KinottaError('invalid', 'There is no main footage in that stretch.');
  let result = sources;
  for (const p of affected.reverse()) {
    const start = Math.max(0, op.from - p.at);
    const end = Math.min(p.duration, op.to - p.at);
    if (end < p.duration) result = applyPlacementSplit(result, { id: `${op.id}:end:${p.id}`, kind: 'placement-split', placement: p.id, at: end });
    let removed = p.id;
    if (start > 0) {
      const id = `${op.id}:start:${p.id}`;
      result = applyPlacementSplit(result, { id, kind: 'placement-split', placement: p.id, at: start });
      removed = `${p.id}~${id}`;
    }
    result = applyPlacementRemove(result, { id: op.id, kind: 'placement-remove', placement: removed });
  }
  return result;
}

function applyTrack(sources: Sources, op: TrackAddOperation | TrackChangeOperation | TrackMoveOperation | TrackRemoveOperation): Sources {
  const media = editableMedia(sources);
  let tracks = [...media.tracks!].sort((a, b) => a.order - b.order);
  if (op.kind === 'track-add') {
    if (!isRecord(op.track)) throw new KinottaError('invalid', 'A new track needs its details.');
    tracks.push(op.track);
  } else {
    const index = tracks.findIndex((t) => t.id === op.track);
    if (index < 0) throw new KinottaError('invalid', `Track ${op.track} is missing.`);
    if (op.kind === 'track-change') {
      if (!isRecord(op.changes) || Object.keys(op.changes).some((key) => !['name', 'gain', 'mute'].includes(key))) throw new KinottaError('invalid', 'A track change can set only its name, gain or mute.');
      tracks[index] = { ...tracks[index]!, ...op.changes };
    } else if (op.kind === 'track-move') {
      if (!Number.isInteger(op.index) || op.index < 0 || op.index >= tracks.length) throw new KinottaError('invalid', 'Choose an existing track position.');
      tracks.splice(op.index, 0, tracks.splice(index, 1)[0]!);
      tracks = tracks.map((t, order) => ({ ...t, order }));
    } else {
      if (media.placements.some((p) => p.role !== 'gap' && p.track === op.track)) throw new KinottaError('invalid', 'Move or remove its clips first. Only an empty track can be removed.');
      tracks.splice(index, 1);
      tracks = tracks.map((t, order) => ({ ...t, order }));
    }
  }
  return withMedia(sources, { ...media, tracks });
}

function applyPlacementDetach(sources: Sources, op: PlacementDetachOperation): Sources {
  const media = editableMedia(sources);
  const p = mediaTimeline(media, sources.plan.duration ?? 0).placements.find((p) => p.id === op.placement);
  const source = p && p.role !== 'gap' ? media.sources.find((s) => s.id === p.source) : null;
  if (!p || p.role !== 'insert' || p.attachmentBroken || p.duration <= 0 || !source || source.kind !== 'video' || source.audio === false) throw new KinottaError('invalid', 'Detach sound from an available video insert.');
  const id = `${p.id}~${op.id}`;
  if (media.placements.some((candidate) => candidate.id === id)) throw new KinottaError('invalid', 'Detached sound needs a new identity.');
  const { framing: _framing, attachmentBroken: _broken, origin: _origin, ...sound } = p;
  const audio: SourcePlacement = { ...sound, id, role: 'audio', track: op.track, attachment: null, mute: p.mute ?? true };
  return withMedia(sources, { ...media, placements: [...media.placements.map((candidate) => candidate.id === p.id ? { ...candidate, mute: true, speech: false } : candidate), audio] });
}

/** The sources with one operation written into them. Throws `invalid` for an operation that cannot apply. */
export function applyOperation(sources: Sources, op: Operation): Sources {
  if (sources.plan.media && (op.kind === 'snip' || op.kind === 'cut' || op.kind === 'move-piece')) throw new KinottaError('invalid', 'This reel uses native placements. Trim, split or move its named placement instead.');
  if (!sources.plan.media && (op.kind.startsWith('track-') || op.kind.startsWith('placement-') || op.kind === 'clip-attachment' || op.kind === 'clip-split' || ('placement' in op && typeof op.placement === 'string'))) sources = { ...sources, plan: mediaEditingPlan(sources) };
  switch (op.kind) {
    case 'track-add':
    case 'track-change':
    case 'track-move':
    case 'track-remove':
      return applyTrack(sources, op);
    case 'placement-detach':
      return applyPlacementDetach(sources, op);
    case 'placement-add':
      return applyPlacementAdd(sources, op);
    case 'placement-change':
      return applyPlacementChange(sources, op);
    case 'placement-remove':
      return applyPlacementRemove(sources, op);
    case 'placement-move':
      return applyPlacementMove(sources, op);
    case 'placement-layer':
      return applyPlacementLayer(sources, op);
    case 'placement-replace':
      return applyPlacementReplace(sources, op);
    case 'placement-split':
      return applyPlacementSplit(sources, op);
    case 'placement-snip':
      return applyPlacementSnip(sources, op);
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
    case 'phrase-text':
      return applyPhraseText(sources, op);
    case 'caption-position':
      return applyCaptionPosition(sources, op);
    case 'caption-phrase-position':
      return applyCaptionPhrasePosition(sources, op);
    case 'clip-trim':
      return applyClipTrim(sources, op);
    case 'clip-attachment':
      return applyClipAttachment(sources, op);
    case 'clip-split':
      return applyClipSplit(sources, op);
    case 'clip-slide':
      return applyClipSlide(sources, op);
    case 'element-offset':
      return applyElementOffset(sources, op);
  }
}

/** The sources with every operation applied in order. */
export function applyOperations(sources: Sources, ops: readonly Operation[]): Sources {
  return ops.reduce(applyOperation, sources);
}

/** Whether an operation changes what a section (a span of source seconds) shows, beyond moving it on the timeline. */
export function operationTouches(op: Operation, section: { start: number; end: number }): boolean {
  switch (op.kind) {
    case 'track-add':
    case 'track-change':
    case 'track-move':
    case 'track-remove':
    case 'placement-detach':
      return true;
    case 'placement-add':
    case 'placement-change':
    case 'placement-remove':
    case 'placement-move':
    case 'placement-layer':
    case 'placement-replace':
    case 'placement-split':
    case 'placement-snip':
      return true;
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
    case 'phrase-text':
      return op.from < section.end && op.to > section.start;
    // Every caption moves, so every section's captions change.
    case 'caption-position':
      return true;
    case 'caption-phrase-position':
      return op.at >= section.start && op.at < section.end;
    // A clip belongs to a section by its own `section`, which an operation does not carry: Save compares the plan's clips.
    case 'clip-trim':
    case 'clip-attachment':
    case 'clip-split':
    case 'clip-slide':
    case 'element-offset':
      return false;
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
    case 'track-add':
      return { target: op.track.name, text: 'Added audio track' };
    case 'track-change':
      return { target: `Track ${op.track}`, text: 'Changed track name, volume or mute' };
    case 'track-move':
      return { target: `Track ${op.track}`, text: 'Reordered audio track' };
    case 'track-remove':
      return { target: `Track ${op.track}`, text: 'Removed empty audio track' };
    case 'placement-detach':
      return { target: `Placement ${op.placement}`, text: 'Detached insert sound' };
    case 'placement-add':
      return { target: `Placement ${op.placement.id}`, text: 'Added media' };
    case 'placement-change':
      return { target: `Placement ${op.placement}`, text: op.changes.framing ? 'Changed picture framing' : Object.hasOwn(op.changes, 'attachment') ? op.changes.attachment ? 'Attached to footage' : 'Changed to Stay at time' : 'Changed timing or speech selection' };
    case 'placement-remove':
      return { target: `Placement ${op.placement}`, text: 'Removed media' };
    case 'placement-move':
      return { target: `Placement ${op.placement}`, text: 'Reordered media' };
    case 'placement-layer':
      return { target: `Placement ${op.placement}`, text: op.direction === 'front' ? 'Brought picture to front' : 'Sent picture to back' };
    case 'placement-replace':
      return { target: `Placement ${op.target}`, text: 'Replaced media' };
    case 'placement-split':
      return { target: `Placement ${op.placement}`, text: `Split ${op.at.toFixed(2)}s in` };
    case 'placement-snip':
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
    case 'phrase-text': {
      const text = op.text.trim().replace(/\s+/g, ' ');
      if (text === '') return { target: 'Caption', text: op.was ? `Removed “${op.was}”` : 'Removed the caption' };
      return { target: 'Caption', text: op.was ? `Changed “${op.was}” to “${text}”` : `Changed the caption to “${text}”` };
    }
    case 'caption-position':
      return { target: 'Captions', text: `Moved all captions to ${op.x}, ${op.y}` };
    case 'caption-phrase-position':
      return { target: 'Captions', text: `Moved one caption to ${op.x}, ${op.y}` };
    case 'clip-trim':
      return { target: `Clip ${op.clip}`, text: `Trimmed to ${clock(op.in)} to ${clock(op.out)}` };
    case 'clip-attachment':
      return { target: `Clip ${op.clip}`, text: `Attached to placement ${op.placement}, ${clock(op.in)} to ${clock(op.out)}` };
    case 'clip-split':
      return { target: `Clip ${op.clip}`, text: 'Split into surviving parts' };
    case 'clip-slide':
      return { target: `Clip ${op.clip}`, text: `Slid ${op.delta > 0 ? '+' : '−'}${Math.abs(op.delta).toFixed(1)}s` };
    case 'element-offset':
      return { target: `Clip ${op.clip}`, text: `Moved ${op.element === CLIP_ROOT ? 'the whole clip' : op.element} by ${op.x}, ${op.y} at ${Math.round(op.scale * PERCENT)}%` };
  }
}

/** The pieces on the timeline after the operations, with where each starts. */
export function editedPieces(plan: Plan, ops: readonly Operation[]) {
  return pieceMap(applyOperations({ plan, words: [] }, ops).plan.pieces, plan.duration ?? 0);
}
