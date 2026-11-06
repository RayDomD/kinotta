import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openProject, type Project } from '../../server/core/index.ts';
import { alternatesFixture } from '../helpers/parts.ts';
import { copyFixture } from '../helpers/project.ts';

const projects: Project[] = [];
afterEach(async () => { for (const project of projects.splice(0)) await project.close(); });
function open(dir: string): Project {
  const project = openProject(dir);
  projects.push(project);
  return project;
}
function put(file: string, text = 'fixture'): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}
function tree(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (folder: string, prefix: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { result[`${path}/`] = ''; walk(join(folder, entry.name), path); }
      else result[path] = readFileSync(join(folder, entry.name)).toString('base64');
    }
  };
  walk(dir, '');
  return result;
}

describe('deleting saved versions', () => {
  it('matches render versions after the exact reel slug, even when the slug contains version-like text', async () => {
    const { dir, reelDir } = alternatesFixture(true);
    const slug = 'ad-v9-draft-cut';
    const target = join(dir, 'reels', slug);
    cpSync(reelDir, target, { recursive: true });
    for (const number of [2, 3]) cpSync(join(target, 'v1'), join(target, `v${number}`), { recursive: true });
    const render = join(dir, 'output', slug, `${slug}-v2-final-test.mp4`);
    put(render);
    const project = open(dir);
    await project.deleteVersion(slug, 2);
    expect(existsSync(render)).toBe(false);
  });
  it('protects a version named by pending Save recovery without replaying or changing the journal', async () => {
    const { dir, reelDir } = alternatesFixture(true);
    cpSync(join(reelDir, 'v1'), join(reelDir, 'v2'), { recursive: true });
    put(join(reelDir, 'save-intent.json'), JSON.stringify({ version: 1, files: [], operations: [], working: { base: 1, operations: [], undo: [], redo: [], flagged: {} } }));
    const project = open(dir);
    const before = tree(dir);
    await expect(project.deleteVersion('parts', 1)).rejects.toMatchObject({ code: 'frozen', message: expect.stringMatching(/Save.*recover/i) });
    expect(tree(dir)).toEqual(before);
  });
  it('refuses a saved media path into another version instead of breaking its original', async () => {
    const { dir, reelDir } = alternatesFixture(true);
    for (const number of [2, 3]) cpSync(join(reelDir, 'v1'), join(reelDir, `v${number}`), { recursive: true });
    put(join(reelDir, 'v1', 'media', 'original.png'));
    put(join(reelDir, 'v2', 'media.json'), JSON.stringify({ media: { sources: [{ path: '../v1/media/original.png' }] } }));
    const project = open(dir);
    const before = tree(dir);
    await expect(project.deleteVersion('parts', 1)).rejects.toMatchObject({ code: 'frozen', message: expect.stringContaining('v2') });
    expect(tree(dir)).toEqual(before);
  });

  it('refuses unreadable Working history before writing metadata or removing files', async () => {
    const { dir, reelDir } = alternatesFixture(true);
    cpSync(join(reelDir, 'v1'), join(reelDir, 'v2'), { recursive: true });
    put(join(reelDir, 'edit-list.json'), '{broken');
    const project = open(dir);
    const before = tree(dir);
    await expect(project.deleteVersion('parts', 1)).rejects.toMatchObject({ code: 'invalid' });
    expect(tree(dir)).toEqual(before);
  });
  it('names every surviving version inheriting the deleted plan and leaves all files unchanged (D1)', async () => {
    const dir = copyFixture('footage-project');
    const reelDir = join(dir, 'reels', 'founder-talk');
    for (const number of [2, 3, 4]) cpSync(join(reelDir, 'v1'), join(reelDir, `v${number}`), { recursive: true });
    cpSync(join(dir, 'motion', 'plan.json'), join(reelDir, 'v1', 'plan.json'));
    const project = open(dir);
    const before = tree(dir);
    await expect(project.deleteVersion('founder-talk', 1)).rejects.toMatchObject({ code: 'frozen', message: expect.stringMatching(/v2.*v3.*inherit/i) });
    expect(tree(dir)).toEqual(before);
  });
  it.each(['edit', 'Redo', 'Undo'] as const)('refuses a version named by an %s entry without changing files', async (history) => {
    const { dir, reelDir } = alternatesFixture();
    const project = open(dir);
    await project.buildParts('parts');
    cpSync(join(reelDir, 'v1'), join(reelDir, 'v2'), { recursive: true });
    await project.addOperation('parts', { kind: 'use-version', version: 1 });
    if (history === 'Redo') await project.undoEdit('parts');
    if (history === 'Undo') await project.addOperation('parts', { kind: 'use-version', version: 2 });
    const before = tree(dir);
    await expect(project.deleteVersion('parts', 1)).rejects.toMatchObject({ code: 'frozen', message: expect.stringMatching(/edit|Redo|Undo/i) });
    expect(tree(dir)).toEqual(before);
  });
  it('refuses the version Current is built on without changing any files', async () => {
    const { dir } = alternatesFixture();
    const project = open(dir);
    await project.buildParts('parts');
    const before = tree(dir);
    await expect(project.deleteVersion('parts', 1)).rejects.toMatchObject({ code: 'frozen', message: expect.stringMatching(/Current.*v1|v1.*Current/) });
    expect(tree(dir)).toEqual(before);
  });
  it('removes only that version, its comments and both render locations; survivors load and numbering never repeats', { timeout: 30_000 }, async () => {
    const { dir, reelDir } = alternatesFixture();
    const project = open(dir);
    await project.buildParts('parts');
    await project.addOperation('parts', { kind: 'shot-alternate', shot: 'proof', revision: 'r2' });
    await project.freezeEdits('parts');
    await project.addComment('parts', 2, { pin: { shot: '01', x: 0.2, y: 0.3, element: 'document' }, text: 'Delete this version too.' });
    // An authored version arrived, but Working has not replayed onto it.
    cpSync(join(reelDir, 'v2'), join(reelDir, 'v3'), { recursive: true });
    cpSync(join(reelDir, '.kinotta', 'v2.json'), join(reelDir, '.kinotta', 'v3.json'));
    const deleted = [join(reelDir, 'v3'), join(reelDir, '.kinotta', 'v3.json'), join(reelDir, 'renders', 'parts-v3-draft-test.mp4'), join(dir, 'output', 'parts', 'parts-v3-final-test.mp4')];
    put(deleted[2]); put(deleted[3]);
    put(join(reelDir, 'renders', 'parts-v2-draft-keep.mp4'));
    put(join(dir, 'output', 'parts', 'parts-v2-overlay-keep.mov'));

    await project.deleteVersion('parts', 3);

    expect(deleted.map(existsSync)).toEqual([false, false, false, false]);
    expect(readdirSync(join(reelDir, 'renders'))).toEqual(['parts-v2-draft-keep.mp4']);
    expect(readdirSync(join(dir, 'output', 'parts'))).toEqual(['parts-v2-overlay-keep.mov']);
    expect((await project.readWorkingVersion('parts')).workingBase).toBe(1);
    expect((await project.alternatePage('parts', 2, 'proof', 'r1'))).toContain('data-scene="proof"');
    for (const number of [1, 2]) {
      const checked = spawnSync(process.execPath, [resolve('bin/kinotta.mjs'), 'check', 'parts', String(number)], { cwd: dir, encoding: 'utf8', timeout: 20_000 });
      expect({ status: checked.status, stderr: checked.stderr, stdout: checked.stdout }).toMatchObject({ status: 0 });
    }
    await project.addOperation('parts', { kind: 'shot-alternate', shot: 'proof', revision: 'r3' });
    expect(await project.freezeEdits('parts')).toMatchObject({ version: 4 });
    expect((await project.listComments('parts', 4)).map((comment) => comment.text)).toContain('Delete this version too.');
    expect(JSON.parse(readFileSync(join(reelDir, 'reel.json'), 'utf8')).title).toBe('Parts fixture');
  });
});
