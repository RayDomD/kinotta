import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'product-showreel';

const setup = () => {
  const dir = copyFixture('showreel-project');
  return { dir, reelDir: join(dir, 'reels', REEL), project: openProject(dir) };
};
const text = (path: string): string => readFileSync(path, 'utf8');
const move = (scene: string, element: string, x: number, y: number, scale = 1) => ({ kind: 'element-offset' as const, clip: scene, element, x, y, scale });

describe('editing a reel built from code', () => {
  it('takes an element move on a scene of the newest version and lists it', async () => {
    const { project } = setup();

    const list = await project.addOperation(REEL, move('cube-lands', 'cube', 40, -20, 1.5));

    expect(list.operations).toMatchObject([{ kind: 'element-offset', clip: 'cube-lands', element: 'cube', x: 40, y: -20, scale: 1.5 }]);
    expect((await project.readVersion(REEL, 2)).code).toMatchObject({ scenes: expect.arrayContaining(['cube-lands', 'cta']), offsets: {} });
  });

  it('refuses every timing edit, with the reason, and a scene the page does not have', async () => {
    const { project } = setup();

    for (const op of [{ kind: 'snip' as const, from: 1, to: 2 }, { kind: 'cut' as const, at: 3 }, { kind: 'clip-slide' as const, clip: 'cta', delta: 1 }, { kind: 'caption-position' as const, x: 1, y: 1 }]) {
      await expect(project.addOperation(REEL, op)).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('only elements can be moved') });
    }
    await expect(project.addOperation(REEL, move('no-such-scene', 'cube', 1, 1))).rejects.toMatchObject({ code: 'invalid' });
    expect((await project.readEditList(REEL)).operations).toHaveLength(0);
  });

  it('saves v<n+1> as a copy of v<n> plus kinotta-edits.css, linked from the page, built by you', async () => {
    const { reelDir, project } = setup();
    await project.addOperation(REEL, move('cube-lands', 'cube', 40, -20, 1.5));
    await project.addOperation(REEL, move('cta', '@clip', 0, 12));

    const saved = await project.saveEdits(REEL);

    expect(saved).toEqual({ version: 3 });
    expect(readdirSync(join(reelDir, 'v3')).sort()).toEqual(['edits.json', 'index.html', 'kinotta-edits.css', 'shots.json']);
    expect(text(join(reelDir, 'v3', 'kinotta-edits.css'))).toContain('[data-scene="cube-lands"] [data-el="cube"] { translate: 40px -20px; scale: 1.5; }');
    // The scene root is the scene's own selector, with no element part.
    expect(text(join(reelDir, 'v3', 'kinotta-edits.css'))).toContain('[data-scene="cta"] { translate: 0px 12px; }');
    // The page is v2's with one stylesheet link added; everything else is as it was.
    const page = text(join(reelDir, 'v3', 'index.html'));
    expect(page).toContain('<link rel="stylesheet" href="kinotta-edits.css">');
    expect(page.replace('<link rel="stylesheet" href="kinotta-edits.css">\n', '')).toBe(text(join(reelDir, 'v2', 'index.html')));
    expect(JSON.parse(text(join(reelDir, 'v3', 'edits.json')))).toMatchObject({ base: 2, operations: [{ element: 'cube' }, { element: '@clip' }] });
    expect(JSON.parse(text(join(reelDir, 'v3', 'shots.json')))).toMatchObject({ builtBy: 'you', changedSections: expect.any(Array) });
    // v2 is untouched, no stage is left behind and the list is gone.
    expect(existsSync(join(reelDir, 'v2', 'kinotta-edits.css'))).toBe(false);
    expect(existsSync(join(reelDir, '.save'))).toBe(false);
    expect((await project.readEditList(REEL)).operations).toHaveLength(0);

    const v3 = await project.readVersion(REEL, 3);
    expect(v3.builtBy).toBe('you');
    expect(v3.code?.offsets).toEqual({ 'cube-lands': { cube: { x: 40, y: -20, scale: 1.5 } }, cta: { '@clip': { x: 0, y: 12, scale: 1 } } });
    // The claim and the comparison of the two pages agree.
    expect(v3.claimMismatch).toEqual([]);
    expect(v3.changedSections).toHaveLength(1);
  });

  it('accumulates: a later Save keeps the offsets already there, and a move of the same element replaces its offset', async () => {
    const { reelDir, project } = setup();
    await project.addOperation(REEL, move('cube-lands', 'cube', 40, -20, 1.5));
    await project.saveEdits(REEL);
    await project.addOperation(REEL, move('logo-lockup', 'wordmark', 5, 6));
    await project.addOperation(REEL, move('cube-lands', 'cube', 10, 0));

    await project.saveEdits(REEL);

    const css = text(join(reelDir, 'v4', 'kinotta-edits.css'));
    expect(css).toContain('[data-scene="logo-lockup"] [data-el="wordmark"] { translate: 5px 6px; }');
    expect(css).toContain('[data-scene="cube-lands"] [data-el="cube"] { translate: 10px 0px; }');
    expect(css).not.toContain('40px');
    expect(text(join(reelDir, 'v4', 'index.html')).match(/kinotta-edits\.css/g)).toHaveLength(1);
    // v3 still holds its own.
    expect(text(join(reelDir, 'v3', 'kinotta-edits.css'))).toContain('40px -20px');
  });

  it('puts an element back home: its rule goes, and a stylesheet with nothing left stays linked and empty', async () => {
    const { reelDir, project } = setup();
    await project.addOperation(REEL, move('cube-lands', 'cube', 40, -20));
    await project.saveEdits(REEL);
    await project.addOperation(REEL, move('cube-lands', 'cube', 0, 0));
    await project.saveEdits(REEL);

    const css = text(join(reelDir, 'v4', 'kinotta-edits.css'));
    expect(css).not.toContain('data-scene');
    expect(text(join(reelDir, 'v4', 'index.html'))).toContain('kinotta-edits.css');
  });

  it('carries unsent comments forward through Save', async () => {
    const { project } = setup();
    await project.addComment(REEL, 2, { pin: { shot: '03', x: 0.5, y: 0.5, element: 'icons-word' }, text: 'Hold ICONS.' });
    await project.addOperation(REEL, move('cube-lands', 'cube', 40, -20));

    await project.saveEdits(REEL);

    const carried = await project.listComments(REEL, 3);
    expect(carried.map((c) => c.text)).toEqual(['Hold ICONS.']);
    expect(carried[0]!.pin.time).toBe(3.6);
  });

  it('refuses to save with no edits, and leaves nothing when the stage fails', async () => {
    const { reelDir, project } = setup();
    await expect(project.saveEdits(REEL)).rejects.toMatchObject({ code: 'invalid' });
    expect(readdirSync(reelDir).sort()).toEqual(['reel.json', 'v1', 'v2']);
  });
});
