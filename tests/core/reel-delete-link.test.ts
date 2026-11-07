import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { openProject, type Project } from '../../server/core/index.ts';
import { alternatesFixture } from '../helpers/parts.ts';
import { tempDir } from '../helpers/temp.ts';

const projects: Project[] = [];
afterEach(async () => { for (const project of projects.splice(0)) await project.close(); });

/** A junction (no admin rights on Windows) or a directory symlink inside a reel that points outside the project. */
function linkOutside(reelDir: string): { outside: string; secret: string } {
  const outside = tempDir('kinotta-delete-outside-');
  const secret = join(outside, 'keep.txt');
  writeFileSync(secret, 'outside the project');
  mkdirSync(reelDir, { recursive: true });
  symlinkSync(outside, join(reelDir, 'linked-folder'), 'junction');
  return { outside, secret };
}

it('deleteReel never follows a link inside the reel to a folder outside the project', async () => {
  const { dir } = alternatesFixture(true);
  const project = openProject(dir); projects.push(project);
  const { secret } = linkOutside(join(dir, 'reels', 'parts'));
  const outcome = await project.deleteReel('parts', 'someone-else').then(() => 'deleted', (error: Error) => error.message);
  expect(outcome).toMatch(/symbolic links/);
  expect(existsSync(secret)).toBe(true);
  expect(readFileSync(secret, 'utf8')).toBe('outside the project');
});

it('deleteVersion never follows a link inside the version to a folder outside the project', async () => {
  const { dir, reelDir } = alternatesFixture();
  const project = openProject(dir); projects.push(project);
  await project.buildParts('parts');
  await project.addOperation('parts', { kind: 'shot-alternate', shot: 'proof', revision: 'r2' });
  await project.freezeEdits('parts');
  // A version an author added that Current is not built on, so only the link guard can stop its deletion.
  cpSync(join(reelDir, 'v2'), join(reelDir, 'v3'), { recursive: true });
  const { secret } = linkOutside(join(reelDir, 'v3'));
  const outcome = await project.deleteVersion('parts', 3).then(() => 'deleted', (error: Error) => error.message);
  expect(outcome).toMatch(/symbolic links/);
  expect(existsSync(join(reelDir, 'v3'))).toBe(true);
  expect(readFileSync(secret, 'utf8')).toBe('outside the project');
});
