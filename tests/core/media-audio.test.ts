import { describe, expect, it } from 'vitest';
import { applyOperation, mixAt } from '../../server/core/model.ts';
import type { MediaPlan } from '../../server/core/model.ts';

describe('shared placement audio mix', () => {
  it('restores loop phase and proportional short fades at any seek time', () => {
    const media: MediaPlan = {
      schema: 1,
      sources: [{ id: 'music', kind: 'audio', path: 'music.wav', duration: 4 }],
      placements: [{ id: 'song', role: 'audio', source: 'music', at: 0, in: 1, out: 2, duration: 2, loop: true, gain: 2, fadeIn: 2, fadeOut: 2 }],
      sequence: [],
    };

    expect(mixAt(media, 0.5, 2)).toEqual([{ placement: 'song', source: 'music', time: 1.5, gain: 1 }]);
    expect(mixAt(media, 1.5, 2)).toEqual([{ placement: 'song', source: 'music', time: 1.5, gain: 1 }]);
    expect(mixAt(media, 1, 2)).toEqual([{ placement: 'song', source: 'music', time: 1, gain: 2 }]);
    expect(mixAt(media, 2, 2)).toEqual([]);
  });

  it('interpolates manual levels after seeking and keeps Solo separate from saved Mute', () => {
    const media: MediaPlan = {
      schema: 1,
      sources: [{ id: 'music', kind: 'audio', path: 'music.wav', duration: 4 }],
      placements: [
        { id: 'song', role: 'audio', source: 'music', at: 0, in: 0, out: 4, gain: 2, volume: [{ at: 1, gain: 1 }, { at: 3, gain: 0 }] },
        { id: 'effect', role: 'audio', source: 'music', at: 0, in: 0, out: 4, gain: 0.5 },
        { id: 'muted', role: 'audio', source: 'music', at: 0, in: 0, out: 4, mute: true },
      ], sequence: [],
    };

    expect(mixAt(media, 2, 4, ['song'])).toEqual([{ placement: 'song', source: 'music', time: 2, gain: 0.5 }]);
    expect(mixAt(media, 2, 4).map((sample) => sample.placement)).toEqual(['song', 'effect']);
    expect(mixAt(media, 0.5, 4, ['song'])[0].gain).toBe(1.5);
    expect(mixAt(media, 3.5, 4, ['song'])[0].gain).toBe(0);
    expect(mixAt(media, 2, 4, ['muted'])).toEqual([]);
  });

  it('edits sound independently and rejects invalid levels, fades and unordered ramp points', () => {
    const media: MediaPlan = {
      schema: 1, sources: [{ id: 'music', kind: 'audio', path: 'music.wav', duration: 4 }],
      placements: [{ id: 'song', role: 'audio', source: 'music', at: 0, in: 0, out: 4 }], sequence: [],
    };
    const edited = applyOperation({ plan: { media, duration: 4 }, words: [] }, {
      id: 'quiet', kind: 'placement-change', placement: 'song', changes: { gain: 0.5, fadeIn: 1, volume: [{ at: 2, gain: 0 }] },
    });
    expect(mixAt(edited.plan.media!, 1, 4)[0].gain).toBe(0.25);
    expect(mixAt(media, 1, 4)[0].gain).toBe(1);
    for (const changes of [
      { gain: 2.1 }, { gain: NaN }, { fadeIn: -1 }, { fadeOut: Infinity },
      { volume: [{ at: 1, gain: 3 }] }, { volume: [{ at: -1, gain: 1 }] },
      { volume: [{ at: 2, gain: 1 }, { at: 1, gain: 0 }] },
      { volume: [{ at: 1, gain: 1 }, { at: 1, gain: 0 }] },
    ]) {
      expect(() => mixAt({ ...media, placements: [{ ...media.placements[0], ...changes }] }, 1, 4)).toThrow();
    }
  });
});
