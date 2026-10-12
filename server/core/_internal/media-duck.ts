import { KinottaError } from './errors.ts';
import type { MediaPlan, SourcePlacement } from './media-model.ts';
import { mediaTimeline, mediaWords } from './media-model.ts';

export interface SpeechSpan { start: number; end: number }
export interface DuckSettings { amount: number; attack: number; release: number }
/** Amount is a reduction in dB. Ramps and the word-gap join are in seconds. */
export const DUCK_DEFAULTS: DuckSettings = { amount: 12, attack: 0.15, release: 0.4 };
export const MAX_DUCK_DB = 24;
export const MIN_DUCK_RAMP = 0.01;
export const MAX_DUCK_RAMP = 5;
const SPEECH_JOIN = 0.3;
const PRECISION = 1_000_000;
const DB_AMPLITUDE = 20;
const round = (time: number) => Math.round(time * PRECISION) / PRECISION;

/** Snapshot one speech track on placement-local time, including trims and loops. */
export function duckSpeechSpans(media: MediaPlan, placement: string, speechTrack: string, duration = 0): SpeechSpan[] {
  const timeline = mediaTimeline(media, duration);
  const target = timeline.placements.find((p) => p.id === placement);
  if (!target || target.role !== 'audio' || target.attachmentBroken) throw new KinottaError('invalid', 'Ducking needs an available audio clip.');
  const track = media.tracks?.find((track) => track.id === speechTrack);
  if (!track || speechTrack === target.track) throw new KinottaError('invalid', 'Choose a separate speech track.');
  if (track.mute || track.gain === 0) return [];
  // Caption precedence must not hide words on the speech track the owner chose.
  const selected = { ...media, placements: media.placements.map((p) => p.role === 'gap' ? p : { ...p, speech: p.track === speechTrack && !p.mute && p.gain !== 0 && media.sources.find((source) => source.id === p.source)?.audio !== false }) };
  return mediaWords(selected, duration).map((word) => ({ start: round(word.start - target.at), end: round(word.end - target.at) }));
}

/** Ordered editable points. Close words and overlapping ramps share one dip. */
export function duckVolume(spans: readonly SpeechSpan[], duration: number, gain: number, settings: DuckSettings): NonNullable<SourcePlacement['volume']> {
  const { amount, attack, release } = settings;
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(gain) || gain < 0 || gain > 2
    || !Number.isFinite(amount) || amount < 0 || amount > MAX_DUCK_DB
    || [attack, release].some((ramp) => !Number.isFinite(ramp) || ramp < MIN_DUCK_RAMP || ramp > MAX_DUCK_RAMP)) {
    throw new KinottaError('invalid', 'Ducking needs an amount from 0 to 24 dB and ramps from 0.01 to 5 seconds.');
  }
  if (!Array.isArray(spans) || spans.some((span) => !span || !Number.isFinite(span.start) || !Number.isFinite(span.end) || span.end < span.start)) throw new KinottaError('invalid', 'Speech spans need finite start and end times in order.');
  const audible = spans.filter((span) => span.end > 0 && span.start < duration && span.end > span.start)
    .map((span) => ({ start: Math.max(0, span.start), end: Math.min(duration, span.end) })).sort((a, b) => a.start - b.start);
  const joined: SpeechSpan[] = [];
  for (const span of audible) {
    const last = joined.at(-1);
    if (last && span.start - last.end <= Math.max(SPEECH_JOIN, attack + release)) last.end = Math.max(last.end, span.end);
    else joined.push({ ...span });
  }
  if (amount === 0) return [];
  const low = gain * 10 ** (-amount / DB_AMPLITUDE);
  const points: NonNullable<SourcePlacement['volume']> = [];
  const add = (at: number, level: number) => {
    at = round(at);
    if (points.at(-1)?.at === at) points[points.length - 1] = { at, gain: level };
    else points.push({ at, gain: level });
  };
  for (const span of joined) {
    add(Math.max(0, span.start - attack), gain);
    add(span.start, low);
    add(span.end, low);
    if (span.end < duration) add(Math.min(duration, span.end + release), low + (gain - low) * Math.min(1, (duration - span.end) / release));
  }
  return points;
}
