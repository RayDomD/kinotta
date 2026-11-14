import { spawnSync } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { startServer } from '../../server/main.ts';
import { ensureEditingProxy } from '../../server/core/_internal/import.ts';
import * as runner from '../../server/core/_internal/runner.ts';
import { copyFixture, emptyProject } from '../helpers/project.ts';

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

it('serves draft stills and deduplicated graded playback with byte ranges, offsets and Working grade changes', { timeout: 30_000 }, async () => {
  const dir = copyFixture('footage-project');
  const file = join(dir, 'preview.mp4');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x404040:s=320x180:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const image = join(dir, 'preview.png');
  const still = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-frames:v', '1', image], { encoding: 'utf8' });
  expect(still.status, still.stderr).toBe(0);
  await ensureEditingProxy(dir, file);
  const media = {
    schema: 1,
    sources: [{ id: 'a', kind: 'video', path: '../../../preview.mp4', duration: 3 }, { id: 'b', kind: 'image', path: '../../../preview.png', duration: 0 }],
    placements: [
      { id: 'take', role: 'main', source: 'a', in: 0.5, out: 2, grade: { exposure: 1 } },
      { id: 'plain', role: 'insert', source: 'a', in: 0, out: 1, at: 0 },
      { id: 'photo', role: 'insert', source: 'b', in: 0, out: 0, at: 0, duration: 1.5, grade: { exposure: 1 } },
    ],
    sequence: ['take'],
  };
  const plan = { duration: 1.5, clips: [], media };
  const versionFile = join(dir, 'reels', 'founder-talk', 'v1', 'plan.json');
  writeFileSync(versionFile, JSON.stringify(plan));
  const saved = readFileSync(versionFile);
  const working = structuredClone(plan);
  working.media.sources.forEach((source) => { source.path = source.path.replace('../../../', '../../'); });
  writeFileSync(join(dir, 'reels', 'founder-talk', 'plan.json'), JSON.stringify(working));
  const originalEncode = runner.makeGradedPlayback;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const encode = vi.spyOn(runner, 'makeGradedPlayback').mockImplementation(async (...args) => { await gate; await originalEncode(...args); });
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    const placement = `${server.url}/api/reels/founder-talk/placements`;
    const playback = `${placement}/take/graded-playback?version=1`;
    const first = await fetch(playback);
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ status: 'rendering' });
    expect((await fetch(playback)).status).toBe(202);
    await expect.poll(() => encode.mock.calls.length).toBe(1);
    release();
    let ready!: Response;
    await expect.poll(async () => { ready = await fetch(playback); return ready.status; }, { timeout: 10_000 }).toBe(200);
    const result = await ready.json();
    expect(result).toEqual({ url: expect.stringMatching(/^\/graded\/[a-f0-9]{64}\.mp4$/), offset: 0.5 });
    expect((await (await fetch(playback)).json())).toEqual(result);
    expect(encode).toHaveBeenCalledTimes(1);
    const bytes = await fetch(server.url + result.url);
    expect(bytes.status).toBe(200);
    expect(bytes.headers.get('content-type')).toBe('video/mp4');
    const complete = Buffer.from(await bytes.arrayBuffer());
    const range = await fetch(server.url + result.url, { headers: { range: 'bytes=0-99' } });
    expect(range.status).toBe(206);
    expect(range.headers.get('accept-ranges')).toBe('bytes');
    expect(range.headers.get('content-range')).toBe(`bytes 0-99/${complete.length}`);
    expect(Buffer.from(await range.arrayBuffer())).toEqual(complete.subarray(0, 100));
    const head = await fetch(server.url + result.url, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe(String(complete.length));
    const invalidRange = await fetch(server.url + result.url, { headers: { range: 'bytes=999999999-' } });
    expect(invalidRange.status).toBe(416);
    for (const id of ['plain', 'photo']) {
      const refused = await fetch(`${placement}/${id}/graded-playback?version=1`);
      expect(refused.status).toBe(409);
      expect((await refused.json()).error).toMatch(id === 'plain' ? /ungraded/ : /image/);
    }
    expect((await fetch(`${placement}/missing/graded-playback?version=1`)).status).toBe(404);
    for (const query of ['', '?version=0', '?version=1.5']) expect((await fetch(`${placement}/take/graded-playback${query}`)).status).toBe(400);
    const draftUrl = `${placement}/take/graded-still?version=1&time=0.25&width=160&grade=${encodeURIComponent('{"exposure":-1}')}`;
    const draft = await fetch(draftUrl);
    expect(draft.status).toBe(200);
    expect(draft.headers.get('content-type')).toBe('image/jpeg');
    const draftBytes = Buffer.from(await draft.arrayBuffer());
    expect(draftBytes).toEqual(readFileSync(await server.project.gradedStill('founder-talk', 'take', 0.25, 160, { version: 1 }, { exposure: -1 })));
    expect(readFileSync(versionFile)).toEqual(saved);
    expect((await server.project.readEditList('founder-talk')).operations).toHaveLength(0);
    await server.project.addOperation('founder-talk', { kind: 'placement-change', placement: 'take', changes: { grade: { exposure: -1 } } });
    const pending = await fetch(playback + '&working=1');
    expect(pending.status).toBe(202);
    await expect.poll(async () => (await fetch(playback + '&working=1')).status, { timeout: 10_000 }).toBe(200);
    const workingResult = await (await fetch(playback + '&working=1')).json();
    expect(workingResult.url).not.toBe(result.url);
    expect(workingResult.offset).toBe(0.5);
    expect(await (await fetch(playback)).json()).toEqual(result);
    expect(encode).toHaveBeenCalledTimes(2);
    expect((await fetch(`${server.url}/graded/not-a-cache-key.mp4`)).status).toBe(404);
    expect((await fetch(`${server.url}/graded/${'0'.repeat(64)}.mp4`)).status).toBe(404);
  } finally { release(); encode.mockRestore(); await server.close(); }
});
