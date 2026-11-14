import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { contentProxyPath, ensureEditingProxy, hashOf, inCopySlot } from '../../server/core/_internal/import.ts';
import * as runner from '../../server/core/_internal/runner.ts';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

const reel = 'founder-talk';
const context = { version: 1 };
afterEach(() => vi.restoreAllMocks());

function ffmpeg(args: string[]): Buffer {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { maxBuffer: 16 * 1024 * 1024 });
  expect(result.status, result.stderr.toString()).toBe(0);
  return result.stdout;
}

async function fixture() {
  const dir = copyFixture('footage-project');
  const file = join(dir, 'sample.mp4');
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x404040:s=320x180:r=24:d=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file]);
  const hash = await hashOf(file);
  await ensureEditingProxy(dir, file, hash);
  const image = join(dir, 'sample.png');
  ffmpeg(['-i', file, '-frames:v', '1', image]);
  const media = {
    schema: 1 as const,
    sources: [
      { id: 'video', kind: 'video' as const, path: '../../../sample.mp4', duration: 3, contentHash: hash, audio: true },
      { id: 'image', kind: 'image' as const, path: '../../../sample.png', duration: 0 },
    ],
    placements: [
      { id: 'take', role: 'main' as const, source: 'video', in: 0.5, out: 2, grade: { exposure: 1 } },
      { id: 'plain', role: 'insert' as const, source: 'video', in: 0, out: 1, at: 0 },
      { id: 'photo', role: 'insert' as const, source: 'image', in: 0, out: 0, at: 0, duration: 1.5, grade: { exposure: 1 } },
    ],
    sequence: ['take'],
  };
  const plan = { title: 'Preview', duration: 1.5, clips: [], media };
  const version = join(dir, 'reels', reel, 'v1');
  writeFileSync(join(version, 'plan.json'), JSON.stringify(plan));
  const working = structuredClone(plan);
  working.media.sources.forEach((source) => { source.path = source.path.replace('../../../', '../../'); });
  writeFileSync(join(dir, 'reels', reel, 'plan.json'), JSON.stringify(working));
  return { dir, project: openProject(dir), version, file, hash };
}

function brightness(file: string): number {
  const pixels = ffmpeg(['-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  return pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
}

it('renders brighter exact stills, replaces the stored grade with a draft, and reuses the bounded still cache', { timeout: 30_000 }, async () => {
  const { project, version, file } = await fixture();
  const extraction = vi.spyOn(runner, 'extractMediaStill');
  const stored = readFileSync(join(version, 'plan.json'));
  const [graded, duplicate] = await Promise.all([
    project.gradedStill(reel, 'take', 0.25, 960, context),
    project.gradedStill(reel, 'take', 0.25, 960, context),
  ]);
  expect(duplicate).toBe(graded);
  expect(extraction).toHaveBeenCalledTimes(1);
  expect(extraction.mock.calls[0]).toEqual([file, expect.any(String), 0.75, 960, 'scale=1920:-2,exposure=exposure=1,format=rgba,format=yuv420p']);
  expect(await project.gradedStill(reel, 'take', 0.25, 960, context)).toBe(graded);
  expect(extraction).toHaveBeenCalledTimes(1);
  const neutral = await project.gradedStill(reel, 'take', 0.25, 960, context, {});
  expect(extraction).toHaveBeenCalledWith(file, expect.any(String), 0.75, 960, 'scale=1920:-2,format=rgba,format=yuv420p');
  expect(brightness(graded)).toBeGreaterThan(brightness(neutral) + 10);
  const darker = await project.gradedStill(reel, 'take', 0.25, 960, context, { exposure: -1 });
  expect(brightness(darker)).toBeLessThan(brightness(neutral) - 10);
  expect(readFileSync(join(version, 'plan.json'))).toEqual(stored);
  expect((await project.readEditList(reel)).operations).toHaveLength(0);
  expect((await runner.probeMedia(graded, 'image')).width).toBe(960);
  await project.gradedStill(reel, 'take', 0.25, 1280, context);
  expect(extraction).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), 0.75, 1280, 'scale=1920:-2,exposure=exposure=1,format=rgba,format=yuv420p');
});

it('returns 400 with the problem for bad drafts, times and widths, and supports graded images', { timeout: 30_000 }, async () => {
  const { project, dir } = await fixture();
  const image = await project.gradedStill(reel, 'photo', 1, 160, context);
  const neutral = await project.gradedStill(reel, 'photo', 1, 160, context, {});
  expect(brightness(image)).toBeGreaterThan(brightness(neutral) + 10);
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    const base = `${server.url}/api/reels/${reel}/placements/take/graded-still?version=1&`;
    for (const [query, problem] of [
      ['time=-1&width=160', 'time'], ['time=1.5&width=160', 'outside'],
      ['time=2&width=160', 'outside'], ['time=0&width=31', 'width'],
      ['time=0&width=1281', 'width'], ['time=0&width=160&grade=%7B', 'JSON'],
      [`time=0&width=160&grade=${encodeURIComponent('{"exposure":4}')}`, 'exposure'],
      [`time=0&width=160&grade=${encodeURIComponent('{"exposure":null}')}`, 'exposure'],
      ['time=0&width=160&grade=null', 'object'],
    ]) {
      const response = await fetch(base + query);
      expect(response.status, query).toBe(400);
      expect((await response.json()).error).toContain(problem);
    }
    const response = await fetch(base + 'time=0.25&width=160');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
  } finally { await server.close(); }
});

it('builds one range-limited playable copy in the shared slot, reuses it, and changes keys with grades, ranges and proxy bytes', { timeout: 30_000 }, async () => {
  const { project, dir, version, hash, file } = await fixture();
  const encode = vi.spyOn(runner, 'makeGradedPlayback');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let occupiedCount = 0;
  let entered!: () => void;
  const enteredSlots = new Promise<void>((resolve) => { entered = resolve; });
  const occupy = () => inCopySlot(async () => { if (++occupiedCount === 2) entered(); await gate; });
  const occupied = Promise.all([occupy(), occupy()]);
  await enteredSlots;
  try {
    expect(await project.gradedPlayback(reel, 'take', context)).toEqual({ status: 'rendering' });
    expect(await project.gradedPlayback(reel, 'take', context)).toEqual({ status: 'rendering' });
    expect(encode).not.toHaveBeenCalled();
  } finally { release(); await occupied; }
  let ready: Awaited<ReturnType<typeof project.gradedPlayback>>;
  await expect.poll(async () => { ready = await project.gradedPlayback(reel, 'take', context); return 'file' in ready; }, { timeout: 10_000 }).toBe(true);
  if (!('file' in ready!)) throw new Error('Playback was not ready.');
  const original = ready;
  expect(original.offset).toBe(0.5);
  expect(encode).toHaveBeenCalledTimes(1);
  expect(encode.mock.calls[0][0]).toBe(contentProxyPath(dir, hash));
  expect((await runner.probeMedia(original.file, 'video')).duration).toBeCloseTo(1.5, 1);
  expect(brightness(original.file)).toBeGreaterThan(brightness(file) + 10);
  expect(await project.gradedPlayback(reel, 'take', context)).toEqual(original);
  expect(encode).toHaveBeenCalledTimes(1);
  const planFile = join(version, 'plan.json');
  const plan = JSON.parse(readFileSync(planFile, 'utf8'));
  for (const change of [() => { plan.media.placements[0].grade.exposure = -1; }, () => { plan.media.placements[0].in = 1; }]) {
    change();
    writeFileSync(planFile, JSON.stringify(plan));
    expect(await project.gradedPlayback(reel, 'take', context)).toEqual({ status: 'rendering' });
    await expect.poll(async () => 'file' in await project.gradedPlayback(reel, 'take', context), { timeout: 10_000 }).toBe(true);
    const changed = await project.gradedPlayback(reel, 'take', context);
    expect(changed).not.toEqual(original);
  }
  const proxy = contentProxyPath(dir, hash);
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x202020:s=320x180:r=24:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', proxy]);
  expect(await project.gradedPlayback(reel, 'take', context)).toEqual({ status: 'rendering' });
  await expect.poll(async () => 'file' in await project.gradedPlayback(reel, 'take', context), { timeout: 10_000 }).toBe(true);
  expect(encode).toHaveBeenCalledTimes(4);
});

it('keeps saved grades frozen while Working follows edits and rejects ungraded or image playback', { timeout: 30_000 }, async () => {
  const { project } = await fixture();
  const saved = await project.gradedStill(reel, 'take', 0.25, 160, context);
  await project.addOperation(reel, { kind: 'placement-change', placement: 'take', changes: { grade: { exposure: -1 } } });
  const working = await project.gradedStill(reel, 'take', 0.25, 160, { version: 1, working: true });
  expect(brightness(working)).toBeLessThan(brightness(saved));
  expect(await project.gradedStill(reel, 'take', 0.25, 160, context)).toBe(saved);
  for (const placement of ['plain', 'photo']) await expect(project.gradedPlayback(reel, placement, context)).rejects.toMatchObject({ code: 'frozen' });
  await expect(project.gradedStill(reel, 'missing', 0, 160, context)).rejects.toMatchObject({ code: 'not-found' });
  await expect(project.gradedStill('../escape', 'take', 0, 160, context)).rejects.toMatchObject({ code: 'not-found' });
});

it('preserves ungraded still bytes and the proxy-based cache key', { timeout: 30_000 }, async () => {
  const { project, dir, hash } = await fixture();
  const proxy = contentProxyPath(dir, hash);
  const expected = join(dir, 'ungraded-reference.jpg');
  ffmpeg(['-ss', '0.75', '-i', proxy, '-frames:v', '1', '-vf', 'scale=160:-2', '-q:v', '4', expected]);
  const still = await project.mediaStill('video', 0.75, 160, { reel, ...context });
  expect(still).toBe(join(dir, 'reels', '.kinotta', 'stills', await hashOf(proxy), '0.75-160.jpg'));
  expect(readFileSync(still)).toEqual(readFileSync(expected));
  const extraction = vi.spyOn(runner, 'extractMediaStill');
  expect(await project.mediaStill('video', 0.75, 160, { reel, ...context })).toBe(still);
  expect(extraction).not.toHaveBeenCalled();
});
