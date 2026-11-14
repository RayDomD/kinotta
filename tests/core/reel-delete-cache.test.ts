import { createHash } from 'node:crypto';
import { createReadStream, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { openProject, type Project } from '../../server/core/index.ts';
import { alternatesFixture } from '../helpers/parts.ts';
import { emptyProject } from '../helpers/project.ts';

const projects: Project[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const project of projects.splice(0)) await project.close(); });
function put(file: string, content = 'fixture'): void { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, content); }
function tree(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      result[`${entry.name}/`] = '';
      for (const [name, bytes] of Object.entries(tree(join(dir, entry.name)))) result[`${entry.name}/${name}`] = bytes;
    } else result[entry.name] = readFileSync(join(dir, entry.name)).toString('base64');
  }
  return result;
}
const sourceBytes = 'source used only by a saved version';
const hash = createHash('sha256').update(sourceBytes).digest('hex');
function savedSource(versionDir: string): void {
  put(join(versionDir, 'media', 'source.png'), sourceBytes);
  put(join(versionDir, 'media.json'), JSON.stringify({ media: { sources: [{ id: 'saved', kind: 'image', path: 'media/source.png', contentHash: hash }], sequence: [], placements: [], tracks: [] } }));
}
function caches(dir: string): string[] {
  const files = [join(dir, 'footage', '.playback', `sha256-${hash}.mp4`), join(dir, 'reels', '.kinotta', 'stills', hash, '0-160.jpg')];
  for (const file of files) put(file);
  return files;
}

it('refuses the open reel without removing any of its files', async () => {
  const { dir } = alternatesFixture(true);
  const project = openProject(dir); projects.push(project);
  const before = tree(dir);
  await expect(project.deleteReel('parts', 'parts')).rejects.toMatchObject({ code: 'frozen', message: expect.stringMatching(/open reel/i) });
  expect(tree(dir)).toEqual(before);
});

it('deletes a complete reel back to the post-import baseline and leaves KINOTTA_HOME, TEMP and TMP unchanged', { timeout: 30_000 }, async () => {
  const dir = emptyProject();
  const project = openProject(dir); projects.push(project);
  const footage = resolve('tests/fixtures/projects/footage-project/media/talk.mp4');
  const footageHash = createHash('sha256').update(readFileSync(footage)).digest('hex');
  // Existing footage caches avoid launching background encoders during this deletion test.
  put(join(dir, 'footage', '.proxy', `sha256-${footageHash}.mp4`));
  put(join(dir, 'footage', '.audio', `sha256-${footageHash}.wav`));
  await project.importVideo('talk.mp4', createReadStream(footage));
  put(join(dir, 'footage', '.transcripts', `${footageHash}.json`), '{}');
  put(join(dir, 'footage', '.waveforms', `${footageHash}.json`), '{}');
  put(join(dir, 'reels', '.kinotta', 'effects-box.json'), '[]');
  const baseline = tree(dir);
  const sandboxes = [emptyProject(), emptyProject(), emptyProject()];
  for (const [index, name] of ['KINOTTA_HOME', 'TEMP', 'TMP'].entries()) vi.stubEnv(name, sandboxes[index]);
  const beforeOutside = sandboxes.map(tree);

  const fixture = alternatesFixture();
  cpSync(fixture.reelDir, join(dir, 'reels', 'parts'), { recursive: true });
  await project.buildParts('parts');
  await project.addOperation('parts', { kind: 'shot-alternate', shot: 'proof', revision: 'r2' });
  await project.freezeEdits('parts');
  await project.addComment('parts', 2, { pin: { shot: '01', x: 0.2, y: 0.3, element: 'document' }, text: 'Stored comment' });
  await project.setNote('parts', 2, 'Stored note');
  savedSource(join(dir, 'reels', 'parts', 'v2'));
  put(join(dir, 'reels', 'parts', 'renders', 'parts-v2-draft-test.mp4'));
  put(join(dir, 'output', 'parts', 'parts-v2-final-test.mp4'));
  put(join(dir, 'output', 'parts', 'parts-v1-overlay-test.mov'));
  caches(dir);

  await project.deleteReel('parts', 'another-open-reel');

  expect(tree(dir)).toEqual(baseline);
  expect(sandboxes.map(tree)).toEqual(beforeOutside);
});

it('keeps both content caches while another saved version still uses their source', async () => {
  const { dir, reelDir } = alternatesFixture(true);
  savedSource(join(reelDir, 'v1'));
  cpSync(reelDir, join(dir, 'reels', 'other'), { recursive: true });
  const files = caches(dir);
  const project = openProject(dir); projects.push(project);

  await project.deleteReel('parts', 'other');

  expect(files.map(existsSync)).toEqual([true, true]);
  expect(await project.mediaFile('saved', { reel: 'other', version: 1 }, true)).toBe(join(dir, 'reels', 'other', 'v1', 'media', 'source.png'));
});

it('sweeps version-only content caches when deleting a version and retains caches for project footage', async () => {
  const { dir, reelDir } = alternatesFixture(true);
  for (const number of [2, 3]) cpSync(join(reelDir, 'v1'), join(reelDir, `v${number}`), { recursive: true });
  savedSource(join(reelDir, 'v2'));
  const files = caches(dir);
  const project = openProject(dir); projects.push(project);
  await project.deleteVersion('parts', 2);
  expect(files.map(existsSync)).toEqual([false, false]);
  // Recreate an independently authored version; the same bytes now also belong to project footage.
  cpSync(join(reelDir, 'v1'), join(reelDir, 'v4'), { recursive: true });
  savedSource(join(reelDir, 'v3'));
  put(join(dir, 'footage', 'retained.png'), sourceBytes);
  caches(dir);
  await project.deleteVersion('parts', 3);
  expect(files.map(existsSync)).toEqual([true, true]);
});
