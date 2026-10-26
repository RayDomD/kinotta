import { snipPieces } from './edit-model.ts';
import { KinottaError } from './errors.ts';
import type { Piece } from './pieces.ts';
import type { TranscriptWord } from './types.ts';

/** Pauses longer than 1.2s feel like awkward dead silence while preserving relaxed speaking pacing. */
export const GENTLE_GAP_SECONDS = 1.2;

/** Pauses longer than 0.7s disrupt conversational flow in standard edited video presentations. */
export const NORMAL_GAP_SECONDS = 0.7;

/** Pauses longer than 0.35s slow down fast-paced social and short-form video momentum. */
export const TIGHT_GAP_SECONDS = 0.35;

/** Room kept after the last word before a cut, so trailing sounds aren't clipped. */
export const WORD_TAIL_SECONDS = 0.15;

/** Room kept before the next word, so its first sound isn't clipped. */
export const WORD_LEAD_IN_SECONDS = 0.1;

/** Normal only trims a breath with room for a full inhale, so short natural catches between words stay. */
export const NORMAL_BREATH_GAP_SECONDS = 0.4;

/** Tight also trims quick catch-breaths, the shortest wordless gap an audible inhale fits in. */
export const TIGHT_BREATH_GAP_SECONDS = 0.25;

/** Above measured room tone (peaks up to 0.009) and loud phone hiss (about 0.015), below a breath (from 0.027). */
export const BREATH_MIN_PEAK = 0.02;

/** Ceiling below full speech or music so loud non-speech sounds are not mistaken for a breath. */
export const BREATH_MAX_PEAK = 0.25;

/** The by author name tagging snips that Make's dead-air pass added. */
export const DEAD_AIR_BY = 'dead-air';

/** The by author name tagging snips the b-roll agent decided, each with its reason. */
export const AGENT_CUT_BY = 'agent-cut';

export type DeadAirStrength = 'gentle' | 'normal' | 'tight';

export const DEAD_AIR_STRENGTHS: readonly DeadAirStrength[] = ['gentle', 'normal', 'tight'];

export interface DeadAirOptions {
  strength?: DeadAirStrength;
  peaks?: readonly number[];
}

export interface DeadAirCut {
  from: number;
  to: number;
}

const GAP_SECONDS: Record<DeadAirStrength, number> = { gentle: GENTLE_GAP_SECONDS, normal: NORMAL_GAP_SECONDS, tight: TIGHT_GAP_SECONDS };

/** Gentle keeps every breath; the others trim breaths in gaps at least this long. */
const BREATH_GAP_SECONDS: Record<DeadAirStrength, number | null> = { gentle: null, normal: NORMAL_BREATH_GAP_SECONDS, tight: TIGHT_BREATH_GAP_SECONDS };

/** Checks whether a value is one of the supported dead-air trimming strengths. */
export function isDeadAirStrength(value: unknown): value is DeadAirStrength {
  return typeof value === 'string' && (DEAD_AIR_STRENGTHS as readonly string[]).includes(value);
}

/** Throws unless `value` is a strength, `false` (no cutting) or absent. The one place `deadAir` is checked. */
export function checkDeadAir(value: unknown): asserts value is DeadAirStrength | false | undefined {
  if (value !== undefined && value !== false && !isDeadAirStrength(value)) {
    throw new KinottaError('invalid', "deadAir must be 'gentle', 'normal', 'tight', or false");
  }
}

/** Whether the loudest waveform peak inside [cutFrom, cutTo] falls within the audible breath band. */
function hasBreathPeak(peaks: readonly number[] | undefined, total: number, cutFrom: number, cutTo: number): boolean {
  if (!peaks || peaks.length === 0) return false;
  const startIdx = Math.min(peaks.length - 1, Math.floor((cutFrom / total) * peaks.length));
  const endIdx = Math.max(startIdx, Math.min(peaks.length - 1, Math.ceil((cutTo / total) * peaks.length) - 1));
  let maxPeak = -Infinity;
  for (let i = startIdx; i <= endIdx; i++) {
    const p = peaks[i]!;
    if (Number.isFinite(p) && p > maxPeak) maxPeak = p;
  }
  return maxPeak >= BREATH_MIN_PEAK && maxPeak <= BREATH_MAX_PEAK;
}

const round3 = (seconds: number): number => Math.round(seconds * 1000) / 1000;

/**
 * Finds stretches of dead air to cut based on transcript word timings and waveform peaks.
 *
 * Returns the removed stretches in ascending source order.
 */
export function deadAirCuts(
  words: readonly TranscriptWord[],
  duration: number,
  options: DeadAirStrength | DeadAirOptions = {},
): DeadAirCut[] {
  const { strength = 'normal', peaks } = typeof options === 'string' ? { strength: options } : options;
  checkDeadAir(strength);
  const total = round3(duration);
  if (!(total > 0)) return [];

  const cuts: DeadAirCut[] = [];
  const sorted = words
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const breathGap = BREATH_GAP_SECONDS[strength];

  for (let i = 0; i + 1 < sorted.length; i++) {
    const prev = sorted[i]!;
    const next = sorted[i + 1]!;
    const gap = next.start - prev.end;
    const cutFrom = Math.min(total, Math.max(0, round3(prev.end + WORD_TAIL_SECONDS)));
    const cutTo = Math.min(total, Math.max(0, round3(next.start - WORD_LEAD_IN_SECONDS)));
    if (cutTo - cutFrom <= 0.005) continue;

    const isPause = gap > GAP_SECONDS[strength];
    const isBreath = breathGap !== null && gap >= breathGap && hasBreathPeak(peaks, total, cutFrom, cutTo);
    if (isPause || isBreath) cuts.push({ from: cutFrom, to: cutTo });
  }
  return cuts;
}

/**
 * Cut dead air automatically from the transcript's word timings.
 *
 * Removes gaps between consecutive words longer than the threshold for the chosen strength,
 * keeping WORD_TAIL_SECONDS after the last word and WORD_LEAD_IN_SECONDS before the next word so speech sounds aren't clipped.
 * Normal and tight also trim shorter wordless gaps whose audio peaks show a breath.
 */
export function cutDeadAir(words: readonly TranscriptWord[], duration: number, options: DeadAirStrength | DeadAirOptions = {}): Piece[] {
  const total = round3(duration);
  if (!(total > 0)) return [];
  const cuts = deadAirCuts(words, duration, options);
  let pieces: Piece[] = [{ in: 0, out: total }];
  for (const cut of cuts) {
    pieces = snipPieces(pieces, cut.from, cut.to);
  }
  return pieces;
}
