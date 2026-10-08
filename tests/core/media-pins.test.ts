import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

it('carries word pins with their particular reuse and flags removal instead of using the other reuse', async () => {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels/founder-talk');
  const media = {
    schema: 1, sources: [{ id: 'a', kind: 'video', path: '../../media/talk.mp4', duration: 12, words: [{ text: 'hello', start: 1, end: 1.5 }] }],
    placements: [{ id: 'first', role: 'main', source: 'a', in: 0, out: 3 }, { id: 'second', role: 'main', source: 'a', in: 0, out: 3 }], sequence: ['first', 'second'],
  };
  const plan = { title: 'Repeat', clips: [], captions: true, duration: 6, sections: [{ id: 'all', name: 'All', start: 0, end: 6 }], media };
  writeFileSync(join(reel, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ ...plan, media: { ...media, sources: [{ ...media.sources[0], path: '../../../media/talk.mp4' }] } }));
  const shots = JSON.parse(readFileSync(join(reel, 'v1/shots.json'), 'utf8'));
  writeFileSync(join(reel, 'v1/shots.json'), JSON.stringify({ ...shots, duration: 6, shots: [] }));
  const project = openProject(dir);
  await project.addComment('founder-talk', 1, { text: 'First', pin: { kind: 'word', shot: '', time: 1, word: 'hello' } });
  await project.addComment('founder-talk', 1, { text: 'Second', pin: { kind: 'word', shot: '', time: 4, word: 'hello' } });
  await project.addOperation('founder-talk', { kind: 'placement-move', placement: 'second', index: 0 });
  await project.saveEdits('founder-talk');
  const carried = await project.listComments('founder-talk', 2);
  expect(carried.map((comment) => [comment.text, comment.pin.time, comment.pin.placement])).toEqual([['Second', 1, 'second'], ['First', 4, 'first']]);
  await project.addOperation('founder-talk', { kind: 'placement-remove', placement: 'second' });
  await project.saveEdits('founder-talk');
  const removed = (await project.listComments('founder-talk', 3)).find((comment) => comment.text === 'Second')!;
  expect(removed.state).toBe('moment-removed');
  expect(removed.pin.placement).toBe('second');
});
