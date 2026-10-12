import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { emptyProject } from '../helpers/project.ts';

it('auditions bundled effects without importing, then copies exact reusable content into the project', async () => {
  const dir = emptyProject();
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    const catalogue = await fetch(`${server.url}/api/sound-effects`);
    expect(catalogue.status).toBe(200);
    const { effects } = await catalogue.json();
    expect(effects).toHaveLength(17);
    expect(effects.find((effect: { id: string }) => effect.id === 'pop')).toMatchObject({ name: 'Pop', duration: 0.72, description: expect.stringContaining('Quick pop') });
    const original = readFileSync(resolve('skill/kinotta/assets/sfx/pop.mp3'));
    const preview = await fetch(`${server.url}/sound-effects/pop`, { headers: { range: 'bytes=0-99' } });
    expect(preview.status).toBe(206);
    expect(preview.headers.get('content-type')).toBe('audio/mpeg');
    expect(Buffer.from(await preview.arrayBuffer())).toEqual(original.subarray(0, 100));
    expect(await server.project.listMedia()).toEqual([]);
    for (const id of ['unknown', '..%2fmanifest.json']) {
      expect((await fetch(`${server.url}/sound-effects/${id}`)).status).toBe(404);
      expect((await fetch(`${server.url}/api/sound-effects/${id}`, { method: 'POST' })).status).toBe(404);
    }
    const imported = await fetch(`${server.url}/api/sound-effects/pop`, { method: 'POST' });
    expect(imported.status).toBe(201);
    const entry = await imported.json();
    expect(entry).toMatchObject({ kind: 'audio', state: 'ready', copied: true });
    expect(entry.duration).toBeGreaterThan(0);
    expect(readFileSync(join(dir, entry.path))).toEqual(original);
    const repeat = await fetch(`${server.url}/api/sound-effects/pop`, { method: 'POST' });
    expect(repeat.status).toBe(200);
    expect(await repeat.json()).toMatchObject({ id: entry.id, path: entry.path, copied: false });
    expect(await server.project.listMedia()).toHaveLength(1);
  } finally { await server.close(); }
});
