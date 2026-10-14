import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { partsFixture } from '../helpers/parts.ts';
import { copyFixture } from '../helpers/project.ts';

describe('parts manifests', () => {
  it('reads contract 2 shots by fixed name and revision with starts computed from play order', async () => {
    const { dir, manifest } = partsFixture();
    const version = await openProject(dir).readVersion('parts', 1);
    expect(version.issues).toEqual([]);
    expect(version.parts).toEqual(manifest);
    expect(version.shots.map((shot) => [shot.number, shot.name, shot.scene, shot.revision, shot.start, shot.duration])).toEqual([
      ['01', 'hook', 'hook', 'r1', 0, 1], ['02', 'proof', 'proof', 'r1', 1, 1], ['03', 'close', 'close', 'r1', 2, 1],
    ]);
    expect(version.clips?.map((clip) => clip.title)).toEqual(['hook', 'proof', 'close']);
  });

  it.each([
    ['shared revision', (manifest: Record<string, any>) => { manifest.shared = '../r1'; }, 'parts-shared'],
    ['shot revision', (manifest: Record<string, any>) => { manifest.shots[0].revision = 'r0'; }, 'parts-revision'],
    ['duplicate name', (manifest: Record<string, any>) => { manifest.shots[1].name = 'hook'; }, 'duplicate-shot'],
    ['case-colliding name', (manifest: Record<string, any>) => { manifest.shots[1].name = 'HOOK'; }, 'duplicate-shot'],
    ['reserved folder name', (manifest: Record<string, any>) => { manifest.shots[0].name = 'CON'; }, 'parts-name'],
    ['unsafe name', (manifest: Record<string, any>) => { manifest.shots[0].name = '../hook'; }, 'parts-name'],
    ['zero duration', (manifest: Record<string, any>) => { manifest.shots[0].duration = 0; }, 'parts-duration'],
    ['total duration', (manifest: Record<string, any>) => { manifest.duration = 7; }, 'parts-duration'],
    ['stored start', (manifest: Record<string, any>) => { manifest.shots[1].start = 42; }, 'parts-start'],
    ['missing title', (manifest: Record<string, any>) => { manifest.shots[0].title = ''; }, 'shot-field'],
  ])('reports invalid %s while the version still opens', async (_name, change, code) => {
    const { dir, reelDir, manifest } = partsFixture();
    change(manifest);
    writeFileSync(join(reelDir, 'v1', 'shots.json'), JSON.stringify(manifest));
    expect((await openProject(dir).readVersion('parts', 1)).issues.map((issue) => issue.code)).toContain(code);
  });

  it('preserves fractional shot durations in the running sum without cumulative rounding', async () => {
    const { dir, reelDir, manifest } = partsFixture();
    manifest.duration = 3 / 60;
    for (const shot of manifest.shots) shot.duration = 1 / 60;
    writeFileSync(join(reelDir, 'v1', 'shots.json'), JSON.stringify(manifest));
    writeFileSync(join(reelDir, 'v1', 'index.html'), '<!doctype html>' + manifest.shots.map((shot, index) => `<section data-scene="${shot.name}" data-start="${index / 60}" data-duration="${1 / 60}"><div data-el="label">${shot.title}</div></section>`).join(''));
    const version = await openProject(dir).readVersion('parts', 1);
    expect(version.issues).toEqual([]);
    expect(version.shots.map((shot) => shot.start)).toEqual([0, 1 / 60, 2 / 60]);
  });

  it('leaves existing contract 1 fixture files and reading unchanged', async () => {
    const dir = copyFixture('showreel-project');
    const page = join(dir, 'reels/product-showreel/v2/index.html');
    const before = readFileSync(page);
    const version = await openProject(dir).readVersion('product-showreel', 2);
    expect(version.parts).toBeUndefined();
    expect(version.issues).toEqual([]);
    expect(version.shots[0].number).toBe('01');
    expect(readFileSync(page)).toEqual(before);
  });
});
