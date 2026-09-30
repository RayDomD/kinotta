import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'founder-talk';
const LOSE = { kind: 'word', shot: '03', time: 8.65, word: 'lose' } as const;

describe('word pins', () => {
  it('saves the transcript word and its time, ignoring the client rounding', async () => {
    const project = openProject(copyFixture('footage-project'));

    const { comment } = await project.addComment(REEL, 1, { pin: { ...LOSE, time: 8.654 }, text: 'Land this word harder.' });

    expect(comment).toMatchObject({
      number: 1,
      text: 'Land this word harder.',
      pin: { kind: 'word', version: 1, section: 'sync-problem', shot: '03', time: 8.65, word: 'lose' },
    });
    expect(comment.pin).not.toHaveProperty('x');
    expect((await project.listComments(REEL, 1)).map((c) => c.id)).toEqual([comment.id]);
  });

  it('refuses a wrong time, wrong text, a word from another shot or an unknown shot', async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    const attempt = (pin: object) => project.addComment(REEL, 1, { pin: pin as never, text: 'x' });

    await expect(attempt({ ...LOSE, time: 8.7 })).rejects.toMatchObject({ name: 'KinottaError', code: 'invalid' });
    await expect(attempt({ ...LOSE, word: 'win' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(attempt({ ...LOSE, shot: '04' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(attempt({ ...LOSE, shot: '99' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(attempt({ ...LOSE, time: Number.NaN })).rejects.toMatchObject({ code: 'invalid' });
    expect(existsSync(join(dir, 'reels', '.kinotta', REEL, 'v1.json'))).toBe(false);
  });

  it('refuses a word pin on a reel without a transcript', async () => {
    const project = openProject(copyFixture('showreel-project'));

    await expect(
      project.addComment('product-showreel', 2, { pin: { kind: 'word', shot: '03', time: 3.6, word: 'ICONS' }, text: 'x' }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('numbers word pins in time order among frame pins', async () => {
    const project = openProject(copyFixture('footage-project'));

    await project.addComment(REEL, 1, { pin: { shot: '04', x: 0.5, y: 0.5, element: null }, text: 'frame on 04' });
    await project.addComment(REEL, 1, { pin: LOSE, text: 'word in 03' });
    await project.addComment(REEL, 1, { pin: { shot: '03', x: 0.5, y: 0.5, element: null }, text: 'frame on 03' });
    const { comments } = await project.addComment(REEL, 1, { pin: { kind: 'word', shot: '03', time: 7.3, word: 'last' }, text: 'earlier word' });

    expect(comments.map((c) => [c.number, c.text])).toEqual([
      [1, 'frame on 03'],
      [2, 'earlier word'],
      [3, 'word in 03'],
      [4, 'frame on 04'],
    ]);
  });

  it('puts the word in the batch text and the batch file', async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    await project.addComment(REEL, 1, { pin: LOSE, text: 'Land this word harder.' });
    await project.addComment(REEL, 1, { pin: { shot: '02', x: 0.5, y: 0.25, element: 'conflict-panel' }, text: 'Bigger count.' });

    const { text, file } = await project.copyBatch(REEL, 1);

    expect(text).toContain('1. Shot 02, 03.20s, conflict-panel: Bigger count.');
    expect(text).toContain('2. Shot 03, 08.65s, word “lose”: Land this word harder.');
    const saved = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { comments: Array<Record<string, unknown>> };
    expect(saved.comments[1]).toEqual({ number: 2, shot: '03', time: 8.65, word: 'lose', element: null, text: 'Land this word harder.' });
    expect(saved.comments[0]).not.toHaveProperty('word');
  });

  it('is refused on a version that is not the newest', async () => {
    const dir = copyFixture('footage-project');
    const reelDir = join(dir, 'reels', REEL);
    cpSync(join(reelDir, 'v1'), join(reelDir, 'v2'), { recursive: true });

    await expect(openProject(dir).addComment(REEL, 1, { pin: LOSE, text: 'Too late.' })).rejects.toMatchObject({ code: 'frozen' });
  });
});
