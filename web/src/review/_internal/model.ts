import type { Shot } from '../../api/index.ts';

/** A b-roll clip on the Clips lane: one entry per clip, however many states (shots) it has. */
export interface ClipSpan {
  id: string;
  title: string;
  /** Timeline seconds. */
  start: number;
  end: number;
}

/** A thing placed on the timeline by start and end. */
export interface Span {
  start: number;
  end: number;
}

/** The clips of a version from its shots: a clip's states (05a, 05b) are one clip, running over its shots' lines. */
export function clipSpans(shots: readonly Shot[]): ClipSpan[] {
  const clips = new Map<string, ClipSpan>();
  for (const shot of shots) {
    const id = shot.clip ?? shot.number;
    const start = shot.line?.start ?? shot.start;
    const end = shot.line?.end ?? shot.start + shot.duration;
    const have = clips.get(id);
    if (have) clips.set(id, { ...have, start: Math.min(have.start, start), end: Math.max(have.end, end) });
    else clips.set(id, { id, title: shot.title, start, end });
  }
  return [...clips.values()].sort((a, b) => a.start - b.start);
}

/** Index of the item whose span holds `time`, or -1. */
export function indexAt(items: readonly Span[], time: number): number {
  return items.findIndex((item) => time >= item.start && time < item.end);
}

export { pieceLetter } from '../../../../server/core/model.ts';
