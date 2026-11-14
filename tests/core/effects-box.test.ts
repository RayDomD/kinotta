import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { emptyProject } from '../helpers/project.ts';

it('effects box: empty for a new project, saved per project in order, unknown ids dropped', async () => {
  const dir = emptyProject();
  const project = openProject(dir);
  expect(await project.effectsBox()).toEqual([]);

  expect(await project.saveEffectsBox(['big-word', 'title-card', 'big-word'])).toEqual(['big-word', 'title-card']);
  expect(await project.effectsBox()).toEqual(['big-word', 'title-card']);
  expect(JSON.parse(await readFile(join(dir, 'reels/.kinotta/effects-box.json'), 'utf8'))).toEqual(['big-word', 'title-card']);

  // A second handle on the same folder reads the same box: it lives with the project, not the browser.
  expect(await openProject(dir).effectsBox()).toEqual(['big-word', 'title-card']);

  // Ids that left the catalogue are dropped on save and on read.
  expect(await project.saveEffectsBox(['title-card', 'no-such-effect'])).toEqual(['title-card']);
  await mkdir(join(dir, 'reels/.kinotta'), { recursive: true });
  await writeFile(join(dir, 'reels/.kinotta/effects-box.json'), JSON.stringify(['gone', 'big-word']));
  expect(await project.effectsBox()).toEqual(['big-word']);

  await expect(project.saveEffectsBox('big-word' as unknown as string[])).rejects.toThrow();
  await expect(project.saveEffectsBox([1] as unknown as string[])).rejects.toThrow();
});
