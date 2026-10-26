import { mkdirSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture, emptyProject, setReelMtime } from '../helpers/project.ts';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, stat: vi.fn(actual.stat) };
});

const OLDER = new Date('2026-01-01T10:00:00Z');
const NEWER = new Date('2026-02-01T10:00:00Z');

describe('listReels', () => {
  it('lists every reel with title, newest version and last change, newest change first', async () => {
    const dir = copyFixture('showreel-project');
    setReelMtime(dir, 'broll-cutdown', OLDER);
    setReelMtime(dir, 'product-showreel', NEWER);

    const listing = await openProject(dir).listReels();

    expect(listing.state).toBe('ok');
    expect(listing.reels).toEqual([
      { slug: 'product-showreel', title: 'Product showreel', newestVersion: 2, lastChange: NEWER.getTime() },
      { slug: 'broll-cutdown', title: 'B-roll cutdown', newestVersion: 1, lastChange: OLDER.getTime() },
    ]);
  });

  it('follows last change, not name', async () => {
    const dir = copyFixture('showreel-project');
    setReelMtime(dir, 'product-showreel', OLDER);
    setReelMtime(dir, 'broll-cutdown', NEWER);

    const listing = await openProject(dir).listReels();

    expect(listing.reels.map((r) => r.slug)).toEqual(['broll-cutdown', 'product-showreel']);
  });

  it('counts a file changed deep inside a reel as a change to that reel', async () => {
    const dir = copyFixture('showreel-project');
    setReelMtime(dir, 'product-showreel', OLDER);
    setReelMtime(dir, 'broll-cutdown', NEWER);
    const touched = join(dir, 'reels', 'product-showreel', 'v2', 'comments.json');
    writeFileSync(touched, '{}');
    const later = new Date('2026-03-01T10:00:00Z');
    utimesSync(touched, later, later);

    const listing = await openProject(dir).listReels();

    expect(listing.reels[0]).toMatchObject({ slug: 'product-showreel', lastChange: later.getTime() });
  });

  it('lists a reel when its only file disappears during the last-change scan', async () => {
    const dir = emptyProject();
    const reelDir = join(dir, 'reels', 'vanishing');
    mkdirSync(reelDir, { recursive: true });
    const temporary = join(reelDir, 'state.json.tmp');
    writeFileSync(temporary, '{}');
    const realStat = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).stat;
    let removed = false;
    const stat = vi.mocked(fs.stat).mockImplementation((...args) => {
      if (String(args[0]) === temporary) {
        unlinkSync(temporary);
        utimesSync(reelDir, NEWER, NEWER);
        removed = true;
      }
      return realStat(...args);
    });
    try {
      const listing = await openProject(dir).listReels();
      expect(removed).toBe(true);
      expect(listing).toEqual({ state: 'ok', reels: [
        { slug: 'vanishing', title: 'vanishing', newestVersion: null, lastChange: NEWER.getTime() },
      ] });
    } finally { stat.mockImplementation(realStat); }
  });

  it('surfaces file-stat errors other than a disappearing file', async () => {
    const dir = emptyProject();
    const reelDir = join(dir, 'reels', 'unreadable');
    mkdirSync(reelDir, { recursive: true });
    writeFileSync(join(reelDir, 'state.json'), '{}');
    const failure = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    vi.mocked(fs.stat).mockRejectedValueOnce(failure);
    await expect(openProject(dir).listReels()).rejects.toBe(failure);
  });

  it('falls back to the folder name when reel.json is missing or has no title', async () => {
    const dir = emptyProject();
    mkdirSync(join(dir, 'reels', 'no-json', 'v1'), { recursive: true });
    mkdirSync(join(dir, 'reels', 'bad-json', 'v3'), { recursive: true });
    writeFileSync(join(dir, 'reels', 'bad-json', 'reel.json'), '{ not json');

    const listing = await openProject(dir).listReels();

    expect(listing.reels.map((r) => [r.slug, r.title, r.newestVersion]).sort()).toEqual([
      ['bad-json', 'bad-json', 3],
      ['no-json', 'no-json', 1],
    ]);
  });

  it('ignores dot folders such as .kinotta and loose files like brand.md', async () => {
    const dir = copyFixture('showreel-project');
    mkdirSync(join(dir, 'reels', '.kinotta'), { recursive: true });
    writeFileSync(join(dir, 'reels', 'brand.md'), '# Brand');

    const listing = await openProject(dir).listReels();

    expect(listing.reels.map((r) => r.slug).sort()).toEqual(['broll-cutdown', 'product-showreel']);
  });

  it('reports a missing reels folder as its own state', async () => {
    const listing = await openProject(emptyProject()).listReels();

    expect(listing).toEqual({ state: 'no-reels-folder', reels: [] });
  });

  it('reports an empty reels folder as its own state', async () => {
    const dir = emptyProject();
    mkdirSync(join(dir, 'reels'));

    const listing = await openProject(dir).listReels();

    expect(listing).toEqual({ state: 'no-reels', reels: [] });
  });
});

describe('openProject', () => {
  it('names the project after its folder', () => {
    const dir = copyFixture('showreel-project');

    expect(openProject(dir).name).toBe(dir.split(/[\\/]/).pop());
  });
});
