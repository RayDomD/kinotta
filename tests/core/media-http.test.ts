import { spawnSync } from 'node:child_process';
import { readFileSync, renameSync } from 'node:fs';
import { get } from 'node:http';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { emptyProject } from '../helpers/project.ts';

it('imports and searches media over HTTP and serves registered content with seekable byte ranges', async () => {
  const dir = emptyProject();
  const file = join(dir, 'tone.wav');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', file], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    const imported = await fetch(`${server.url}/api/media?name=Tone.wav`, { method: 'POST', body: readFileSync(file) });
    expect(imported.status).toBe(201);
    const entry = await imported.json() as { id: string };
    const library = await fetch(`${server.url}/api/media?kind=audio&search=tone`);
    expect((await library.json()).media.map((s: { id: string }) => s.id)).toEqual([entry.id]);
    const range = await fetch(`${server.url}/media/${encodeURIComponent(entry.id)}`, { headers: { range: 'bytes=0-99' } });
    expect(range.status).toBe(206);
    expect(range.headers.get('content-type')).toBe('audio/wav');
    expect(Buffer.from(await range.arrayBuffer())).toEqual(readFileSync(file).subarray(0, 100));
    expect((await fetch(`${server.url}/media/..%2Foutside.wav`)).status).toBe(404);
    const reference = await fetch(`${server.url}/api/media/reference`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: '../outside.wav' }) });
    expect(reference.status).toBe(422);
  } finally { await server.close(); }
});

it('releases the original file after an interrupted playback request so it can be moved and relinked', { timeout: 15_000 }, async () => {
  const dir = emptyProject();
  const file = join(dir, 'long.wav');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '120', file], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    const entry = await server.project.referenceMedia('long.wav');
    await new Promise<void>((resolve, reject) => {
      const request = get(`${server.url}/media/${entry.id}`, { headers: { range: 'bytes=0-' } }, (response) => {
        response.once('data', () => { response.destroy(); request.destroy(); });
        response.once('close', resolve);
      });
      request.once('error', reject);
    });
    await expect.poll(() => { try { renameSync(file, join(dir, 'moved.wav')); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EBUSY') return false; throw error; } }, { timeout: 2_000 }).toBe(true);
    expect((await server.project.listMedia())[0]?.state).toBe('missing');
    expect((await server.project.relinkMedia(entry.id, 'moved.wav')).path).toBe('moved.wav');
  } finally { await server.close(); }
});
