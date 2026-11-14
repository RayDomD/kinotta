import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

it('moves and trims code scenes freely, preserves sound, and reopens saved timing and storyboard names', async () => {
  const dir = copyFixture('showreel-project');
  const project = openProject(dir);
  const reel = 'product-showreel';
  const original = readFileSync(join(dir, 'reels', reel, 'v2/index.html'), 'utf8');
  writeFileSync(join(dir, 'reels', reel, 'v2/sound.wav'), 'frozen sound bytes');
  expect((await project.readVersion(reel, 2)).clips).toContainEqual(expect.objectContaining({ id: 'cta', title: 'Call to action', in: 12.2, out: 15 }));
  await project.addOperation(reel, { kind: 'placement-add', source: { id: 'sound', kind: 'audio', path: 'sound.wav', duration: 2 }, placement: { id: 'sound', role: 'audio', source: 'sound', at: 1, in: 0, out: 2 } });
  await project.addOperation(reel, { kind: 'clip-slide', clip: 'cta', delta: 4 });
  await project.addOperation(reel, { kind: 'clip-slide', clip: 'cube-lands', delta: 2 });
  await project.addOperation(reel, { kind: 'clip-trim', clip: 'cube-lands', in: 2, out: 3 });
  expect((await project.undoEdit(reel)).operations).toHaveLength(3);
  expect((await project.redoEdit(reel)).operations).toHaveLength(4);
  await project.freezeEdits(reel);
  const saved = await openProject(dir).readVersion(reel, 3);
  expect(saved.duration).toBe(19);
  expect(saved.media?.placements).toContainEqual(expect.objectContaining({ id: 'sound', at: 1, in: 0, out: 2 }));
  expect(saved.clips).toContainEqual(expect.objectContaining({ id: 'cta', title: 'Call to action', in: 16.2, out: 19 }));
  expect(saved.clips).toContainEqual(expect.objectContaining({ id: 'cube-lands', title: 'Cube lands', in: 2, out: 3 }));
  expect(saved.shots.find((shot) => shot.number === '01')?.start).toBe(2);
  expect(saved.issues).toEqual([]);
  expect(readFileSync(join(dir, 'reels', reel, 'v2/index.html'), 'utf8')).toBe(original);
  expect(readFileSync(join(dir, 'reels', reel, 'v3/index.html'), 'utf8')).toContain('data-start="16.2" data-duration="2.8"');
  await expect(project.addOperation(reel, { kind: 'clip-slide', clip: 'cta', delta: -20 })).rejects.toMatchObject({ code: 'invalid' });
});

it('keeps a still at the same moment of its shot and changes only timing in the saved page', async () => {
  const dir = copyFixture('showreel-project');
  const reel = 'product-showreel';
  const version = join(dir, 'reels', reel, 'v2');
  // The stills of shots 01 and 06 are drawn late in their scenes, as a page with entrances has them.
  const shots = JSON.parse(readFileSync(join(version, 'shots.json'), 'utf8')) as { shots: { number: string; start: number }[] };
  shots.shots.find((shot) => shot.number === '01')!.start = 1.5;
  shots.shots.find((shot) => shot.number === '06')!.start = 14.5;
  writeFileSync(join(version, 'shots.json'), JSON.stringify(shots));
  const original = readFileSync(join(version, 'index.html'), 'utf8');
  const project = openProject(dir);
  await project.addOperation(reel, { kind: 'clip-slide', clip: 'cta', delta: -1 });
  await project.addOperation(reel, { kind: 'clip-trim', clip: 'cube-lands', in: 0, out: 1 });
  await project.freezeEdits(reel);
  const saved = await openProject(dir).readVersion(reel, 3);
  const start = (number: string) => saved.shots.find((shot) => shot.number === number)?.start;
  expect(start('06')).toBeCloseTo(13.5, 6);
  // Trimmed past its still, the shot keeps the still's distance from its end.
  expect(start('01')).toBeCloseTo(0.7, 6);
  expect(start('02')).toBe(1.8);
  expect(saved.issues).toEqual([]);
  const expected = original
    .replace('data-scene="cube-lands" data-start="0" data-duration="1.8"', 'data-scene="cube-lands" data-start="0" data-duration="1"')
    .replace('data-scene="cta" data-start="12.2" data-duration="2.8"', 'data-scene="cta" data-start="11.2" data-duration="2.8"');
  expect(expected).not.toBe(original);
  expect(readFileSync(join(dir, 'reels', reel, 'v3/index.html'), 'utf8')).toBe(expected);
});
