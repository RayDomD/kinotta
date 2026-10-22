import { describe, expect, it } from 'vitest';
import { applyOperations, mediaTimeline } from '../../server/core/model.ts';
import type { MediaPlan } from '../../server/core/model.ts';

describe('saved leaveGap replay (ADR 0003)', () => {
  const baseMedia = (): MediaPlan => ({
    schema: 1,
    sources: [
      { id: 'cam1', kind: 'video', path: 'cam1.mp4', duration: 10 },
      { id: 'cam2', kind: 'video', path: 'cam2.mp4', duration: 10 },
    ],
    placements: [
      { id: 'first', role: 'main', source: 'cam1', in: 0, out: 4 },
      { id: 'second', role: 'main', source: 'cam2', in: 0, out: 6 },
    ],
    sequence: ['first', 'second'],
  });

  it('replays saved placement-remove with leaveGap: true unchanged, keeping later clips at their at times', () => {
    const sources = { plan: { media: baseMedia() }, words: [] };
    const savedOperations = [
      { by: 'you', id: 'op-1', kind: 'placement-remove' as const, placement: 'first', leaveGap: true },
    ];
    const replayed = applyOperations(sources, savedOperations);
    const timeline = mediaTimeline(replayed.plan.media!);

    expect(timeline.duration).toBe(10);
    const second = timeline.placements.find((p) => p.id === 'second')!;
    expect(second.at).toBe(4);
    const gap = timeline.placements.find((p) => p.role === 'gap')!;
    expect(gap).toBeDefined();
    expect(gap.duration).toBe(4);
    expect(gap.at).toBe(0);
  });

  it('replays saved placement-snip with leaveGap: true unchanged, leaving a gap and preserving timing', () => {
    const sources = { plan: { media: baseMedia() }, words: [] };
    const savedOperations = [
      { by: 'you', id: 'op-2', kind: 'placement-snip' as const, from: 1, to: 3, leaveGap: true },
    ];
    const replayed = applyOperations(sources, savedOperations);
    const timeline = mediaTimeline(replayed.plan.media!);

    expect(timeline.duration).toBe(10);
    const second = timeline.placements.find((p) => p.id === 'second')!;
    expect(second.at).toBe(4);
    const gap = timeline.placements.find((p) => p.role === 'gap')!;
    expect(gap).toBeDefined();
    expect(gap.duration).toBe(2);
    expect(gap.at).toBe(1);
  });

  it('replays saved placement-change (trim) with leaveGap: true unchanged, keeping later clips fixed', () => {
    const sources = { plan: { media: baseMedia() }, words: [] };
    const savedOperations = [
      { by: 'you', id: 'op-3', kind: 'placement-change' as const, placement: 'first', changes: { out: 2 }, leaveGap: true },
    ];
    const replayed = applyOperations(sources, savedOperations);
    const timeline = mediaTimeline(replayed.plan.media!);

    expect(timeline.duration).toBe(10);
    const second = timeline.placements.find((p) => p.id === 'second')!;
    expect(second.at).toBe(4);
  });

  it('replays saved operations without leaveGap by rippling subsequent clips earlier', () => {
    const sources = { plan: { media: baseMedia() }, words: [] };
    const savedOperations = [
      { by: 'you', id: 'op-4', kind: 'placement-remove' as const, placement: 'first' },
    ];
    const replayed = applyOperations(sources, savedOperations);
    const timeline = mediaTimeline(replayed.plan.media!);

    expect(timeline.duration).toBe(6);
    const second = timeline.placements.find((p) => p.id === 'second')!;
    expect(second.at).toBe(0);
    expect(timeline.placements.some((p) => p.role === 'gap')).toBe(false);
  });
});
