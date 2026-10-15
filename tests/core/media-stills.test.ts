import { spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';
import { startServer } from '../../server/main.ts';

it('extracts registered video frames once and refuses invalid coordinates or sources', async () => {
  const dir = copyFixture('showreel-project');
  const made = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=320x180:d=1', join(dir, 'sample.mp4')], { encoding: 'utf8' });
  expect(made.status, made.stderr).toBe(0);
  const project = openProject(dir);
  const entry = await project.referenceMedia('sample.mp4');
  const [a, b] = await Promise.all([project.mediaStill(entry.id, 0.2, 160), project.mediaStill(entry.id, 0.2, 160)]);
  expect(a).toBe(b);
  expect((await readFile(a)).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  const before = (await stat(a)).mtimeMs;
  expect(await project.mediaStill(entry.id, 0.2, 160)).toBe(a);
  expect((await stat(a)).mtimeMs).toBe(before);
  await expect(project.mediaStill('../sample.mp4', 0.2, 160)).rejects.toThrow();
  await expect(project.mediaStill(entry.id, -1, 160)).rejects.toThrow();
  await expect(project.mediaStill(entry.id, 3, 160)).rejects.toThrow();
  await expect(project.mediaStill(entry.id, 0.2, 99999)).rejects.toThrow();
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    const response = await fetch(`${server.url}/api/media/${entry.id}/still?time=0.2&width=160`);
    expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(await readFile(a));
    expect((await fetch(`${server.url}/api/media/${entry.id}/still?time=-1&width=160`)).status).toBe(422);
  } finally { await server.close(); }
});
