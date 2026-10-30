import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

it('serves pending Working sound before freeze while keeping saved versions isolated', { timeout: 30000 }, async () => {
  const dir = copyFixture('showreel-project');
  const file = join(dir, 'pending.wav');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', file], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await server.project.addOperation('product-showreel', { kind: 'placement-add', source: { id: 'pending', kind: 'audio', path: '../../../pending.wav', duration: 1 }, placement: { id: 'pending-use', role: 'audio', source: 'pending', at: 1, in: 0, out: 1 } });
    const base = `${server.url}/media/product-showreel/2/pending`;
    expect((await fetch(base)).status).toBe(404);
    const working = await fetch(`${base}?working=1`);
    expect(working.status).toBe(200);
    expect(Buffer.from(await working.arrayBuffer())).toEqual(readFileSync(file));
    const query = 'reel=product-showreel&version=2&working=1';
    const wave = await fetch(`${server.url}/api/media/pending/waveform?${query}`);
    expect(await wave.json()).toMatchObject({ state: 'ready', duration: 1 });
    await expect.poll(async () => (await fetch(`${server.url}/api/media/pending/audio?${query}`)).status, { timeout: 10000 }).toBe(200);
    await server.project.freezeEdits('product-showreel');
    expect((await fetch(base)).status).toBe(404);
    expect((await fetch(`${server.url}/media/product-showreel/3/pending`)).status).toBe(200);
  } finally { await server.close(); }
});
