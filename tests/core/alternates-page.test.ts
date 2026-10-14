import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject, scanPage } from '../../server/core/index.ts';
import { startServer } from '../../server/main.ts';
import { alternatesFixture } from '../helpers/parts.ts';

describe('alternate pages', () => {
  it('refuses an invalid offered revision even when it is not the alternate in the reel', async () => {
    const { dir, reelDir } = alternatesFixture();
    writeFileSync(join(reelDir, 'shots/proof/r2/shot.css'), 'body { color: red; }');
    await expect(openProject(dir).buildParts('parts')).rejects.toThrow(/proof.*CSS.*scope/);
  });
  it('assembles one revision override with its duration and later starts without mutating the manifest', async () => {
    const { dir, manifest } = alternatesFixture();
    const project = openProject(dir);
    await project.buildParts('parts');
    const page = await project.alternatePage('parts', 1, 'proof', 'r2');
    expect(page).toContain('Proof 2');
    expect(page).toContain('data-revision="r2"');
    expect(scanPage(page).scenes.map((scene) => [scene.name, scene.start, scene.duration])).toEqual([['hook', 0, 1], ['proof', 1, 2], ['close', 3, 1]]);
    expect(manifest.duration).toBe(3);
    expect((await project.readVersion('parts', 1)).shots[1].revision).toBe('r1');
    expect(await project.alternatePage('parts', 1, 'proof', 'r2')).toBe(page);
  });

  it('serves a page keyed by version, shot name and revision, retaining the frozen page and offsets', async () => {
    const { dir, reelDir } = alternatesFixture();
    const server = await startServer({ projectDir: dir, port: 0 });
    try {
      await server.project.buildParts('parts');
      const before = readFileSync(join(reelDir, 'v1/index.html'));
      const url = `${server.url}/reels/parts/v1/alternate.html?shot=proof&revision=r3`;
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('Proof 3');
      expect(readFileSync(join(reelDir, 'v1/index.html'))).toEqual(before);
      await expect(server.project.alternatePage('parts', 1, 'proof', 'r99')).rejects.toThrow('alternate');
      expect((await fetch(`${server.url}/reels/parts/v1/alternate.html?shot=../proof&revision=r3`)).status).toBe(422);
    } finally { await server.close(); }
  });
});
