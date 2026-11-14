import { describe, expect, it } from 'vitest';
import { applyOperation, mediaTimeline, pictureAt, pictureOrder } from '../../server/core/model.ts';
import type { MediaPlan, Sources } from '../../server/core/model.ts';

function sources(): Sources {
  return { words: [], plan: { duration: 4, media: { schema: 1,
    sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 4, audio: false }],
    placements: [{ id: 'main', role: 'main', source: 'a', in: 0, out: 4 },
      { id: 'side', role: 'insert', source: 'a', in: 1, out: 3, at: 0.5 }], sequence: ['main'] } } };
}
describe('free picture regions', () => {
  it('pins the top picture under the point and leaves uncovered canvas unassigned', () => {
    const media = sources().plan.media!;
    const changed = applyOperation({ plan: { media }, words: [] }, { by: 'you', id: 'region', kind: 'placement-change', placement: 'side', changes: { region: { x: 0.5, y: 0, width: 0.5, height: 1 } } });
    const timeline = mediaTimeline(changed.plan.media!);
    expect(pictureAt(timeline, 1, 0.25, 0.5)?.id).toBe('main');
    expect(pictureAt(timeline, 1, 0.75, 0.5)?.id).toBe('side');
    expect(pictureAt(timeline, 3, 0.75, 0.5)?.id).toBe('main');
    expect(pictureAt(timeline, 4, 0.25, 0.5)).toBeUndefined();
    const small = applyOperation(changed, { by: 'you', id: 'small', kind: 'placement-change', placement: 'main', changes: { region: { x: 0, y: 0, width: 0.5, height: 1 } } });
    expect(pictureAt(mediaTimeline(small.plan.media!), 3, 0.75, 0.5)).toBeUndefined();
  });
  it('changes independent regions without changing source timing and retains them through duplicate and split', () => {
    const initial = sources();
    const changed = applyOperation(initial, { by: 'you', id: 'region', kind: 'placement-change', placement: 'side', changes: { region: { x: 0.5, y: 0, width: 0.5, height: 1 } } });
    expect(changed.plan.media!.placements[1]).toMatchObject({ in: 1, out: 3, at: 0.5, region: { x: 0.5, y: 0, width: 0.5, height: 1 } });
    expect(initial.plan.media!.placements[1]).not.toHaveProperty('region');
    const split = applyOperation(changed, { by: 'you', id: 'split', kind: 'placement-split', placement: 'side', at: 1 });
    expect(split.plan.media!.placements.filter((p) => p.role === 'insert')).toHaveLength(2);
    for (const p of split.plan.media!.placements.filter((p) => p.role === 'insert')) expect(p).toHaveProperty('region', { x: 0.5, y: 0, width: 0.5, height: 1 });
    expect(mediaTimeline(split.plan.media!).duration).toBe(4);
  });
  it('preserves front/back order independently of the main sequence', () => {
    const initial = sources();
    const media = initial.plan.media!;
    media.placements.push({ id: 'top', role: 'insert', source: 'a', in: 0, out: 2, at: 0 });
    const changed = applyOperation(initial, { by: 'you', id: 'back', kind: 'placement-layer', placement: 'top', direction: 'back' });
    expect(mediaTimeline(changed.plan.media!).placements.map((p) => p.id)).toEqual(['main', 'top', 'side']);
    expect(changed.plan.media!.sequence).toEqual(['main']);
    expect(pictureOrder(mediaTimeline(changed.plan.media!)).map((p) => p.id)).toEqual(['top', 'main', 'side']);
    const front = applyOperation(changed, { by: 'you', id: 'main-front', kind: 'placement-layer', placement: 'main', direction: 'front' });
    expect(pictureOrder(mediaTimeline(front.plan.media!)).at(-1)?.id).toBe('main');
    expect(pictureAt(mediaTimeline(front.plan.media!), 1, 0.5, 0.5)?.id).toBe('main');
  });
});
