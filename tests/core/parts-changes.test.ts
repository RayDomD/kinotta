import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { partsFixture } from '../helpers/parts.ts';

describe('parts change detection', () => {
  it('reports a new shared revision as changing every section even when its bytes match', async () => {
    const { dir, reelDir, manifest } = partsFixture(3, false);
    const sections = manifest.shots.map((shot, index) => ({ id: shot.name, name: shot.title, start: index, end: index + 1 }));
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify({ ...manifest, sections }));
    const project = openProject(dir);
    await project.buildParts('parts');
    mkdirSync(join(reelDir, 'shared/r2'));
    writeFileSync(join(reelDir, 'shared/r2/shared.css'), readFileSync(join(reelDir, 'shared/r1/shared.css')));
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify({ ...manifest, shared: 'r2', sections }));
    await project.buildParts('parts');
    expect((await project.readVersion('parts', 2)).changedSections).toEqual(['hook', 'proof', 'close']);
  });

  it('reports a changed shot revision even when its markup matches', async () => {
    const { dir, reelDir, manifest } = partsFixture(3, false);
    const project = openProject(dir);
    await project.buildParts('parts');
    mkdirSync(join(reelDir, 'shots/proof/r2'));
    for (const file of ['shot.html', 'shot.css', 'shot.js']) writeFileSync(join(reelDir, 'shots/proof/r2', file), readFileSync(join(reelDir, 'shots/proof/r1', file)));
    manifest.shots[1].revision = 'r2';
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
    await project.buildParts('parts');
    expect((await project.readVersion('parts', 2)).changedSections).toHaveLength(1);
  });
});
