import type { TranscriptionProgress } from '../../api/index.ts';

const SECONDS_PER_MINUTE = 60;
const PERCENT = 100;

/** What the progress lane shows for a transcription still running or failed (null once it is done, or when none ran). */
export interface LaneProgress {
  failed: boolean;
  /** 0 to 1. */
  fraction: number;
  percent: number;
  text: string;
}

/** `8 s`, `about 2 min`: how long is left, as an estimate reads. */
export function formatRemaining(seconds: number): string {
  return seconds < SECONDS_PER_MINUTE ? `${Math.max(1, Math.round(seconds))} s` : `${Math.round(seconds / SECONDS_PER_MINUTE)} min`;
}

export function laneProgress(progress: TranscriptionProgress | null | undefined): LaneProgress | null {
  if (!progress || progress.state === 'done') return null;
  const fraction = progress.duration > 0 ? Math.min(1, progress.processed / progress.duration) : 0;
  const percent = Math.round(fraction * PERCENT);
  if (progress.state === 'failed') {
    return { failed: true, fraction, percent, text: `Transcription failed: ${(progress.error ?? 'unknown reason').replace(/.$/, '')}. The footage still plays and edits still collect.` };
  }
  const left = progress.remaining === null ? 'starting' : progress.remaining <= 0 ? 'almost done' : `about ${formatRemaining(progress.remaining)} left`;
  return { failed: false, fraction, percent, text: `Transcribing with faster-whisper · ${left} · you can cut and snip now` };
}
