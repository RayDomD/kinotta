import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { copyFixture } from '../helpers/project.ts';

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, createReadStream: vi.fn(fs.createReadStream) };
});

function fixture(expectedHash?: string) {
  const dir = copyFixture('footage-project');
  const version = join(dir, 'reels/founder-talk/v1');
  const file = join(version, 'take.mp4');
  const bytes = 'verified source bytes';
  const hash = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(file, bytes);
  writeFileSync(join(version, 'plan.json'), JSON.stringify({ media: { sources: [{ id: 'take', kind: 'video', path: 'take.mp4', contentHash: expectedHash ?? hash }] } }));
  mkdirSync(join(dir, 'footage/.playback'), { recursive: true });
  const playback = join(dir, `footage/.playback/sha256-${hash}.mp4`);
  writeFileSync(playback, 'already prepared playback');
  return { dir, file, playback, cache: join(dir, 'footage/.playback/.hashes') };
}

async function serve(dir: string, original = false) {
  const { mediaFile } = await import('../../server/core/_internal/media-library.ts');
  return mediaFile(dir, 'take', { reel: 'founder-talk', version: 1 }, original);
}

function reads(file: string) {
  return vi.mocked(createReadStream).mock.calls.filter(([path]) => resolve(String(path)) === file).length;
}

it('reuses a verified saved original after a server reload without reading its bytes', async () => {
  const { dir, file, playback } = fixture();
  expect(await serve(dir)).toBe(playback);
  expect(reads(file)).toBe(1);
  vi.resetModules();
  vi.mocked(createReadStream).mockClear();
  expect(await serve(dir)).toBe(playback);
  expect(await serve(dir, true)).toBe(file);
  expect(reads(file)).toBe(0);
});

it('refuses changed bytes and same-size replacements even when mtime is restored', async () => {
  const { dir, file } = fixture();
  expect(await serve(dir)).toBeTruthy();
  const before = statSync(file);
  const replacement = `${file}.replacement`;
  writeFileSync(replacement, 'x'.repeat(before.size));
  rmSync(file);
  renameSync(replacement, file);
  utimesSync(file, before.atime, before.mtime);
  vi.resetModules();
  expect(await serve(dir)).toBeNull();
  expect(await serve(dir, true)).toBeNull();
});

for (const state of ['missing', 'corrupt']) {
  it(`rehashes an original when its persistent verification is ${state}`, async () => {
    const { dir, file, cache, playback } = fixture();
    expect(await serve(dir)).toBe(playback);
    if (state === 'missing') rmSync(cache, { recursive: true });
    else for (const name of readdirSync(cache)) writeFileSync(join(cache, name), '{invalid');
    vi.resetModules();
    vi.mocked(createReadStream).mockClear();
    expect(await serve(dir)).toBe(playback);
    expect(reads(file)).toBe(1);
  });
}

it('compares the verified hash with the saved source identity on every request', async () => {
  const { dir, file } = fixture('0'.repeat(64));
  expect(await serve(dir)).toBeNull();
  vi.resetModules();
  vi.mocked(createReadStream).mockClear();
  expect(await serve(dir)).toBeNull();
  expect(reads(file)).toBe(0);
});

it('invalidates verification after an in-place edit in the same server process', async () => {
  const { dir, file } = fixture();
  expect(await serve(dir)).toBeTruthy();
  writeFileSync(file, 'changed bytes with a different size');
  expect(await serve(dir)).toBeNull();
});

it('still derives content identity for a legacy saved source without a contentHash', async () => {
  const { dir, playback } = fixture();
  const planFile = join(dir, 'reels/founder-talk/v1/plan.json');
  const plan = JSON.parse(readFileSync(planFile, 'utf8'));
  delete plan.media.sources[0].contentHash;
  writeFileSync(planFile, JSON.stringify(plan));
  expect(await serve(dir)).toBe(playback);
  vi.resetModules();
  expect(await serve(dir)).toBe(playback);
});

it('does not return or cache a hash if the original changes while being read', async () => {
  const { dir, file, cache } = fixture();
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  vi.mocked(createReadStream).mockImplementationOnce((...args) => {
    const stream = fs.createReadStream(...args);
    stream.once('end', () => writeFileSync(file, 'changed during verification'));
    return stream;
  });
  expect(await serve(dir)).toBeNull();
  expect(readFileSync(file, 'utf8')).toBe('changed during verification');
  expect(existsSync(cache) ? readdirSync(cache) : []).toEqual([]);
});
