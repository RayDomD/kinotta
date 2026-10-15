import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { partsFixture } from '../helpers/parts.ts';

describe('parts rendering', () => {
  it('renders an explicitly transparent parts page as Overlay through the unchanged engine', { timeout: 120_000 }, async () => {
    const { dir, reelDir, manifest } = partsFixture(3, false);
    const engine = resolve('skill/kinotta/engine/render.js');
    const before = readFileSync(engine);
    const project = openProject(dir, { renderSegments: 1 });
    writeFileSync(join(reelDir, 'shared/r1/shared.css'), 'html,body{margin:0;background:transparent}');
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify({ ...manifest, alpha: true }));
    await project.buildParts('parts');
    const job = await project.renderWorking({ reel: 'parts', preset: 'overlay' });
    const done = await project.whenRendered(job.id);
    expect(done.error).toBeUndefined();
    expect(done.state).toBe('done');
    expect(done.output).toMatch(/\.mov$/);
    expect(readFileSync(engine)).toEqual(before);
  });
  it('renders an assembled three-shot Working Draft through the unchanged engine without freezing', { timeout: 120_000 }, async () => {
    const { dir, reelDir } = partsFixture(3, false);
    const engine = resolve('skill/kinotta/engine/render.js');
    const before = readFileSync(engine);
    const project = openProject(dir, { renderSegments: 1 });
    await project.buildParts('parts');
    const job = await project.renderWorking({ reel: 'parts', preset: 'draft' });
    const done = await project.whenRendered(job.id);
    expect(done.error).toBeUndefined();
    expect(done.state).toBe('done');
    expect(existsSync(resolve(dir, done.output!))).toBe(true);
    expect(existsSync(join(reelDir, 'v2'))).toBe(false);
    expect(readdirSync(reelDir).filter((name) => name.startsWith('.draft-'))).toEqual([]);
    expect(readFileSync(engine)).toEqual(before);
  });
});
