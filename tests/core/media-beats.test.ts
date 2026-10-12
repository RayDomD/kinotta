import { expect, it } from 'vitest';
import { applyOperation, mediaTimeline, placementBeats } from '../../server/core/model.ts';
import type { Sources } from '../../server/core/model.ts';
import { snapDelta, snapPoints, snapTime } from '../../web/src/review/_internal/placement-edits.ts';

it('freezes source beats and maps a trimmed loop to markers and nearest snap points', () => {
  const initial: Sources = { words: [], plan: { duration: 8, media: { schema: 1,
    sources: [{ id: 'bed', kind: 'audio', path: 'bed.wav', duration: 4 }],
    placements: [{ id: 'music', role: 'audio', source: 'bed', in: 1, out: 3, at: 2, loop: true, duration: 5 }], sequence: [] } } };
  const changed = applyOperation(initial, { id: 'beats', kind: 'source-beats', source: 'bed', beats: { tempo: 120, beats: [0, 1, 1.5, 2, 2.5, 3], downbeats: [1] } });
  expect(initial.plan.media!.sources[0]).not.toHaveProperty('beats');
  const timeline = mediaTimeline(changed.plan.media!, 8);
  expect(placementBeats(changed.plan.media!, 'music', 8)).toEqual([
    { at: 2, downbeat: true }, { at: 2.5, downbeat: false }, { at: 3, downbeat: false }, { at: 3.5, downbeat: false },
    { at: 4, downbeat: true }, { at: 4.5, downbeat: false }, { at: 5, downbeat: false }, { at: 5.5, downbeat: false },
    { at: 6, downbeat: true }, { at: 6.5, downbeat: false },
  ]);
  expect(snapTime(4.47, snapPoints(timeline, '', 0, changed.plan.media!), 0.05)).toBe(4.5);
  expect(snapTime(4.47, snapPoints(timeline, '', 0), 0.05)).toBe(4.47);
  expect(snapPoints(timeline, 'music', 0, changed.plan.media!)).not.toContain(4.5);
  const trimmed = applyOperation(changed, { id: 'trim', kind: 'placement-change', placement: 'music', changes: { in: 1.5, at: 1, loop: false, duration: 1.5 } });
  expect(placementBeats(trimmed.plan.media!, 'music', 8)).toEqual([{ at: 1, downbeat: false }, { at: 1.5, downbeat: false }, { at: 2, downbeat: false }]);
  expect(() => applyOperation(initial, { id: 'bad', kind: 'source-beats', source: 'bed', beats: { tempo: 120, beats: [2, 1], downbeats: [] } })).toThrow(/Beat/);
});

it('keeps nudging past a beat the edge was rounded short of', () => {
  let edge = 1.1;
  const stops: number[] = [];
  for (let press = 0; press < 3; press += 1) {
    edge = Math.round((edge + snapDelta([edge], 0.1, [1.234558, 1.7], 0)) * 100) / 100;
    stops.push(edge);
  }
  expect(stops).toEqual([1.2, 1.23, 1.33]);
});
