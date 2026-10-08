import { KinottaError } from './errors.ts';
import { pieceMap } from './pieces.ts';
import type { Piece } from './pieces.ts';
import type { TranscriptWord } from './types.ts';

/** Source and reel joins agree to one microsecond, matching persisted word timing. */
const RANGE_JOIN_TOLERANCE = 1e-6;

/** Underlying project media. Identity belongs to content, not its file name. */
export interface MediaSource {
  id: string;
  name?: string;
  kind: 'video' | 'image' | 'audio';
  path: string;
  duration: number;
  /** Cached source speech, in source seconds. Placement corrections never change it. */
  words?: TranscriptWord[];
  /** SHA-256 of the exact original bytes, populated at import or preservation. */
  contentHash?: string;
  audio?: boolean;
}

/** One independent use of a source. Main placements play in sequence order. */
export interface SourcePlacement {
  id: string;
  /** Footage sound stays locked to this placement's picture. Inserts retain sound internally. */
  track?: string;
  role: 'main' | 'insert' | 'audio';
  source: string;
  in: number;
  out: number;
  /** Added media stays on reel time unless it explicitly follows footage. */
  at?: number;
  duration?: number;
  loop?: boolean;
  speech?: boolean;
  gain?: number;
  /** Manual levels in placement-local seconds, interpolated from the initial gain at zero. */
  volume?: Array<{ at: number; gain: number }>;
  mute?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  /** Independent caption corrections, still in source seconds. */
  words?: TranscriptWord[];
  /** The placement this one was split from, so feedback on that moment can find it. */
  origin?: string;
  /** Fill by cropping by default. Position is the fraction of spare crop/padding space, from left/top to right/bottom. */
  framing?: { mode: 'crop' | 'fit'; x?: number; y?: number };
  /** Follow this main footage occurrence's source moment. Null or absent stays on reel time. */
  attachment?: { placement: string; time: number; offset?: number } | null;
}

export interface GapPlacement {
  id: string;
  role: 'gap';
  duration: number;
  origin?: string;
}

export type MediaPlacement = SourcePlacement | GapPlacement;

export interface MediaTrack {
  id: string;
  name: string;
  order: number;
  gain: number;
  mute: boolean;
}

export interface MediaPlan {
  schema: 1;
  tracks?: MediaTrack[];
  sources: MediaSource[];
  placements: MediaPlacement[];
  sequence: string[];
  /** A legacy adapter cannot promise content preservation retroactively. */
  legacy?: true;
}

/** Read-only migration. Defaults are persisted on the next edit/Save, never while loading a frozen version. */
export function mediaWithTracks(media: MediaPlan): MediaPlan {
  mediaTimeline(media);
  if (media.tracks !== undefined) return media;
  const tracks: MediaTrack[] = [];
  const track = (id: string, name: string): string => {
    if (!tracks.some((t) => t.id === id)) tracks.push({ id, name, order: tracks.length, gain: 1, mute: false });
    return id;
  };
  const placements = media.placements.map((p) => {
    if (p.role === 'gap' || p.role === 'insert') return p;
    const source = media.sources.find((s) => s.id === p.source)!;
    if (source.kind === 'image' || source.audio === false) return p;
    return { ...p, track: p.role === 'main' ? track('track:speech', 'Speech') : track(`track:${p.id}`, source.name ?? source.id) };
  });
  return { ...media, tracks, placements };
}

/** Track gain applies after the entire clip envelope. Insert sound has no track controls. */
export function trackGain(media: MediaPlan, placement: SourcePlacement): number {
  const track = media.tracks?.find((t) => t.id === placement.track);
  return track?.mute ? 0 : track?.gain ?? 1;
}

/** Read-only migration of old source ranges. Range-derived IDs survive reordering of legacy pieces. */
export function legacyMedia(plan: { video?: unknown; duration?: number; pieces?: Piece[] }): MediaPlan | null {
  if (typeof plan.video !== 'string' || !plan.video) return null;
  const mapped = pieceMap(plan.pieces, plan.duration ?? 0);
  const source = `legacy:${plan.video}`;
  const placements: SourcePlacement[] = mapped.pieces.map((p) => ({ id: `${source}:${p.in}:${p.out}`, origin: source, role: 'main', source, in: p.in, out: p.out }));
  return {
    schema: 1, legacy: true,
    sources: [{ id: source, kind: 'video', path: plan.video, duration: Math.max(plan.duration ?? 0, ...mapped.pieces.map((p) => p.out)) }],
    placements, sequence: placements.map((p) => p.id),
  };
}

export interface MediaTimeline {
  placements: Array<MediaPlacement & { at: number; duration: number; attachmentBroken?: boolean }>;
  duration: number;
}

export interface MediaMoment {
  placement: string;
  source: string;
  /** Seconds into the source. */
  time: number;
}

const modelObject = (value: unknown): boolean => !!value && typeof value === 'object' && !Array.isArray(value);
const modelName = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;

function validateWords(words: unknown): void {
  if (words === undefined) return;
  if (!Array.isArray(words) || words.some((word) => !modelObject(word) || !modelName(word.text) || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < 0 || word.end < word.start)) throw new KinottaError('invalid', 'Speech words need text and valid source start/end times.');
}

/** Lay the main sequence end to end without collapsing repeated source ranges. */
export function mediaTimeline(media: MediaPlan, authoredDuration = 0): MediaTimeline {
  if (!modelObject(media) || media.schema !== 1) throw new KinottaError('invalid', 'Unsupported media schema.');
  if (![media.sources, media.placements, media.sequence].every(Array.isArray)) throw new KinottaError('invalid', 'Media sources, placements and sequence must be lists.');
  if (media.tracks !== undefined && !Array.isArray(media.tracks)) throw new KinottaError('invalid', 'Media tracks must be a list.');
  const tracks = new Set<string>();
  const orders = new Set<number>();
  for (const track of media.tracks ?? []) {
    if (!modelObject(track) || !modelName(track.id) || !modelName(track.name) || !Number.isInteger(track.order) || track.order < 0 || !Number.isFinite(track.gain) || track.gain < 0 || track.gain > 2 || typeof track.mute !== 'boolean') throw new KinottaError('invalid', 'A track needs an identity, name, nonnegative whole order, gain between zero and two, and boolean mute.');
    if (tracks.has(track.id) || orders.has(track.order)) throw new KinottaError('invalid', 'Each track needs a unique identity and order.');
    tracks.add(track.id); orders.add(track.order);
  }
  const sources = new Map<string, MediaSource>();
  for (const source of media.sources) {
    if (!modelObject(source)) throw new KinottaError('invalid', 'A source needs an identity, path and valid duration.');
    if (sources.has(source.id)) throw new KinottaError('invalid', `Duplicate source ${source.id}.`);
    if (!modelName(source.id) || !modelName(source.path) || !Number.isFinite(source.duration) || source.duration < 0) throw new KinottaError('invalid', 'A source needs an identity, path and valid duration.');
    if (!['video', 'image', 'audio'].includes(source.kind)) throw new KinottaError('invalid', 'A source kind must be video, image or audio.');
    if (source.audio !== undefined && typeof source.audio !== 'boolean') throw new KinottaError('invalid', 'Source audio must be a boolean.');
    validateWords(source.words);
    sources.set(source.id, source);
  }
  const byId = new Map<string, MediaPlacement>();
  for (const placement of media.placements) {
    if (!modelObject(placement)) throw new KinottaError('invalid', 'A placement needs an identity.');
    if (byId.has(placement.id)) throw new KinottaError('invalid', `Duplicate placement ${placement.id}.`);
    if (!modelName(placement.id)) throw new KinottaError('invalid', 'A placement needs an identity.');
    if (!['main', 'insert', 'audio', 'gap'].includes(placement.role)) throw new KinottaError('invalid', 'A placement role must be main, insert, audio or gap.');
    const track = (placement as SourcePlacement).track;
    if (track !== undefined && (!modelName(track) || !tracks.has(track) || placement.role === 'insert' || placement.role === 'gap')) throw new KinottaError('invalid', 'A sound placement needs an existing track. Inserts and gaps have no track.');
    if (placement.origin !== undefined && !modelName(placement.origin)) throw new KinottaError('invalid', 'A placement origin needs an identity.');
    if (placement.role === 'gap') {
      if (!Number.isFinite(placement.duration) || placement.duration <= 0) throw new KinottaError('invalid', 'A gap needs a positive duration.');
    } else {
      if ([placement.mute, placement.speech, placement.loop].some((value) => value !== undefined && typeof value !== 'boolean')) throw new KinottaError('invalid', 'Mute, speech and loop must be boolean flags.');
      if (placement.loop && placement.role !== 'audio') throw new KinottaError('invalid', 'Loop is available only for sound placements.');
      validateWords(placement.words);
      const level = (gain: number) => Number.isFinite(gain) && gain >= 0 && gain <= 2;
      if (placement.gain !== undefined && !level(placement.gain)) throw new KinottaError('invalid', 'Volume must be between silence and twice the recorded level.');
      for (const fade of [placement.fadeIn, placement.fadeOut]) {
        if (fade !== undefined && (!Number.isFinite(fade) || fade < 0)) throw new KinottaError('invalid', 'Fades need a nonnegative duration.');
      }
      let previous = -1;
      if (placement.volume !== undefined && !Array.isArray(placement.volume)) throw new KinottaError('invalid', 'Volume points must be a list.');
      for (const point of placement.volume ?? []) {
        if (!modelObject(point) || !Number.isFinite(point.at) || point.at < 0 || point.at <= previous || !level(point.gain)) throw new KinottaError('invalid', 'Volume points need increasing nonnegative times and levels between zero and two.');
        previous = point.at;
      }
      const source = sources.get(placement.source);
      if (!source) throw new KinottaError('invalid', `Source ${placement.source} is missing.`);
      const soundOnTrack = placement.role !== 'insert' && source.kind !== 'image' && source.audio !== false;
      if (media.tracks !== undefined && soundOnTrack && placement.track === undefined) throw new KinottaError('invalid', 'A sound placement needs an existing track.');
      if (placement.track !== undefined && !soundOnTrack) throw new KinottaError('invalid', 'Only footage or audio with sound can belong to a track.');
      if ((source.kind === 'audio' && placement.role !== 'audio') || (source.kind === 'image' && placement.role === 'audio')) throw new KinottaError('invalid', 'The source kind is incompatible with this placement role.');
      if (placement.framing !== undefined) {
        const framing = placement.framing;
        if (!framing || !['crop', 'fit'].includes(framing.mode) || source.kind === 'audio' || placement.role === 'audio'
          || [framing.x, framing.y].some((value) => value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1))) throw new KinottaError('invalid', 'Picture framing needs Crop or Fit and positions between zero and one.');
      }
      if (source.kind === 'image') {
        if (placement.in !== 0 || placement.out !== 0 || !Number.isFinite(placement.duration) || placement.duration! <= 0) throw new KinottaError('invalid', `Image placement ${placement.id} needs a positive duration and no source range.`);
      } else if (!Number.isFinite(placement.in) || !Number.isFinite(placement.out) || placement.in < 0 || placement.out <= placement.in || placement.out > source.duration) throw new KinottaError('invalid', `Placement ${placement.id} has an invalid source range.`);
      if (placement.role === 'main' && source.kind !== 'image' && placement.duration !== undefined && (!Number.isFinite(placement.duration) || placement.duration <= 0 || Math.abs(placement.duration - (placement.out - placement.in)) > RANGE_JOIN_TOLERANCE)) throw new KinottaError('invalid', 'A main video duration must match its source range. Trim its source start or end.');
      if (placement.role !== 'main') {
        if (!Number.isFinite(placement.at) || placement.at! < 0) throw new KinottaError('invalid', `Placement ${placement.id} needs a nonnegative timeline start.`);
        const duration = placement.duration ?? placement.out - placement.in;
        if (!Number.isFinite(duration) || duration <= 0 || (source.kind !== 'image' && !placement.loop && duration > placement.out - placement.in)) throw new KinottaError('invalid', `Placement ${placement.id} has an invalid duration.`);
      }
      if (placement.attachment != null && (!modelObject(placement.attachment) || placement.role === 'main' || !modelName(placement.attachment.placement) || !Number.isFinite(placement.attachment.time) || placement.attachment.time < 0 || (placement.attachment.offset !== undefined && !Number.isFinite(placement.attachment.offset)))) throw new KinottaError('invalid', 'An attachment needs a footage placement and a valid source moment.');
    }
    byId.set(placement.id, placement);
  }
  if (media.sequence.some((id) => !modelName(id))) throw new KinottaError('invalid', 'The main sequence needs placement identities.');
  if (new Set(media.sequence).size !== media.sequence.length) throw new KinottaError('invalid', 'Each placement can appear only once in the main sequence. Duplicate it with a new identity to reuse it.');
  let at = 0;
  const placements = media.sequence.map((id) => {
    const placement = byId.get(id);
    if (!placement) throw new KinottaError('invalid', `Placement ${id} is missing.`);
    if (placement.role !== 'main' && placement.role !== 'gap') throw new KinottaError('invalid', `Placement ${id} is not a main-sequence item.`);
    const duration = placement.role === 'gap' || sources.get(placement.source)?.kind === 'image' ? placement.duration! : placement.out - placement.in;
    const placed = { ...placement, at, duration };
    at += duration;
    return placed;
  });
  const duration = media.sequence.length ? at : authoredDuration;
  if (!Number.isFinite(duration) || duration < 0) throw new KinottaError('invalid', 'The reel needs a valid authored duration.');
  for (const p of media.placements) {
    if (p.role === 'main' || p.role === 'gap') continue;
    const anchor = p.attachment;
    const target = anchor ? placements.find((candidate) => candidate.role === 'main' && (candidate.id === anchor.placement || candidate.origin === anchor.placement) && sources.get(candidate.source)?.kind === 'video' && candidate.in <= anchor.time && anchor.time < candidate.out) : undefined;
    const start = target && target.role === 'main' ? target.at + anchor!.time - target.in + (anchor!.offset ?? 0) : p.at!;
    const broken = !!anchor && (!target || start < 0);
    const length = Math.max(0, Math.min(p.duration ?? p.out - p.in, duration - start));
    placements.push({ ...p, at: broken ? p.at! : start, duration: length, ...(broken ? { attachmentBroken: true } : {}) });
  }
  return { placements, duration };
}

/** Resolve a specific occurrence rather than the first use of a source second. */
export function placementTime(timeline: MediaTimeline, id: string, sourceTime: number): number | null {
  const placement = timeline.placements.find((p) => p.id === id);
  return placement && placement.role !== 'gap' && sourceTime >= placement.in && sourceTime < placement.out ? placement.at + sourceTime - placement.in : null;
}

/** Every surviving continuous part of one occurrence's source range, in reel order. A cut alone is not a break. */
export function mediaSpans(media: MediaPlan, placement: string, from: number, to: number, authoredDuration = 0, cycle?: number): Array<{ start: number; end: number; sourceStart: number; sourceEnd: number }> {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from) throw new KinottaError('invalid', 'An attached range needs a valid source start and end.');
  if (cycle !== undefined && !(Number.isInteger(cycle) && cycle >= 0)) throw new KinottaError('invalid', 'A loop cycle is a whole number from 0.');
  const named = media.placements.find((p) => p.id === placement);
  const origin = named?.origin ?? placement;
  const spans: Array<{ start: number; end: number; sourceStart: number; sourceEnd: number }> = [];
  for (const p of mediaTimeline(media, authoredDuration).placements) {
    if (p.role === 'gap' || p.attachmentBroken || (p.role !== 'main' && p.speech !== true) || (p.id !== placement && p.id !== origin && p.origin !== origin)) continue;
    // A loop plays its range again and again: only a named cycle says which pass the attachment means (A2).
    // Without one it maps nowhere and stays flagged; a cycle on a placement that does not loop names nothing.
    const pass = p.loop ? cycle : (cycle ?? 0) === 0 ? 0 : undefined;
    if (pass === undefined) continue;
    const offset = pass * (p.out - p.in);
    const sourceStart = Math.max(from, p.in);
    const sourceEnd = Math.min(to, p.out, p.in + p.duration - offset);
    if (sourceEnd <= sourceStart) continue;
    const start = p.at + offset + sourceStart - p.in;
    const end = p.at + offset + sourceEnd - p.in;
    const previous = spans.at(-1);
    if (previous && Math.abs(previous.end - start) < RANGE_JOIN_TOLERANCE && Math.abs(previous.sourceEnd - sourceStart) < RANGE_JOIN_TOLERANCE) { previous.end = end; previous.sourceEnd = sourceEnd; }
    else spans.push({ start, end, sourceStart, sourceEnd });
  }
  return spans;
}

/** The source and occurrence playing at a timeline second. Joins belong to the following placement. */
export function timelineMoment(timeline: MediaTimeline, time: number): MediaMoment | null {
  const placement = timeline.placements.find((p) => p.role === 'main' && time >= p.at && time < p.at + p.duration);
  return placement && placement.role !== 'gap' ? { placement: placement.id, source: placement.source, time: placement.out === placement.in ? 0 : placement.in + time - placement.at } : null;
}

/** A pin follows its occurrence and surviving split halves; repeated sources never become new targets. */
export function remapMediaMoment(before: MediaTimeline, after: MediaTimeline, time: number, anchor?: { placement?: string; sourceTime?: number; offset?: number }): { time: number; removed: boolean } {
  const joinNudge = 5e-7; // Half a microsecond compensates for the engine's rounded joins.
  const original = anchor?.placement ? before.placements.find((p) => p.id === anchor.placement) : before.placements.find((p) => (p.role === 'main' || p.role === 'gap') && p.at <= time + joinNudge && p.at + p.duration > time + joinNudge);
  const rounded = (at: number) => Math.round(at * 1e6) / 1e6;
  if (!original && !anchor?.placement && !before.placements.some((p) => p.role === 'main' || p.role === 'gap')) return { time: Math.min(time, after.duration), removed: time >= after.duration };
  const id = anchor?.placement ?? original?.id;
  const root = original?.origin ?? id;
  const targets = after.placements.filter((p) => p.id === id || (p.origin ?? p.id) === root).sort((a, b) => Number(b.id === id) - Number(a.id === id));
  for (const target of original ? targets : []) {
    if (target.attachmentBroken || !(original!.role === 'gap' ? target.role === 'gap' : target.role !== 'gap' && original!.source === target.source)) continue;
    const timeless = target.role === 'gap' || target.in === target.out || target.loop;
    if (timeless && target.id !== id) continue;
    const offset = timeless ? (anchor?.offset ?? time - original!.at) : (anchor?.sourceTime ?? (original!.role === 'gap' ? 0 : original!.in + time - original!.at)) - target.in;
    if (offset >= 0 && offset < target.duration) return { time: rounded(target.at + offset), removed: false };
  }
  return { time: rounded(Math.min(time, after.duration)), removed: true };
}

/** Expand cached source words for every selected speech use, retaining each occurrence's target. */
export function mediaWords(media: MediaPlan, authoredDuration = 0): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  const timeline = mediaTimeline(media, authoredDuration);
  const selected = timeline.placements.filter((p) => !p.attachmentBroken && p.role !== 'gap' && p.role !== 'main' && p.speech === true);
  const round = (time: number) => Math.round(time * 1e6) / 1e6;
  for (const p of timeline.placements) {
    if (p.role === 'gap' || p.attachmentBroken) continue;
    if (p.speech === false || (p.role !== 'main' && !p.speech)) continue;
    const source = media.sources.find((s) => s.id === p.source)!;
    if (source.kind === 'image' || p.duration <= 0) continue;
    const range = p.out - p.in;
    for (let cycle = 0; cycle < p.duration; cycle += p.loop ? range : p.duration) {
      for (const word of p.words ?? source.words ?? []) {
        if (word.start < p.in || word.start >= p.out) continue;
        const start = p.at + cycle + word.start - p.in;
        const end = Math.min(p.at + p.duration, p.at + cycle + Math.min(word.end, p.out) - p.in);
        if (start >= p.at + p.duration || end <= start) continue;
        if (p.role === 'main' && selected.some((voice) => voice.at < end && voice.at + voice.duration > start)) continue;
        words.push({ ...word, start: round(start), end: round(end), placement: p.id, source: p.source, sourceStart: word.start });
      }
    }
  }
  return words.sort((a, b) => a.start - b.start);
}

/** Caption grouping matches the page builder, including its short hold inside an occurrence. */
const CAPTION_WORDS = 6;
const CAPTION_PAUSE = 0.3;
const CAPTION_HOLD = 0.6;

export interface MediaCaptionPhrase { start: number; end: number; words: TranscriptWord[] }

export function captionPhrases(words: readonly TranscriptWord[]): MediaCaptionPhrase[] {
  const phrases: MediaCaptionPhrase[] = [];
  let current: TranscriptWord[] = [];
  const ends = (word: TranscriptWord) => /[.,!?;:]$/.test(word.text);
  words.forEach((word, i) => {
    current.push(word);
    const next = words[i + 1];
    const reach = words.slice(i + 1, i + 1 + CAPTION_WORDS + 2 - current.length).some(ends);
    const full = current.length >= CAPTION_WORDS && (!reach || current.length >= CAPTION_WORDS + 2);
    if (!next || full || next.placement !== word.placement || next.start - word.end > CAPTION_PAUSE || (ends(word) && current.length >= 3)) {
      phrases.push({ start: current[0]!.start, end: current.at(-1)!.end, words: current });
      current = [];
    }
  });
  phrases.forEach((phrase, i) => {
    const next = phrases[i + 1];
    if (next && next.start - phrase.end < CAPTION_HOLD && phrase.words.at(-1)!.placement === next.words[0]!.placement) phrase.end = next.start;
  });
  return phrases;
}
