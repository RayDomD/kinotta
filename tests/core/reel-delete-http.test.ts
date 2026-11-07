import { cpSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { startServer, type RunningServer } from '../../server/main.ts';
import { alternatesFixture } from '../helpers/parts.ts';

const running: RunningServer[] = [];
afterEach(async () => { for (const server of running.splice(0)) await server.close(); });
function tree(dir: string): string[] {
  return readdirSync(dir, { recursive: true }).map(String).sort().map((path) => {
    try { return `${path}:${readFileSync(join(dir, path)).toString('base64')}`; } catch { return `${path}/`; }
  });
}

it('deletes a version and a closed reel over HTTP and reports refusal reasons without partial deletion', async () => {
  const { dir, reelDir } = alternatesFixture(true);
  for (const number of [2, 3]) cpSync(join(reelDir, 'v1'), join(reelDir, `v${number}`), { recursive: true });
  const server = await startServer({ projectDir: dir, port: 0 }); running.push(server);
  const call = (path: string, method = 'DELETE', headers?: Record<string, string>) => fetch(`${server.url}${path}`, { method, headers });
  const before = tree(dir);

  const base = await call('/api/reels/parts/versions/3');
  expect(base.status).toBe(409);
  expect(await base.json()).toMatchObject({ error: expect.stringContaining('Current') });
  const open = await call('/api/reels/parts?openReel=parts');
  expect(open.status).toBe(409);
  expect(await open.json()).toMatchObject({ error: expect.stringContaining('open reel') });
  expect((await call('/api/reels/parts')).status).toBe(422);
  expect((await call('/api/reels/parts?openReel=other', 'DELETE', { origin: 'https://untrusted.example' })).status).toBe(403);
  expect((await call('/api/reels/bad%2Fslug?openReel=other')).status).toBe(404);
  expect((await call('/api/reels/parts/versions/99')).status).toBe(404);
  expect(tree(dir)).toEqual(before);

  expect((await call('/api/reels/parts/versions/2')).status).toBe(204);
  expect(existsSync(join(reelDir, 'v2'))).toBe(false);
  expect((await call('/api/reels/parts/versions/2', 'GET')).status).toBe(404);
  expect((await call('/api/reels/parts?openReel=other')).status).toBe(204);
  expect(existsSync(reelDir)).toBe(false);
});
