import type { TranscriptionProgress } from '../../api/index.ts';
import { formatRemaining } from '../../timecode.ts';

const PERCENT = 100;

/** What the progress lane shows for a transcription still running or failed (null once it is done, or when none ran). */
export interface LaneProgress {
  failed: boolean;
  /** 0 to 1. */
  fraction: number;
  percent: number;
  text: string;
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
