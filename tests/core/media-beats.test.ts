import { expect, it } from 'vitest';
import { applyOperation, mediaTimeline, placementBeats } from '../../server/core/model.ts';
import type { Sources } from '../../server/core/model.ts';
import { magnetDelta, snapDelta, snapPoints, snapTime } from '../../web/src/review/_internal/placement-edits.ts';

it('freezes source beats and maps a trimmed loop to markers and nearest snap points', () => {
  const initial: Sources = { words: [], plan: { duration: 8, media: { schema: 1,
    sources: [{ id: 'bed', kind: 'audio', path: 'bed.wav', duration: 4 }],
    placements: [{ id: 'music', role: 'audio', source: 'bed', in: 1, out: 3, at: 2, loop: true, duration: 5 }], sequence: [] } } };
  const changed = applyOperation(initial, { by: 'you', id: 'beats', kind: 'source-beats', source: 'bed', beats: { tempo: 120, beats: [0, 1, 1.5, 2, 2.5, 3], downbeats: [1] } });
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
  const trimmed = applyOperation(changed, { by: 'you', id: 'trim', kind: 'placement-change', placement: 'music', changes: { in: 1.5, at: 1, loop: false, duration: 1.5 } });
  expect(placementBeats(trimmed.plan.media!, 'music', 8)).toEqual([{ at: 1, downbeat: false }, { at: 1.5, downbeat: false }, { at: 2, downbeat: false }]);
  expect(() => applyOperation(initial, { by: 'you', id: 'bad', kind: 'source-beats', source: 'bed', beats: { tempo: 120, beats: [2, 1], downbeats: [] } })).toThrow(/Beat/);
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

it('lets a dragged clip pass an edge and lands on one only within reach', () => {
  // A clip from 1 to 3 dragged past the playhead at 2 is not stopped by it.
  expect(magnetDelta([1, 3], 1.4, [2], 0.05)).toBe(1.4);
  // Let go with its start 0.03s short of 2, it lands on 2.
  expect(magnetDelta([1, 3], 0.97, [2], 0.05)).toBe(1);
  // Its end can land on an edge too, and the nearer edge wins.
  expect(magnetDelta([1, 3], 0.52, [3.5, 1.56], 0.05)).toBe(0.5);
});
