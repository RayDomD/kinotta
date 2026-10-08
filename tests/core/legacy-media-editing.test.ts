import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { applyOperations, mediaEditingPlan, mediaPlanTimeline } from '../../server/core/model.ts';
import type { NewOperation } from '../../server/core/model.ts';
import { copyFixture } from '../helpers/project.ts';

it.each([null, [], 1, 'plan'])('refuses a malformed legacy plan root with a readable project error (%#)', async (value) => {
  const dir = copyFixture('footage-project');
  writeFileSync(join(dir, 'motion/plan.json'), JSON.stringify(value));
  await expect(openProject(dir).readMediaModel('founder-talk')).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('plan') });
});

it.each([{}, 'ranges', [null]])('refuses malformed legacy source ranges with a readable project error (%#)', async (pieces) => {
  const dir = copyFixture('footage-project');
  writeFileSync(join(dir, 'motion/plan.json'), JSON.stringify({ video: '../media/talk.mp4', duration: 12, pieces }));
  await expect(openProject(dir).readMediaModel('founder-talk')).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('pieces') });
});

it('adapts legacy source-linked graphics and sections without rewriting the old plan, then repairs an interruption explicitly', async () => {
  const dir = copyFixture('footage-project');
  const file = join(dir, 'motion/plan.json');
  const fragment = '<div data-slot="world"><div data-el="card">Card</div></div><!--/world--><script>M.scene({W:1920,H:1080,T:2,bg:"#000",center:[960,540],intro:null,SH:{still:{w:100,h:100}},start:"still",SEQ:[],layers:[]});</script>';
  writeFileSync(join(dir, 'motion/card.html'), fragment);
  writeFileSync(file, JSON.stringify({ title: 'Legacy source ranges', video: '../media/talk.mp4', duration: 12, pieces: [{ in: 8, out: 10 }, { in: 10, out: 12 }], sections: [{ id: 'topic', name: 'Topic', start: 8, end: 12 }], clips: [{ id: '01', title: 'Card', clip: 'card.html', in: 9, out: 11, section: 'topic', kind: 'full' }] }));
  const original = readFileSync(file, 'utf8');
  const oldPage = readFileSync(join(dir, 'reels/founder-talk/v1/index.html'), 'utf8');
  const project = openProject(dir);
  const model = await project.readMediaModel('founder-talk');
  expect(model.legacySources).toBeDefined();
  const replayed = mediaEditingPlan(applyOperations(model.legacySources!, [{ id: 'legacy-pending', kind: 'snip', from: 8.5, to: 9 }])).media!;
  expect(replayed.sequence).toHaveLength(3);
  const mapped = mediaPlanTimeline({ media: model.media, duration: model.duration, clips: model.clips, sections: model.sections });
  expect(model.duration).toBe(4);
  expect(mapped.clips?.[0]).toMatchObject({ in: 1, out: 3, attachmentBroken: false });
  expect(mapped.sections?.map((s) => [s.start, s.end])).toEqual([[0, 4]]);
  expect(readFileSync(file, 'utf8')).toBe(original);
  await project.addOperation('founder-talk', { kind: 'placement-move', placement: model.media.sequence[1]!, index: 0 });
  await expect(project.saveEdits('founder-talk')).rejects.toThrow('attachment');
  expect((await project.readEditList('founder-talk')).operations).toHaveLength(1);
  await project.addOperation('founder-talk', { kind: 'clip-split', clip: '01' });
  await project.saveEdits('founder-talk');
  const saved = await project.readVersion('founder-talk', 2);
  expect(saved.shots.map((s) => [s.line?.start, s.line?.end])).toEqual([[0, 1], [3, 4]]);
  expect(saved.sections.map((s) => [s.start, s.end])).toEqual([[0, 2], [2, 4]]);
  expect(readFileSync(join(dir, 'reels/founder-talk/v1/index.html'), 'utf8')).toBe(oldPage);
});

it('keeps placement-specific speech corrections independent when the first edit converts a legacy reel', async () => {
  const dir = copyFixture('footage-project');
  const file = join(dir, 'motion/plan.json');
  writeFileSync(file, JSON.stringify({ video: '../media/talk.mp4', duration: 12, clips: [], sections: [{ id: 'all', name: 'All', start: 0, end: 12 }] }));
  writeFileSync(join(dir, 'reels/founder-talk/transcript.json'), JSON.stringify({ words: [{ text: 'hello', start: 1, end: 1.5 }] }));
  const project = openProject(dir);
  const model = await project.readMediaModel('founder-talk');
  await project.addOperation('founder-talk', { kind: 'word-text', placement: model.media.sequence[0]!, at: 1, text: 'corrected' });
  await project.saveEdits('founder-talk');
  const saved = await project.readVersion('founder-talk', 2);
  expect(saved.media?.sources[0]?.words?.[0]?.text).toBe('hello');
  expect(saved.media?.placements[0]?.role !== 'gap' && saved.media?.placements[0]?.words?.[0]?.text).toBe('corrected');
  expect(saved.transcript?.[0]?.text).toBe('corrected');
});

it('converts a first graphic repair trim and rejects a mismatched attachment identity', async () => {
  const dir = copyFixture('footage-project');
  writeFileSync(join(dir, 'motion/card.html'), '<div data-slot="world"><div data-el="card">Card</div></div><!--/world--><script>M.scene({W:1920,H:1080,T:2,bg:"#000",center:[960,540],intro:null,SH:{still:{w:100,h:100}},start:"still",SEQ:[],layers:[]});</script>');
  writeFileSync(join(dir, 'motion/plan.json'), JSON.stringify({ title: 'Legacy repair', video: '../media/talk.mp4', duration: 12, pieces: [{ in: 8, out: 10 }, { in: 11, out: 12 }], sections: [{ id: 'topic', name: 'Topic', start: 8, end: 12 }], clips: [{ id: '01', title: 'Card', clip: 'card.html', in: 9, out: 11.8, section: 'topic', kind: 'full' }] }));
  const project = openProject(dir);
  const model = await project.readMediaModel('founder-talk');
  const placement = model.clips![0]!.placement!;
  await expect(project.addOperation('founder-talk', { kind: 'clip-trim', clip: '01', placement: 'wrong-occurrence', in: 9, out: 10 })).rejects.toThrow('attachment');
  await project.addOperation('founder-talk', { kind: 'clip-trim', clip: '01', placement, in: 9, out: 10 });
  await project.saveEdits('founder-talk');
  const saved = await project.readVersion('founder-talk', 2);
  expect(saved.media).toBeDefined();
  expect(saved.sections.map((s) => [s.start, s.end])).toEqual([[0, 2], [2, 3]]);
  expect(saved.shots[0]?.line).toEqual({ start: 1, end: 2 });
});

it('refuses legacy piece edits once a reel uses native placements instead of recording ignored changes', async () => {
  const dir = copyFixture('footage-project');
  const file = join(dir, 'motion/plan.json');
  const project = openProject(dir);
  const model = await project.readMediaModel('founder-talk');
  writeFileSync(file, JSON.stringify({ title: 'Native timeline', duration: model.duration, media: model.media, clips: [] }));
  const legacy: NewOperation[] = [{ kind: 'snip', from: 0, to: 0.3 }, { kind: 'cut', at: 1 }, { kind: 'move-piece', from: 0, to: 1 }];
  for (const operation of legacy) await expect(project.addOperation('founder-talk', operation)).rejects.toThrow('placement');
  expect((await project.readEditList('founder-talk')).operations).toEqual([]);
});

it('pins legacy review moments and carries them through first native conversion without jumping to a new duplicate', async () => {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels/founder-talk');
  const plan = { title: 'Legacy pins', video: '../media/talk.mp4', duration: 12, pieces: [{ in: 8, out: 10 }, { in: 10, out: 12 }], clips: [], sections: [{ id: 'topic', name: 'Topic', start: 8, end: 12 }] };
  writeFileSync(join(dir, 'motion/plan.json'), JSON.stringify(plan));
  // The saved plan rebases its path, but carries the same source ranges.
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ ...plan, video: '../../../media/talk.mp4' }));
  writeFileSync(join(reel, 'transcript.json'), JSON.stringify({ words: [{ text: 'hello', start: 9, end: 9.5 }] }));
  const shots = JSON.parse(readFileSync(join(reel, 'v1/shots.json'), 'utf8'));
  writeFileSync(join(reel, 'v1/shots.json'), JSON.stringify({ ...shots, duration: 4, sections: [{ id: 'topic', name: 'Topic', start: 0, end: 4 }], shots: [{ ...shots.shots[0], line: { start: 2, end: 3 }, start: 2, section: 'topic' }] }));
  const project = openProject(dir);
  const frame = await project.addComment('founder-talk', 1, { text: 'Frame', pin: { kind: 'frame', shot: '', time: 1.25, x: 0.2, y: 0.3, element: null } });
  expect(frame.comment.pin.time).toBe(1.25);
  expect(frame.comment.pin.section).toBe('topic');
  await project.addComment('founder-talk', 1, { text: 'Word', pin: { kind: 'word', shot: '', time: 1, word: 'hello' } });
  await expect(project.addComment('founder-talk', 1, { text: 'Outside', pin: { kind: 'frame', shot: '', time: 4, x: 0.2, y: 0.3, element: null } })).rejects.toThrow('moment');
  const model = await project.readMediaModel('founder-talk');
  const first = model.media.sequence[0]!;
  const second = model.media.sequence[1]!;
  await project.addOperation('founder-talk', { kind: 'placement-move', placement: second, index: 0 });
  await project.saveEdits('founder-talk');
  const carried = await project.listComments('founder-talk', 2);
  expect(carried.map((c) => [c.text, c.pin.time, c.pin.placement, c.pin.sourceTime])).toEqual([['Word', 3, first, 9], ['Frame', 3.25, first, 9.25]]);
  const original = model.media.placements[0]!;
  expect(original.role).toBe('main');
  if (original.role === 'gap') throw new Error('Expected footage');
  await project.addOperation('founder-talk', { kind: 'placement-add', placement: { ...original, id: 'duplicate', origin: undefined }, index: 0 });
  await project.addOperation('founder-talk', { kind: 'placement-remove', placement: first });
  await project.saveEdits('founder-talk');
  const removed = await project.listComments('founder-talk', 3);
  expect(removed.map((c) => c.state)).toEqual(['moment-removed', 'moment-removed']);
  expect(removed.map((c) => c.pin.placement)).toEqual([first, first]);
});

it('flags old footage pins when a native rebuild has no lineage to the old source', async () => {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels/founder-talk');
  const project = openProject(dir);
  await project.addComment('founder-talk', 1, { text: 'Old footage', pin: { shot: '01', x: 0.2, y: 0.3, element: null } });
  mkdirSync(join(reel, 'v2'));
  writeFileSync(join(reel, 'v2/index.html'), readFileSync(join(reel, 'v1/index.html')));
  writeFileSync(join(reel, 'v2/shots.json'), readFileSync(join(reel, 'v1/shots.json')));
  writeFileSync(join(reel, 'v2/plan.json'), JSON.stringify({ media: { schema: 1, sources: [{ id: 'new', kind: 'video', path: '../../../media/talk.mp4', duration: 12 }], placements: [{ id: 'new-use', role: 'main', source: 'new', in: 0, out: 12 }], sequence: ['new-use'] } }));
  expect((await project.listComments('founder-talk', 2))[0]?.state).toBe('moment-removed');
});
