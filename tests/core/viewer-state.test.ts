import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { applyOperations, mediaTimeline } from '../../server/core/model.ts';
import type { Sources } from '../../server/core/model.ts';
import { copyFixture } from '../helpers/project.ts';

it('persists markers independently of versions and serializes simultaneous additions', async () => {
  const dir = copyFixture('showreel-project');
  const project = openProject(dir);
    const before = await readFile(join(dir, 'reels/product-showreel/v1/index.html'));
    const [first, second] = await Promise.all([project.addMarker('product-showreel', { time: 2, name: 'Hook' }), project.addMarker('product-showreel', { time: 4, name: '' })]);
    expect(await project.listMarkers('product-showreel')).toHaveLength(2);
    await project.changeMarker('product-showreel', first.id, { name: 'Reveal', time: 3 });
    expect((await project.listMarkers('product-showreel'))[0]).toMatchObject({ name: 'Reveal', time: 3 });
    await project.removeMarker('product-showreel', second.id);
    expect(await project.listMarkers('product-showreel')).toHaveLength(1);
    expect(await readFile(join(dir, 'reels/product-showreel/v1/index.html'))).toEqual(before);
    await expect(project.addMarker('../outside', { time: 1, name: '' })).rejects.toThrow();
    await expect(project.addMarker('product-showreel', { time: -1, name: '' })).rejects.toThrow();
});

it('closes only a free track and retains unrelated overlaps', () => {
  const base: Sources = { words: [], plan: { duration: 20, media: { schema: 1, sources: [{ id: 's', kind: 'audio', path: 'sound.wav', duration: 20 }], tracks: [{ id: 'a', name: 'A', order: 0, gain: 1, mute: false }, { id: 'b', name: 'B', order: 1, gain: 1, mute: false }], sequence: [], placements: [
    { id: 'cut', role: 'audio', source: 's', track: 'a', at: 2, in: 0, out: 2 },
    { id: 'later', role: 'audio', source: 's', track: 'a', at: 6, in: 0, out: 2 },
    { id: 'overlap', role: 'audio', source: 's', track: 'a', at: 3, in: 0, out: 2 },
    { id: 'other', role: 'audio', source: 's', track: 'b', at: 6, in: 0, out: 2 },
  ] } } };
  const result = applyOperations(base, [{ id: 'r', by: 'you', kind: 'placement-ripple-remove', placement: 'cut' }]);
  const times = Object.fromEntries(mediaTimeline(result.plan.media!, 20).placements.map((p) => [p.id, p.at]));
  expect(times).toEqual({ later: 4, overlap: 3, other: 6 });
  expect(base.plan.media!.placements).toHaveLength(4);
});

it('ripples the main sequence and its attachments without shifting free sound', () => {
  const base: Sources = { words: [], plan: { duration: 10, media: { schema: 1, sources: [{ id: 's', kind: 'video', path: 'video.mp4', duration: 10 }], tracks: [{ id: 'a', name: 'A', order: 0, gain: 1, mute: false }], sequence: ['gap', 'main'], placements: [
    { id: 'gap', role: 'gap', duration: 2 }, { id: 'main', role: 'main', source: 's', track: 'a', in: 0, out: 8 },
    { id: 'attached', role: 'audio', source: 's', track: 'a', at: 3, in: 0, out: 1, attachment: { placement: 'main', time: 1 } },
    { id: 'free', role: 'audio', source: 's', track: 'a', at: 3, in: 0, out: 1 },
  ] } } };
  const result = applyOperations(base, [{ id: 'r', by: 'you', kind: 'placement-ripple-remove', placement: 'gap' }]);
  expect(Object.fromEntries(mediaTimeline(result.plan.media!, 8).placements.map((p) => [p.id, p.at]))).toEqual({ main: 0, attached: 1, free: 3 });
});
