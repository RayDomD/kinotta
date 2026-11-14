import { expect, it } from 'vitest';
import { applyOperation, mediaTimeline } from '../../server/core/model.ts';
import type { MediaPlan } from '../../server/core/model.ts';

const media: MediaPlan = { schema: 1, sources: [{ id: 'a', kind: 'audio', path: 'a.wav', duration: 3 }], tracks: [{ id: 'music', name: 'Music', order: 0, gain: 1, mute: false }], placements: [{ id: 'first', role: 'audio', source: 'a', track: 'music', in: 0, out: 1, at: 0 }, { id: 'second', role: 'audio', source: 'a', track: 'music', in: 0, out: 1, at: 2 }], sequence: [] };

it('edits one shared track EQ without changing its placements or the original model', () => {
  const next = applyOperation({ plan: { media, duration: 3 }, words: [] }, { by: 'you', id: 'eq', kind: 'track-change', track: 'music', changes: { eq: [{ type: 'peaking', frequency: 2500, gain: -3, q: 0.8 }], eqBypass: false } });
  expect(next.plan.media!.tracks![0].eq).toEqual([{ type: 'peaking', frequency: 2500, gain: -3, q: 0.8 }]);
  expect(next.plan.media!.placements).toEqual(media.placements);
  expect(media.tracks![0]).not.toHaveProperty('eq');
  expect(() => mediaTimeline({ ...media, tracks: [{ ...media.tracks![0], eq: [{ type: 'peaking', frequency: 0 }] }] }, 3)).toThrow(/EQ/);
});
