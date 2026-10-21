import { describe, expect, it } from 'vitest';
import {
  projectAddedLane,
  projectCaptionsLane,
  projectVideoLane,
} from '../../web/src/SimpleTimeline.tsx';
import type { MediaCaptionPhrase, PlanClip, mediaWords } from '../../server/core/model.ts';

type Word = ReturnType<typeof mediaWords>[number];

describe('Simple timeline lane projections', () => {
  it('projects legacy pieces into video blocks and cut points', () => {
    const pieces = [
      { at: 0, in: 1.0, out: 4.0 },
      { at: 3.0, in: 4.0, out: 9.0 },
    ];
    const lane = projectVideoLane({ pieces, total: 8.0 });
    expect(lane.blocks).toHaveLength(2);
    expect(lane.blocks[0]).toMatchObject({
      id: 'piece-0',
      start: 0,
      end: 3.0,
      duration: 3.0,
      source: 'legacy',
      sourceIn: 1.0,
      sourceOut: 4.0,
    });
    expect(lane.blocks[1]).toMatchObject({
      id: 'piece-1',
      start: 3.0,
      end: 8.0,
      duration: 5.0,
      source: 'legacy',
      sourceIn: 4.0,
      sourceOut: 9.0,
    });
    expect(lane.cuts).toHaveLength(1);
    expect(lane.cuts[0].at).toBe(3.0);
    // Continuous source (4.0 -> 4.0), no skipped gap
    expect(lane.cuts[0].gap).toBeUndefined();
  });

  it('projects native visual inserts and graphics into Added by Kinotta lane', () => {
    const graphics: PlanClip[] = [
      { id: 'broll-1', title: 'Product Shot', in: 1.5, out: 4.5 } as PlanClip,
    ];
    const visualInserts = [
      { id: 'insert-1', role: 'insert', at: 5.0, duration: 2.0, source: 'overlay-take' },
      { id: 'main-track', role: 'main', at: 0, duration: 10.0, source: 'cam-take' },
      { id: 'gap-track', role: 'gap', at: 7.0, duration: 1.0 },
    ];
    const added = projectAddedLane(graphics, visualInserts);
    expect(added).toHaveLength(2);
    expect(added[0]).toMatchObject({
      id: 'broll-1',
      title: 'Product Shot',
      start: 1.5,
      end: 4.5,
      duration: 3.0,
    });
    expect(added[1]).toMatchObject({
      id: 'insert-1',
      title: 'overlay-take',
      start: 5.0,
      end: 7.0,
      duration: 2.0,
    });
  });

  it('detects source gaps for adjacent forward spans of the same source', () => {
    const placements = [
      { id: 'p1', role: 'main', source: 'take-1', at: 0, in: 2.0, duration: 3.0, out: 5.0 },
      { id: 'p2', role: 'main', source: 'take-1', at: 3.0, in: 8.5, duration: 4.0, out: 12.5 },
    ];
    const lane = projectVideoLane({ placements: placements as any, total: 7.0 });
    expect(lane.blocks).toHaveLength(2);
    expect(lane.cuts).toHaveLength(1);
    expect(lane.cuts[0].at).toBe(3.0);
    expect(lane.cuts[0].gap).toEqual({
      at: 3.0,
      source: 'take-1',
      skipped: 3.5, // 8.5 - 5.0
    });
  });

  it('distinguishes reordering from source gaps (next.in < prev.out)', () => {
    const placements = [
      { id: 'p1', role: 'main', source: 'take-1', at: 0, in: 10.0, duration: 4.0, out: 14.0 },
      { id: 'p2', role: 'main', source: 'take-1', at: 4.0, in: 2.0, duration: 3.0, out: 5.0 },
    ];
    const lane = projectVideoLane({ placements: placements as any, total: 7.0 });
    expect(lane.cuts).toHaveLength(1);
    expect(lane.cuts[0].at).toBe(4.0);
    // Reordered (2.0 < 14.0): not a forward source gap!
    expect(lane.cuts[0].gap).toBeUndefined();
  });

  it('handles repeated sources and source changes without false source gaps', () => {
    const placements = [
      { id: 'p1', role: 'main', source: 'take-A', at: 0, in: 0, duration: 3.0, out: 3.0 },
      { id: 'p2', role: 'main', source: 'take-B', at: 3.0, in: 0, duration: 3.0, out: 3.0 },
      { id: 'p3', role: 'main', source: 'take-A', at: 6.0, in: 0, duration: 2.0, out: 2.0 },
    ];
    const lane = projectVideoLane({ placements: placements as any, total: 8.0 });
    expect(lane.cuts).toHaveLength(2);
    // Boundary 1: take-A -> take-B (different source)
    expect(lane.cuts[0].at).toBe(3.0);
    expect(lane.cuts[0].gap).toBeUndefined();
    // Boundary 2: take-B -> take-A (different source)
    expect(lane.cuts[1].at).toBe(6.0);
    expect(lane.cuts[1].gap).toBeUndefined();
  });

  it('handles empty lanes gracefully', () => {
    const emptyAdded = projectAddedLane([], []);
    expect(emptyAdded).toEqual([]);

    const emptyVideo = projectVideoLane({});
    expect(emptyVideo).toEqual({ blocks: [], cuts: [], cutPoints: [] });
  });

  it('disables captions when captionsOption is false or look is off', () => {
    const sampleWords: Word[] = [
      { text: 'hello', start: 0, end: 1, placement: 'p1', sourceStart: 0 },
    ];
    const samplePhrases: MediaCaptionPhrase[] = [
      { start: 0, end: 1, words: sampleWords },
    ];

    const off1 = projectCaptionsLane(false, samplePhrases, sampleWords);
    expect(off1.enabled).toBe(false);
    expect(off1.phrases).toEqual([]);
    expect(off1.words).toEqual([]);

    const off2 = projectCaptionsLane({ look: 'off' }, samplePhrases, sampleWords);
    expect(off2.enabled).toBe(false);
    expect(off2.phrases).toEqual([]);

    const on1 = projectCaptionsLane(true, samplePhrases, sampleWords);
    expect(on1.enabled).toBe(true);
    expect(on1.phrases).toHaveLength(1);

    const on2 = projectCaptionsLane({ look: 'words' }, samplePhrases, sampleWords);
    expect(on2.enabled).toBe(true);
    expect(on2.phrases).toHaveLength(1);
  });

  it('guards zero duration without errors or division by zero', () => {
    const lane = projectVideoLane({ pieces: [], total: 0 });
    expect(lane.blocks).toEqual([]);
    expect(lane.cuts).toEqual([]);
    expect(lane.cutPoints).toEqual([]);

    const added = projectAddedLane(null, null);
    expect(added).toEqual([]);
  });
});
