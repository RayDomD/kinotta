import { expect, it } from 'vitest';
import { applyOperation, mediaTimeline } from '../../server/core/model.ts';
import type { Sources } from '../../server/core/model.ts';

it('changes insert drawing order without changing timing, sequence, sound or source identity', () => {
  const sources: Sources = { words: [], plan: { duration: 3, media: { schema: 1, sources: [{ id: 'picture', kind: 'image', path: 'picture.png', duration: 0 }], placements: [{ id: 'gap', role: 'gap', duration: 3 }, { id: 'back', role: 'insert', source: 'picture', in: 0, out: 0, at: 0, duration: 3 }, { id: 'front', role: 'insert', source: 'picture', in: 0, out: 0, at: 1, duration: 2 }], sequence: ['gap'] } } };
  const snapshot = JSON.stringify(sources);
  const forward = applyOperation(sources, { id: 'up', kind: 'placement-layer', placement: 'back', direction: 'front' });
  expect(mediaTimeline(forward.plan.media!, 3).placements.at(-1)?.id).toBe('back');
  expect(forward.plan.media?.sequence).toEqual(sources.plan.media?.sequence);
  expect(forward.plan.media?.sources).toEqual(sources.plan.media?.sources);
  expect(forward.plan.media?.placements.find((p) => p.id === 'back')).toEqual(sources.plan.media?.placements.find((p) => p.id === 'back'));
  const backward = applyOperation(forward, { id: 'down', kind: 'placement-layer', placement: 'back', direction: 'back' });
  expect(mediaTimeline(backward.plan.media!, 3).placements.at(-1)?.id).toBe('front');
  expect(JSON.stringify(sources)).toBe(snapshot);
  expect(() => applyOperation(sources, { id: 'bad', kind: 'placement-layer', placement: 'gap', direction: 'front' })).toThrow('insert picture');
  expect(() => applyOperation(sources, JSON.parse('{"id":"bad","kind":"placement-layer","placement":"back","direction":"sideways"}'))).toThrow('front or back');
});
