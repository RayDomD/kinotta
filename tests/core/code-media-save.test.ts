import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

it('adds sound to an authored page and saves a frozen sidecar without rebuilding its graphics', async () => {
  const dir = copyFixture('showreel-project');
  const reel = join(dir, 'reels/product-showreel');
  const file = join(dir, 'sound.wav');
  const run = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', file], { encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
  const project = openProject(dir);
  const before = await project.readVersion('product-showreel', 2);
  const page = readFileSync(join(reel, 'v2/index.html'), 'utf8');
  const original = readFileSync(file);
  await project.addOperation('product-showreel', { kind: 'placement-add', source: { id: 'sound', kind: 'audio', path: '../../../sound.wav', duration: 2 }, placement: { id: 'sound-use', role: 'audio', source: 'sound', at: 1, in: 0, out: 2, gain: 0.5 } });
  expect(await project.saveEdits('product-showreel')).toEqual({ version: 3 });
  const saved = await project.readVersion('product-showreel', 3);
  expect(saved.media!.tracks).toEqual([{ id: 'track:sound-use', name: 'sound', order: 0, gain: 1, mute: false }]);
  expect(saved.media!.placements[0]).toMatchObject({ track: 'track:sound-use' });
  expect(saved.duration).toBe(before.duration);
  expect(saved.code?.scenes).toEqual(before.code?.scenes);
  expect(readFileSync(join(reel, 'v3/index.html'), 'utf8')).toBe(page);
  expect(readFileSync(resolve(reel, 'v3', saved.media!.sources[0]!.path))).toEqual(original);
  expect(readdirSync(reel)).not.toContain('plan.json');
  writeFileSync(file, 'changed original');
  await project.addOperation('product-showreel', { kind: 'placement-change', placement: 'sound-use', changes: { gain: 0.25 } });
  expect(await project.saveEdits('product-showreel')).toEqual({ version: 4 });
  expect((await project.readVersion('product-showreel', 4)).media!.placements[0]).toMatchObject({ gain: 0.25 });
  expect((await project.readVersion('product-showreel', 3)).media!.placements[0]).toMatchObject({ gain: 0.5 });
  expect((await openProject(dir).readEditList('product-showreel')).operations).toEqual([]);
});

it('persists owner track controls through reopen, Undo, Redo and a new frozen code version', async () => {
  const dir = copyFixture('showreel-project');
  const reel = join(dir, 'reels/product-showreel');
  const project = openProject(dir);
  const before = readFileSync(join(reel, 'v2/index.html'), 'utf8');
  await project.addOperation('product-showreel', { kind: 'track-add', track: { id: 'music', name: 'Music', order: 0, gain: 1, mute: false } });
  await project.addOperation('product-showreel', { kind: 'track-change', track: 'music', changes: { name: 'Theme', gain: 0.5, mute: true } });
  const reopened = openProject(dir);
  expect((await reopened.readEditList('product-showreel')).operations).toHaveLength(2);
  expect((await reopened.undoEdit('product-showreel')).operations).toHaveLength(1);
  expect((await reopened.redoEdit('product-showreel')).operations).toHaveLength(2);
  expect(await reopened.saveEdits('product-showreel')).toEqual({ version: 3 });
  expect((await reopened.readVersion('product-showreel', 3)).media!.tracks).toEqual([{ id: 'music', name: 'Theme', order: 0, gain: 0.5, mute: true }]);
  expect(readFileSync(join(reel, 'v2/index.html'), 'utf8')).toBe(before);
  expect(readFileSync(join(reel, 'v3/index.html'), 'utf8')).toBe(before);
});

it('freezes page files outside the version folder on a code-only Save, and refuses an external one (AM33)', async () => {
  const dir = copyFixture('showreel-project');
  const reel = join(dir, 'reels/product-showreel');
  mkdirSync(join(dir, 'shared'), { recursive: true });
  writeFileSync(join(dir, 'shared/logo.png'), 'original logo');
  writeFileSync(join(dir, 'shared/brand.css'), '.brand{background:url(logo.png)}');
  const page = readFileSync(join(reel, 'v2/index.html'), 'utf8');
  writeFileSync(join(reel, 'v2/index.html'), page.replace('</head>', '<link rel="stylesheet" href="../../../shared/brand.css"></head>').replace('</body>', '<img class="brand" src="../../../shared/logo.png" alt=""></body>'));
  const project = openProject(dir);
  const move = { kind: 'element-offset' as const, clip: 'cube-lands', element: 'cube', x: 4, y: 0, scale: 1 };
  await project.addOperation('product-showreel', move);
  expect(await project.saveEdits('product-showreel')).toEqual({ version: 3 });
  const saved = readFileSync(join(reel, 'v3/index.html'), 'utf8');
  expect(saved).not.toContain('../../../shared/');
  const frozen = readdirSync(join(reel, 'v3/dependencies'));
  const logo = frozen.find((name) => name.endsWith('logo.png'))!;
  const css = frozen.find((name) => name.endsWith('brand.css'))!;
  expect(saved).toContain(`src="dependencies/${logo}"`);
  expect(saved).toContain(`href="dependencies/${css}"`);
  expect(readFileSync(join(reel, 'v3/dependencies', css), 'utf8')).toContain(logo);
  writeFileSync(join(dir, 'shared/logo.png'), 'changed logo');
  expect(readFileSync(join(reel, 'v3/dependencies', logo), 'utf8')).toBe('original logo');
  // The page's own files inside the version folder were already copied with it and keep their paths.
  expect((await project.readVersion('product-showreel', 3)).issues).toEqual([]);

  writeFileSync(join(reel, 'v3/index.html'), saved.replace('</head>', '<link rel="stylesheet" href="https://fonts.example.com/brand.css"></head>'));
  await project.addOperation('product-showreel', { ...move, x: 8 });
  await expect(project.saveEdits('product-showreel')).rejects.toThrow('cannot be frozen');
  expect((await project.listVersions('product-showreel')).map((v) => v.number)).toEqual([1, 2, 3]);
  expect((await project.readEditList('product-showreel')).operations).toHaveLength(1);
});
