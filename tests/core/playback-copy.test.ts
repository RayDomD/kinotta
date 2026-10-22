import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture, emptyProject } from '../helpers/project.ts';

const SOURCE = 'take';
let hevc: Buffer;
let hash: string;

beforeAll(() => {
  const file = join(emptyProject(), 'take.mp4');
  const run = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=2', '-c:v', 'libx265', '-tag:v', 'hvc1', file], { encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
  hevc = readFileSync(file);
  hash = createHash('sha256').update(hevc).digest('hex');
});

/** A reel whose saved versions each hold their own copy of the same HEVC bytes, as a frozen version does. */
function project(versions: number): string {
  const dir = copyFixture('footage-project');
  for (let n = 1; n <= versions; n += 1) {
    const versionDir = join(dir, 'reels/founder-talk', `v${n}`);
    mkdirSync(join(versionDir, 'media'), { recursive: true });
    writeFileSync(join(versionDir, 'media', `${hash}.mp4`), hevc);
    writeFileSync(join(versionDir, 'plan.json'), JSON.stringify({
      media: { schema: 1, sources: [{ id: SOURCE, kind: 'video', path: `media/${hash}.mp4`, duration: 2, contentHash: hash }], placements: [], sequence: [] },
    }));
  }
  return dir;
}

const playbackFiles = (dir: string): string[] => readdirSync(join(dir, 'footage/.playback')).filter((name) => name.endsWith('.mp4'));

describe('playback copies of saved-version video', () => {
  it('reuses an existing path-named copy without making another, and still validates the original', async () => {
    const dir = project(1);
    const original = join(dir, 'reels/founder-talk/v1/media', `${hash}.mp4`);
    const legacyName = `reels--founder-talk--v1--media--${hash}.mp4`;
    const legacy = join(dir, 'footage/.playback', legacyName);
    mkdirSync(join(dir, 'footage/.playback'), { recursive: true });
    const run = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', original, '-c:v', 'libx264', legacy], { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    const kinotta = openProject(dir);

    expect(await kinotta.mediaFile(SOURCE, { reel: 'founder-talk', version: 1 })).toBe(legacy);
    expect(playbackFiles(dir)).toEqual([legacyName]);
    appendFileSync(original, Buffer.from('changed'));
    expect(await kinotta.mediaFile(SOURCE, { reel: 'founder-talk', version: 1 })).toBeNull();
  }, 60_000);

  it('makes one copy when many requests arrive at once, with no partial left behind', async () => {
    const dir = project(1);
    const kinotta = openProject(dir);
    const files = await Promise.all(Array.from({ length: 5 }, () => kinotta.mediaFile(SOURCE, { reel: 'founder-talk', version: 1 })));
    expect(new Set(files).size).toBe(1);
    expect(files[0]).toBeTruthy();
    expect(playbackFiles(dir)).toEqual([`sha256-${hash}.mp4`]);
  }, 60_000);

  it('shares one copy between versions that hold the same bytes', async () => {
    const dir = project(2);
    const kinotta = openProject(dir);
    const first = await kinotta.mediaFile(SOURCE, { reel: 'founder-talk', version: 1 });
    const second = await kinotta.mediaFile(SOURCE, { reel: 'founder-talk', version: 2 });
    // The first request also queues the editing proxy, which the second may already get.
    expect([first, join(dir, 'footage/.proxy', `sha256-${hash}.mp4`)]).toContain(second);
    expect(playbackFiles(dir)).toEqual([`sha256-${hash}.mp4`]);
  }, 60_000);

  it("reuses the library's copy of the same bytes instead of transcoding again", async () => {
    const dir = project(1);
    mkdirSync(join(dir, 'footage'), { recursive: true });
    writeFileSync(join(dir, 'footage/take.mp4'), hevc);
    const kinotta = openProject(dir);
    const entry = await kinotta.referenceMedia('footage/take.mp4');
    const file = await kinotta.mediaFile(SOURCE, { reel: 'founder-talk', version: 1 });
    expect([join(dir, entry.playback!), join(dir, 'footage/.proxy', `sha256-${hash}.mp4`)]).toContain(file);
    expect(playbackFiles(dir)).toEqual(['take.mp4']);
  }, 60_000);

  it('still refuses a source whose bytes changed after it was served', async () => {
    const dir = project(1);
    const kinotta = openProject(dir);
    expect(await kinotta.mediaFile(SOURCE, { reel: 'founder-talk', version: 1 })).toBeTruthy();
    appendFileSync(join(dir, 'reels/founder-talk/v1/media', `${hash}.mp4`), Buffer.from('changed'));
    expect(await kinotta.mediaFile(SOURCE, { reel: 'founder-talk', version: 1 })).toBeNull();
  }, 60_000);
});

describe('the playback copy itself', () => {
  const probe = (file: string, args: string[]): string =>
    spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', ...args, '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim();

  it('is editor-sized with a keyframe every half second, so a seek decodes few frames', async () => {
    const big = join(emptyProject(), 'big.mp4');
    // Wider than the editor's frame, with the encoder's default keyframe spacing (several seconds).
    const run = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=2560x1440:rate=30:duration=3', '-c:v', 'libx265', '-tag:v', 'hvc1', big], { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    const bytes = readFileSync(big);
    const bigHash = createHash('sha256').update(bytes).digest('hex');
    const dir = copyFixture('footage-project');
    const versionDir = join(dir, 'reels/founder-talk/v1');
    mkdirSync(join(versionDir, 'media'), { recursive: true });
    writeFileSync(join(versionDir, 'media/big.mp4'), bytes);
    writeFileSync(join(versionDir, 'plan.json'), JSON.stringify({
      media: { schema: 1, sources: [{ id: 'big', kind: 'video', path: 'media/big.mp4', duration: 3, contentHash: bigHash }], placements: [], sequence: [] },
    }));

    const copy = (await openProject(dir).mediaFile('big', { reel: 'founder-talk', version: 1 }))!;

    expect(probe(copy, ['-show_entries', 'stream=width,height'])).toBe('1920,1080');
    const keys = probe(copy, ['-skip_frame', 'nokey', '-show_entries', 'frame=pts_time']).split(/\s+/).map(parseFloat).filter(Number.isFinite);
    const gaps = keys.slice(1).map((t, i) => t - keys[i]!);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(0.51);
  }, 120_000);
});

