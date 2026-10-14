import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'product-showreel';
const move = (clip: string, x: number) => ({ kind: 'element-offset' as const, clip, element: clip === 'cube-lands' ? 'cube' : 'headline', x, y: 0, scale: 1 });

describe('working comment hand-off', () => {
  it('freezes the captured reel, names its version in the batch and preserves live editing and history', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    await project.addComment(REEL, 2, { pin: { shot: '01', x: 0.5, y: 0.5, element: 'cube' }, text: 'Hold this.' });
    await project.addOperation(REEL, move('cube-lands', 10));
    const batch = await project.copyBatch(REEL, 2);
    expect(batch.file).toContain('/v3/');
    expect(JSON.parse(readFileSync(join(dir, batch.file), 'utf8')).version).toBe(3);
    expect((await project.listComments(REEL, 3))[0]?.sent).toBe(true);
    const state = JSON.parse(readFileSync(join(dir, 'reels', '.kinotta', REEL, 'v3.json'), 'utf8'));
    expect(state.carriedFrom.ids).toEqual(state.comments.map((comment: { id: string }) => comment.id));
    const after = await project.addOperation(REEL, move('cube-lands', 20));
    expect(after.operations).toHaveLength(2);
    expect(after.canUndo).toBe(true);
    expect((await project.readVersion(REEL, 3)).code?.offsets['cube-lands']?.cube?.x).toBe(10);
  });

  it('maps comment moments onto the frozen reel after a footage edit', { timeout: 120_000 }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    await project.addComment('founder-talk', 1, { pin: { kind: 'word', shot: '03', time: 8.65, word: 'lose' }, text: 'Land here.' });
    await project.addOperation('founder-talk', { kind: 'snip', from: 6, to: 7 });
    const batch = await project.copyBatch('founder-talk', 1, { section: 'sync-problem' });
    const stored = JSON.parse(readFileSync(join(dir, batch.file), 'utf8'));
    expect(stored.version).toBe(2);
    expect(stored.comments[0].time).toBe(7.65);
  });

  it('freezes a note-only hand-off without losing its note', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    await project.setNote(REEL, 2, 'Slow the opening.');
    await project.addOperation(REEL, move('cube-lands', 10));
    const first = await project.copyBatch(REEL, 2);
    expect(first.file).toContain('/v3/');
    expect(first.text).toContain('Slow the opening.');
    expect((await project.copyBatch(REEL, 3)).file).toBe(first.file);
  });

  it('reuses unchanged footage across repeated hand-offs, including when graphic dependency reads complete in a different order', { timeout: 120_000 }, async () => {
    const project = openProject(copyFixture('footage-project'));
    await project.setNote('founder-talk', 1, 'Keep the opening.');
    for (let repeat = 0; repeat < 5; repeat++) {
      expect((await project.copyBatch('founder-talk', 1, { section: 'cold-open' })).file).toContain('/v1/');
    }
    expect((await project.listVersions('founder-talk')).map((version) => version.number)).toEqual([1]);
  });

  it('replays later live edits onto the agent response and flags a removed target', async () => {
    const dir = copyFixture('showreel-project');
    const reelDir = join(dir, 'reels', REEL);
    const project = openProject(dir);
    await project.setNote(REEL, 2, 'Change the opening.');
    await project.addOperation(REEL, move('cube-lands', 10));
    await project.copyBatch(REEL, 2);
    const later = await project.addOperation(REEL, move('cube-lands', 20));
    cpSync(join(reelDir, 'v3'), join(reelDir, 'v4'), { recursive: true });
    const page = join(reelDir, 'v4', 'index.html');
    writeFileSync(page, readFileSync(page, 'utf8').replace('data-scene="cube-lands"', 'data-scene="new-opening"'));
    const list = await project.readEditList(REEL);
    expect(list.operations).toEqual([later.operations[1]]);
    expect(list.flagged?.[later.operations[1]!.id]).toContain('cube-lands');
  });

  it('accepts a pin on restored working footage beyond the latest frozen duration and maps it at hand-off', { timeout: 120_000 }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    await project.addOperation('founder-talk', { kind: 'snip', from: 3, to: 5 });
    await project.freezeEdits('founder-talk');
    await project.undoEdit('founder-talk');
    const added = await project.addComment('founder-talk', 2, { pin: { kind: 'frame', shot: '04', time: 11, x: 0.5, y: 0.5, element: null }, text: 'This restored moment.' });
    expect(added.comment.pin.time).toBe(11);
    const batch = await project.copyBatch('founder-talk', 2, { section: 'sync-problem' });
    const stored = JSON.parse(readFileSync(join(dir, batch.file), 'utf8'));
    expect(stored.version).toBe(3);
    expect(stored.comments[0].time).toBe(11);
    expect((await project.listComments('founder-talk', 3))[0]?.state).toBeUndefined();
  });

  it('pins the word actually visible after a live snip, preserving its source moment through hand-off', { timeout: 120_000 }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    await project.addOperation('founder-talk', { kind: 'snip', from: 6, to: 7 });
    const added = await project.addComment('founder-talk', 1, { pin: { kind: 'word', shot: '03', time: 7.65, word: 'lose' }, text: 'Land here in Working.' });
    expect(added.comment.pin.sourceTime).toBe(8.65);
    const batch = await project.copyBatch('founder-talk', 1, { section: 'sync-problem' });
    expect(JSON.parse(readFileSync(join(dir, batch.file), 'utf8')).comments[0].time).toBe(7.65);
  });
});
