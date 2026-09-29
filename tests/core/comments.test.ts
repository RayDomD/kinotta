import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KinottaError, openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'product-showreel';

function stateFile(dir: string, version = 2): string {
  return join(dir, 'reels', '.kinotta', REEL, `v${version}.json`);
}

describe('comments', () => {
  it('starts empty for a version with no saved comments', async () => {
    const project = openProject(copyFixture('showreel-project'));

    expect(await project.listComments(REEL, 2)).toEqual([]);
  });

  it('saves a pin on a named element with the shot start as its time', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);

    const { comment } = await project.addComment(REEL, 2, {
      pin: { shot: '03', x: 0.5234, y: 0.6116, element: 'icons-word' },
      text: 'Hold ICONS a beat longer.',
    });

    expect(comment).toMatchObject({
      number: 1,
      text: 'Hold ICONS a beat longer.',
      pin: { kind: 'frame', version: 2, section: null, shot: '03', time: 3.6, x: 0.523, y: 0.612, element: 'icons-word' },
    });
    expect(comment.id).toBeTruthy();
    expect(Number.isNaN(Date.parse(comment.createdAt))).toBe(false);
  });

  it('saves a position-only pin with no element', async () => {
    const project = openProject(copyFixture('showreel-project'));

    const { comment } = await project.addComment(REEL, 2, { pin: { shot: '06', x: 0.1, y: 0.2, element: null }, text: 'Too empty here.' });

    expect(comment.pin).toMatchObject({ shot: '06', time: 12.2, x: 0.1, y: 0.2, element: null });
  });

  it('persists to the editor state folder and writes nothing under the version folder', async () => {
    const dir = copyFixture('showreel-project');
    const versionDir = join(dir, 'reels', REEL, 'v2');
    const before = readdirSync(versionDir).sort();

    const { comment } = await openProject(dir).addComment(REEL, 2, {
      pin: { shot: '03', x: 0.5, y: 0.5, element: 'icons-word' },
      text: 'Hold ICONS.',
    });

    const saved = JSON.parse(readFileSync(stateFile(dir), 'utf8')) as { comments: unknown[]; note: string };
    expect(saved.note).toBe('');
    expect(saved.comments).toEqual([
      { id: comment.id, pin: comment.pin, text: 'Hold ICONS.', createdAt: comment.createdAt },
    ]);
    expect(readdirSync(versionDir).sort()).toEqual(before);
    expect(readdirSync(join(dir, 'reels', '.kinotta', REEL))).toEqual(['v2.json']);
  });

  it('keeps comments when the project is opened again', async () => {
    const dir = copyFixture('showreel-project');
    await openProject(dir).addComment(REEL, 2, { pin: { shot: '03', x: 0.5, y: 0.5, element: 'icons-word' }, text: 'Hold ICONS.' });

    const reopened = await openProject(dir).listComments(REEL, 2);

    expect(reopened.map((c) => [c.number, c.pin.shot, c.pin.element, c.text])).toEqual([[1, '03', 'icons-word', 'Hold ICONS.']]);
  });

  it('keeps versions apart', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    await project.addComment(REEL, 2, { pin: { shot: '01', x: 0.5, y: 0.5, element: null }, text: 'On v2.' });

    expect(await project.listComments(REEL, 1)).toEqual([]);
    expect(existsSync(stateFile(dir, 1))).toBe(false);
  });

  it('numbers comments by shot start, then by creation, renumbering as pins are added earlier', async () => {
    const project = openProject(copyFixture('showreel-project'));
    const add = (shot: string, text: string) => project.addComment(REEL, 2, { pin: { shot, x: 0.5, y: 0.5, element: null }, text });

    await add('05', 'late');
    await add('02', 'first of two');
    await add('02', 'second of two');
    const { comments } = await add('01', 'earliest');

    expect(comments.map((c) => [c.number, c.pin.shot, c.text])).toEqual([
      [1, '01', 'earliest'],
      [2, '02', 'first of two'],
      [3, '02', 'second of two'],
      [4, '05', 'late'],
    ]);
    expect((await project.listComments(REEL, 2)).map((c) => c.number)).toEqual([1, 2, 3, 4]);
  });

  it('refuses empty or whitespace text and saves nothing', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);

    for (const text of ['', '   ', '\n\t']) {
      await expect(project.addComment(REEL, 2, { pin: { shot: '03', x: 0.5, y: 0.5, element: null }, text })).rejects.toMatchObject({
        name: 'KinottaError',
        code: 'invalid',
      });
    }
    expect(existsSync(stateFile(dir))).toBe(false);
  });

  it('refuses an unknown shot, an out-of-frame position and an unknown reel or version', async () => {
    const project = openProject(copyFixture('showreel-project'));
    const pin = { shot: '03', x: 0.5, y: 0.5, element: null };

    await expect(project.addComment(REEL, 2, { pin: { ...pin, shot: '99' }, text: 'x' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(project.addComment(REEL, 2, { pin: { ...pin, x: 1.5 }, text: 'x' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(project.addComment(REEL, 2, { pin: { ...pin, y: Number.NaN }, text: 'x' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(project.addComment('nope', 2, { pin, text: 'x' })).rejects.toBeInstanceOf(KinottaError);
    await expect(project.addComment(REEL, 9, { pin, text: 'x' })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('keeps every comment when several are added at once', async () => {
    const project = openProject(copyFixture('showreel-project'));

    await Promise.all(
      ['a', 'b', 'c', 'd'].map((text) => project.addComment(REEL, 2, { pin: { shot: '03', x: 0.5, y: 0.5, element: null }, text })),
    );

    expect(await project.listComments(REEL, 2)).toHaveLength(4);
  });
});
