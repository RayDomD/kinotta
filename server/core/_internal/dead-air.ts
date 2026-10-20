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

/** Buffer kept after word endings to avoid clipping trailing syllables and natural acoustic decay. */
export const WORD_PAD_SECONDS = 0.08;

/** Shortest wordless interval where an audible inhale or breath pause typically occurs. */
export const BREATH_MIN_GAP_SECONDS = 0.25;

/** Minimum audio amplitude distinguishing audible breath intake from ambient room noise. */
export const BREATH_MIN_PEAK = 0.015;

/** Maximum audio amplitude distinguishing soft breath sounds from intentional speech or coughs. */
export const BREATH_MAX_PEAK = 0.25;

export type DeadAirStrength = 'gentle' | 'normal' | 'tight';

export const DEAD_AIR_STRENGTHS: readonly DeadAirStrength[] = ['gentle', 'normal', 'tight'];

export interface DeadAirOptions {
  strength?: DeadAirStrength;
  peaks?: readonly number[];
}

export class InputError extends KinottaError {
  constructor(message: string) {
    super('invalid', message);
    this.name = 'InputError';
  }
}

/** Checks whether a value is one of the supported dead-air trimming strengths. */
export function isDeadAirStrength(value: unknown): value is DeadAirStrength {
  return typeof value === 'string' && (DEAD_AIR_STRENGTHS as readonly string[]).includes(value);
}

/** Map strength setting to inter-word gap threshold in seconds. */
function gapThreshold(strength: DeadAirStrength): number {
  switch (strength) {
    case 'gentle':
      return GENTLE_GAP_SECONDS;
    case 'tight':
      return TIGHT_GAP_SECONDS;
    case 'normal':
    default:
      return NORMAL_GAP_SECONDS;
  }
}

/**
 * Checks whether the audio waveform peaks inside [cutFrom, cutTo] fall within the audible breath range.
 */
export function hasBreathPeak(
  peaks: readonly number[] | undefined,
  total: number,
  cutFrom: number,
  cutTo: number,
): boolean {
  if (!peaks || !Array.isArray(peaks) || peaks.length === 0 || total <= 0 || cutTo <= cutFrom) {
    return false;
  }

  const startIdx = Math.max(0, Math.min(peaks.length - 1, Math.floor((cutFrom / total) * peaks.length)));
  const endIdx = Math.max(startIdx, Math.min(peaks.length - 1, Math.ceil((cutTo / total) * peaks.length) - 1));

  let maxPeak = -Infinity;
  for (let i = startIdx; i <= endIdx; i++) {
    const p = peaks[i];
    if (typeof p === 'number' && Number.isFinite(p) && p > maxPeak) {
      maxPeak = p;
    }
  }

  if (!Number.isFinite(maxPeak)) {
    return false;
  }

  return maxPeak >= BREATH_MIN_PEAK && maxPeak <= BREATH_MAX_PEAK;
}

/**
 * Cut dead air automatically from the transcript's word timings.
 *
 * Removes gaps between consecutive words longer than the threshold for the chosen strength,
 * keeping WORD_PAD_SECONDS padding after each word so trailing speech sounds are preserved.
 * Also trims wordless gaps with audible breath peaks when peak levels indicate an inhale.
 */
export function cutDeadAir(
  words: readonly TranscriptWord[],
  duration: number,
  options?: DeadAirStrength | DeadAirOptions,
): Piece[] {
  if ((options as unknown) === false) {
    const total = Math.round(duration * 1000) / 1000;
    return total > 0 ? [{ in: 0, out: total }] : [];
  }

  let strength: unknown;
  let peaks: readonly number[] | undefined;

  if (typeof options === 'string') {
    strength = options;
    peaks = undefined;
  } else if (typeof options === 'object' && options !== null) {
    if ((options as { strength?: unknown }).strength === false) {
      const total = Math.round(duration * 1000) / 1000;
      return total > 0 ? [{ in: 0, out: total }] : [];
    }
    strength = options.strength ?? 'normal';
    peaks = options.peaks;
  } else if (options === undefined) {
    strength = 'normal';
    peaks = undefined;
  } else {
    strength = options;
  }

  if (!isDeadAirStrength(strength)) {
    throw new InputError("deadAir must be 'gentle', 'normal', 'tight', or false");
  }

  const total = Math.round(duration * 1000) / 1000;
  if (!(total > 0)) {
    return [];
  }

  let pieces: Piece[] = [{ in: 0, out: total }];

  const sorted = (words ?? [])
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (sorted.length < 2) {
    return pieces;
  }

  const threshold = gapThreshold(strength);

  for (let i = 0; i < sorted.length - 1; i++) {
    const prev = sorted[i]!;
    const next = sorted[i + 1]!;
    const gap = next.start - prev.end;
    const cutFrom = Math.max(0, Math.round((prev.end + WORD_PAD_SECONDS) * 1000) / 1000);
    const cutTo = Math.min(total, Math.round(next.start * 1000) / 1000);

    if (cutTo <= cutFrom || cutTo - cutFrom <= 0.005) {
      continue;
    }

    const isLongGap = gap > threshold;
    const isBreathGap = !isLongGap && gap >= BREATH_MIN_GAP_SECONDS && hasBreathPeak(peaks, total, cutFrom, cutTo);

    if (isLongGap || isBreathGap) {
      pieces = snipPieces(pieces, cutFrom, cutTo);
    }
  }

  return pieces;
}

export type { Piece, TranscriptWord };
