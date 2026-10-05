import type { ProjectEvent, TranscriptionProgress, TranscriptWord } from './types.ts';

/** A video longer than this is split into sections about this far apart. */
const SECTION_SECONDS = 180;
/** A boundary looks for the longest pause this close (seconds) to where it would fall. */
const PAUSE_REACH = 30;
/** A last section shorter than this is not made: the one before it runs to the end. */
const MIN_TAIL = 30;
const MS_PER_SECOND = 1000;

export interface PlanSection {
  id: string;
  name: string;
  start: number;
  end: number;
}

const round3 = (seconds: number): number => Math.round(seconds * MS_PER_SECOND) / MS_PER_SECOND;

/** The middle of the longest gap between two words within `PAUSE_REACH` of `target`, or `target` when no word has a gap there (E12). */
function pauseNear(words: readonly TranscriptWord[], target: number): number {
  let best: { at: number; gap: number } | null = null;
  for (let i = 0; i + 1 < words.length; i++) {
    const gap = words[i + 1]!.start - words[i]!.end;
    const at = words[i]!.end + gap / 2;
    if (gap <= 0 || Math.abs(at - target) > PAUSE_REACH) continue;
    if (best === null || gap > best.gap || (gap === best.gap && Math.abs(at - target) < Math.abs(best.at - target))) best = { at, gap };
  }
  return round3(best?.at ?? target);
}

/**
 * The reel's sections once its words are known: one for a video that is not much over three minutes (E12), else one about
 * every three minutes, each boundary moved to the nearest long pause so a section does not start mid-sentence.
 */
export function autoSections(words: readonly TranscriptWord[], duration: number, title: string): PlanSection[] {
  const bounds: number[] = [];
  for (let n = 1; n * SECTION_SECONDS <= duration - MIN_TAIL; n++) bounds.push(pauseNear(words, n * SECTION_SECONDS));
  if (bounds.length === 0) return [{ id: 'all', name: title, start: 0, end: duration }];
  const edges = [0, ...bounds, duration];
  return edges.slice(0, -1).map((start, i) => ({ id: `part-${i + 1}`, name: `Part ${i + 1}`, start, end: edges[i + 1]! }));
}

/** Seconds left, from how long the audio is, how much is done and how long that took (an estimate: the rest goes at the same pace). Null before any progress. */
export function estimateRemaining(duration: number, processed: number, elapsedMs: number): number | null {
  if (processed <= 0 || elapsedMs <= 0) return null;
  return Math.max(0, Math.round(((duration - processed) * (elapsedMs / MS_PER_SECOND)) / processed));
}

export interface Transcriptions {
  progress(slug: string): TranscriptionProgress | null;
  /** Runs a reel's transcription job in the background. `task` reports the seconds done; a throw becomes the failed state. */
  start(slug: string, duration: number, task: (report: (processed: number) => void) => Promise<void>): void;
  whenDone(slug: string): Promise<void>;
}

/** The transcription jobs of one project, held in memory: progress is for the person watching, not something to restore after a restart. */
export function createTranscriptions(emit: (event: ProjectEvent) => void, now: () => number = Date.now): Transcriptions {
  const states = new Map<string, TranscriptionProgress>();
  const running = new Map<string, Promise<void>>();

  const set = (slug: string, progress: TranscriptionProgress): void => {
    states.set(slug, progress);
    emit({ type: 'transcription-progress', reel: slug, progress });
  };

  return {
    progress: (slug) => states.get(slug) ?? null,
    start(slug, duration, task) {
      const startedAt = now();
      set(slug, { state: 'running', duration, processed: 0, remaining: null });
      const job = task((seconds) => {
        const processed = Math.min(Math.max(seconds, 0), duration);
        set(slug, { state: 'running', duration, processed, remaining: estimateRemaining(duration, processed, now() - startedAt) });
      }).then(
        () => set(slug, { state: 'done', duration, processed: duration, remaining: 0 }),
        (err: unknown) => set(slug, { state: 'failed', duration, processed: states.get(slug)?.processed ?? 0, remaining: null, error: err instanceof Error ? err.message : String(err) }),
      );
      running.set(slug, job);
      void job.then(() => running.delete(slug));
    },
    whenDone: (slug) => running.get(slug) ?? Promise.resolve(),
  };
}
