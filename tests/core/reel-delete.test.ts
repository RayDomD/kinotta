import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openProject, type Project } from '../../server/core/index.ts';
import { alternatesFixture } from '../helpers/parts.ts';

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

describe('deleting saved versions', () => {
  it('removes only that version, its comments and both render locations; survivors load and numbering never repeats', { timeout: 30_000 }, async () => {
    const { dir, reelDir } = alternatesFixture();
    const project = open(dir);
    await project.buildParts('parts');
    await project.addOperation('parts', { kind: 'shot-alternate', shot: 'proof', revision: 'r2' });
    await project.freezeEdits('parts');
    // An authored version arrived, but Working has not replayed onto it.
    cpSync(join(reelDir, 'v2'), join(reelDir, 'v3'), { recursive: true });
    await project.addComment('parts', 3, { pin: { shot: '01', x: 0.2, y: 0.3, element: 'document' }, text: 'Delete this version too.' });
    const deleted = [join(reelDir, 'v3'), join(reelDir, '.kinotta', 'v3.json'), join(reelDir, 'renders', 'parts-v3-draft-test.mp4'), join(dir, 'output', 'parts', 'parts-v3-final-test.mp4')];
    put(deleted[2]); put(deleted[3]);
    put(join(reelDir, 'renders', 'parts-v2-draft-keep.mp4'));
    put(join(dir, 'output', 'parts', 'parts-v2-overlay-keep.mov'));

    await project.deleteVersion('parts', 3);

    expect(deleted.map(existsSync)).toEqual([false, false, false, false]);
    expect(readdirSync(join(reelDir, 'renders'))).toEqual(['parts-v2-draft-keep.mp4']);
    expect(readdirSync(join(dir, 'output', 'parts'))).toEqual(['parts-v2-overlay-keep.mov']);
    expect((await project.readWorkingVersion('parts')).workingBase).toBe(2);
    expect((await project.alternatePage('parts', 2, 'proof', 'r1'))).toContain('data-scene="proof"');
    for (const number of [1, 2]) {
      const checked = spawnSync(process.execPath, [resolve('bin/kinotta.mjs'), 'check', 'parts', String(number)], { cwd: dir, encoding: 'utf8', timeout: 20_000 });
      expect({ status: checked.status, stderr: checked.stderr, stdout: checked.stdout }).toMatchObject({ status: 0 });
    }
    await project.addOperation('parts', { kind: 'shot-alternate', shot: 'proof', revision: 'r3' });
    expect(await project.freezeEdits('parts')).toMatchObject({ version: 4 });
    expect(JSON.parse(readFileSync(join(reelDir, 'reel.json'), 'utf8')).title).toBe('Parts fixture');
  });
});
