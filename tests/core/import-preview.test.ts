import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IMPORT_MARGIN_BYTES, previewImport } from '../../server/core/_internal/import-preview.ts';
import { copyFixture } from '../helpers/project.ts';

const GB = 1024 ** 3;
const plenty = async () => 100 * GB;

function project(footage: Record<string, number> = {}): string {
  const dir = copyFixture('footage-project');
  if (Object.keys(footage).length) mkdirSync(join(dir, 'footage'), { recursive: true });
  for (const [name, size] of Object.entries(footage)) writeFileSync(join(dir, 'footage', name), Buffer.alloc(size));
  return dir;
}

describe('previewing an import', () => {
  it('names each copy as the import will, numbering a taken name and two of the same name in one drop', async () => {
    const dir = project({ 'talk.mp4': 10 });
    const preview = await previewImport(dir, 'reel', [{ name: 'talk.mp4', size: 20 }, { name: 'intro.mov', size: 30 }, { name: 'intro.mov', size: 40 }], plenty);
    expect(preview.items.map((i) => [i.status, i.destination])).toEqual([
      ['renamed', 'footage/talk-2.mp4'],
      ['new', 'footage/intro.mov'],
      ['renamed', 'footage/intro-2.mov'],
    ]);
    expect(preview.items.every((i) => i.mayNeedPlaybackCopy)).toBe(true);
    expect(preview.copyBytes).toBe(90);
  });

  it('marks a file of a size already in footage/ as maybe the same, and keeps only the last segment of a path', async () => {
    const dir = project({ 'talk.mp4': 1234 });
    const preview = await previewImport(dir, 'reel', [{ name: 'phone/other.mp4', size: 1234 }, { name: 'C:\\clips\\b:roll.webm', size: 5 }], plenty);
    expect(preview.items[0]).toMatchObject({ status: 'maybe-duplicate', destination: 'footage/other.mp4' });
    expect(preview.items[1]).toMatchObject({ status: 'new', destination: 'footage/b_roll.webm' });
    expect(preview.items[1]!.mayNeedPlaybackCopy).toBeUndefined();
  });

  it('lists what each place refuses: a new reel takes only videos, the media library also sound and pictures', async () => {
    const dir = project();
    const files = [{ name: 'take.mp4', size: 1 }, { name: 'voice.wav', size: 1 }, { name: 'logo.png', size: 1 }, { name: 'raw.braw', size: 1 }];
    expect((await previewImport(dir, 'reel', files, plenty)).items.map((i) => i.status)).toEqual(['new', 'unsupported', 'unsupported', 'unsupported']);
    expect((await previewImport(dir, 'media', files, plenty)).items.map((i) => i.status)).toEqual(['new', 'new', 'new', 'unsupported']);
  });

  it('says how much more space it needs when the disk is short, counting proxies and a margin', async () => {
    const dir = project();
    const preview = await previewImport(dir, 'reel', [{ name: 'long.mov', size: 4 * GB }], async () => 5 * GB);
    expect(preview).toMatchObject({ copyBytes: 4 * GB, extraBytes: 2 * GB, freeBytes: 5 * GB, enough: false });
    expect(preview.shortBy).toBe(4 * GB + 2 * GB + IMPORT_MARGIN_BYTES - 5 * GB);
    expect((await previewImport(dir, 'reel', [{ name: 'long.mov', size: 4 * GB }], plenty)).enough).toBe(true);
  });

  it('changes nothing on disk and reads the real free space of the project volume', async () => {
    const dir = project();
    const before = readdirSync(dir);
    const preview = await previewImport(dir, 'media', [{ name: 'a.mp4', size: 1 }]);
    expect(preview.freeBytes).toBeGreaterThan(0);
    expect(readdirSync(dir)).toEqual(before);
    expect(existsSync(join(dir, 'footage'))).toBe(false);
  });

  it('refuses an empty drop, a file without a size and an unknown place', async () => {
    const dir = project();
    await expect(previewImport(dir, 'reel', [], plenty)).rejects.toThrow('at least one file');
    await expect(previewImport(dir, 'reel', [{ name: 'a.mp4', size: Number.NaN }], plenty)).rejects.toThrow('name and size');
    await expect(previewImport(dir, 'elsewhere' as 'reel', [{ name: 'a.mp4', size: 1 }], plenty)).rejects.toThrow('Choose where');
  });
});

describe('previewing an import over HTTP', () => {
  it('answers with the preview and refuses a request without a place or files', async () => {
    const { startServer } = await import('../../server/main.ts');
    const server = await startServer({ projectDir: project({ 'talk.mp4': 3 }), port: 0 });
    try {
      const post = (body: unknown) => fetch(`${server.url}/api/import/preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const ok = await post({ mode: 'reel', files: [{ name: 'talk.mp4', size: 9 }, { name: 'notes.txt', size: 1 }] });
      expect(ok.status).toBe(200);
      expect((await ok.json()).items.map((i: { status: string }) => i.status)).toEqual(['renamed', 'unsupported']);
      expect((await post({ files: [] })).status).toBe(400);
      expect((await post({ mode: 'reel', files: [] })).status).toBe(422);
    } finally { await server.close(); }
  });
});

describe('a drive that fills during an import', () => {
  async function* fills(): AsyncGenerator<Uint8Array> {
    yield new Uint8Array(1024);
    throw Object.assign(new Error('write ENOSPC'), { code: 'ENOSPC' });
  }

  it('says so plainly and keeps no part of the file, in both import paths', async () => {
    const { openProject } = await import('../../server/core/index.ts');
    const dir = project();
    const opened = openProject(dir);
    for (const attempt of [() => opened.importVideo('take.mp4', fills()), () => opened.importMedia('take.mp4', fills())]) {
      await expect(attempt()).rejects.toThrow('The drive ran out of space while copying, so nothing was kept.');
    }
    expect(existsSync(join(dir, 'footage')) ? readdirSync(join(dir, 'footage')).filter((f) => !f.startsWith('.') || f.startsWith('.incoming-')) : []).toEqual([]);
  });
});
