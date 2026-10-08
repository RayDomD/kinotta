import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyOperation, mediaTimeline, mediaWords, mixAt } from '../../server/core/model.ts';
import type { MediaPlan } from '../../server/core/model.ts';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const media: MediaPlan = {
  schema: 1,
  sources: [
    { id: 'talk', kind: 'video', path: 'talk.mp4', duration: 12, words: [{ text: 'one', start: 1, end: 1.5 }, { text: 'two', start: 4, end: 4.5 }] },
    { id: 'music', kind: 'audio', path: 'music.wav', duration: 10 },
    { id: 'logo', kind: 'image', path: 'logo.png', duration: 0 },
  ],
  placements: [
    { id: 'take', role: 'main', source: 'talk', in: 0, out: 6, fadeIn: 1, fadeOut: 1, volume: [{ at: 4, gain: 0 }] },
    { id: 'still', role: 'main', source: 'logo', in: 0, out: 0, duration: 3 },
    { id: 'pause', role: 'gap', duration: 2 },
    { id: 'bed', role: 'audio', source: 'music', at: 1, in: 2, out: 8 },
    { id: 'loop', role: 'audio', source: 'music', at: 0, in: 0, out: 2, duration: 8, loop: true },
  ],
  sequence: ['take', 'still', 'pause'],
};
const sources = { plan: { media }, words: [] };
const split = (placement: string, at: number) => applyOperation(sources, { id: 'op1', kind: 'placement-split', placement, at }).plan.media!;

describe('splitting a placement', () => {
  it('keeps broken followed media silent and blocks Save until its attachment is repaired', async () => {
    const dir = copyFixture('footage-project');
    const reel = join(dir, 'reels/founder-talk');
    const native: MediaPlan = { schema: 1, sources: [{ id: 'talk', kind: 'video', path: '../../media/talk.mp4', duration: 12, words: [{ text: 'speech', start: 1.25, end: 1.5 }] }], placements: [
      { id: 'take', role: 'main', source: 'talk', in: 0, out: 6 },
      { id: 'repeat', role: 'main', source: 'talk', in: 0, out: 6 },
      { id: 'effect', role: 'audio', source: 'talk', in: 0, out: 1, at: 1, speech: true, attachment: { placement: 'take', time: 1 } },
    ], sequence: ['take', 'repeat'] };
    const plan = { title: 'Attachments', clips: [], duration: 12, sections: [{ id: 'all', name: 'All', start: 0, end: 12 }], media: native };
    writeFileSync(join(reel, 'plan.json'), JSON.stringify(plan));
    writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ ...plan, media: { ...native, sources: [{ ...native.sources[0], path: '../../../media/talk.mp4' }] } }));
    const project = openProject(dir);
    await project.addOperation('founder-talk', { kind: 'placement-remove', placement: 'take' });
    const edited = applyOperation({ plan, words: [] }, { id: 'remove', kind: 'placement-remove', placement: 'take' });
    expect(mixAt(edited.plan.media!, 1.5).map((s) => s.placement)).toEqual(['repeat']);
    expect(mediaWords(edited.plan.media!).map((w) => w.text)).toEqual(['speech']);
    await expect(project.saveEdits('founder-talk')).rejects.toThrow('attachment');
    expect((await project.readEditList('founder-talk')).operations).toHaveLength(1);
    await project.addOperation('founder-talk', { kind: 'placement-change', placement: 'effect', changes: { attachment: null, at: 1 } });
    await expect(project.saveEdits('founder-talk')).resolves.toMatchObject({ version: 2 });
    const savedPlan = JSON.parse(readFileSync(join(reel, 'v2/plan.json'), 'utf8'));
    savedPlan.media.placements.find((p: { id: string }) => p.id === 'effect').attachment = { placement: 'gone', time: 1 };
    writeFileSync(join(reel, 'v2/plan.json'), JSON.stringify(savedPlan));
    await expect(project.render({ reel: 'founder-talk', version: 2, preset: 'draft' })).rejects.toThrow('attachment');
  });
  it('cuts a main take at a moment into two uses that keep their speech, sound and place', () => {
    const after = split('take', 2);
    expect(after.sequence).toEqual(['take', 'take~op1', 'still', 'pause']);
    const timeline = mediaTimeline(after);
    expect(timeline.placements.slice(0, 2).map((p) => [p.id, p.at, p.duration, p.role !== 'gap' && p.in, p.role !== 'gap' && p.out])).toEqual([['take', 0, 2, 0, 2], ['take~op1', 2, 4, 2, 6]]);
    expect(after.placements.find((p) => p.id === 'take~op1')).toMatchObject({ origin: 'take', fadeIn: 0, fadeOut: 1 });
    expect(after.placements.find((p) => p.id === 'take')).toMatchObject({ fadeIn: 1, fadeOut: 0 });
    expect(mediaWords(after).map((w) => [w.text, w.start, w.placement])).toEqual([['one', 1, 'take'], ['two', 4, 'take~op1']]);
    // The volume ramp continues across the cut as one envelope: same level heard at every moment.
    for (const time of [0.5, 1.5, 2.5, 3, 3.9, 5.5]) {
      const level = (plan: MediaPlan) => mixAt(plan, time).find((s) => s.source === 'talk')!.gain;
      expect(level(after)).toBeCloseTo(level(media), 6);
    }
  });

  it('splits added sound on reel time, images and gaps by duration, and refuses a loop or a moment outside the use', () => {
    const bed = mediaTimeline(split('bed', 1.5)).placements.filter((p) => p.id.startsWith('bed'));
    expect(bed.map((p) => [p.id, p.at, p.duration, p.role !== 'gap' && p.in, p.role !== 'gap' && p.out])).toEqual([['bed', 1, 1.5, 2, 3.5], ['bed~op1', 2.5, 4.5, 3.5, 8]]);
    expect(mediaTimeline(split('still', 1)).placements.filter((p) => p.id.startsWith('still')).map((p) => [p.id, p.at, p.duration])).toEqual([['still', 6, 1], ['still~op1', 7, 2]]);
    expect(mediaTimeline(split('pause', 0.5)).placements.filter((p) => p.id.startsWith('pause')).map((p) => [p.id, p.at, p.duration])).toEqual([['pause', 9, 0.5], ['pause~op1', 9.5, 1.5]]);
    expect(() => split('loop', 1)).toThrow('Turn Loop off');
    expect(() => split('take', 0)).toThrow('inside the placement');
    expect(() => split('take', 6)).toThrow('inside the placement');
    expect(() => split('gone', 1)).toThrow('Placement gone is missing');
  });

  it('keeps a comment on the second half of a take after Save, and splits again from the same origin', async () => {
    const dir = copyFixture('footage-project');
    const reel = join(dir, 'reels/founder-talk');
    const native = { schema: 1, sources: [{ id: 'a', kind: 'video', path: '../../media/talk.mp4', duration: 12, words: [{ text: 'hello', start: 1, end: 1.5 }, { text: 'later', start: 4, end: 4.5 }] }], placements: [{ id: 'take', role: 'main', source: 'a', in: 0, out: 6 }], sequence: ['take'] };
    const plan = { title: 'Split', clips: [], captions: true, duration: 6, sections: [{ id: 'all', name: 'All', start: 0, end: 6 }], media: native };
    writeFileSync(join(reel, 'plan.json'), JSON.stringify(plan));
    writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ ...plan, media: { ...native, sources: [{ ...native.sources[0], path: '../../../media/talk.mp4' }] } }));
    const shots = JSON.parse(readFileSync(join(reel, 'v1/shots.json'), 'utf8'));
    writeFileSync(join(reel, 'v1/shots.json'), JSON.stringify({ ...shots, duration: 6, shots: [] }));
    const project = openProject(dir);
    await project.addComment('founder-talk', 1, { text: 'Early', pin: { kind: 'word', shot: '', time: 1, word: 'hello' } });
    await project.addComment('founder-talk', 1, { text: 'Late', pin: { kind: 'frame', shot: '', time: 4.2, x: 0.5, y: 0.5, element: null } });

    const { operations } = await project.addOperation('founder-talk', { kind: 'placement-split', placement: 'take', at: 3 });
    const second = `take~${operations[0]!.id}`;
    await project.addOperation('founder-talk', { kind: 'placement-move', placement: second, index: 0 });
    await project.saveEdits('founder-talk');

    const carried = await project.listComments('founder-talk', 2);
    expect(carried.map((c) => [c.text, c.state ?? 'open', c.pin.time])).toEqual([['Late', 'open', 1.2], ['Early', 'open', 4]]);
    const saved = await project.readVersion('founder-talk', 2);
    expect(saved.media!.sequence).toEqual([second, 'take']);
    expect(saved.media!.placements.find((p) => p.id === second)).toMatchObject({ origin: 'take' });
  });
});
