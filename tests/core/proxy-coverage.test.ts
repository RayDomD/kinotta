import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { startServer } from '../../server/main.ts';
import type { RunningServer } from '../../server/main.ts';
import { copyFixture, emptyProject } from '../helpers/project.ts';

/** Background ffmpeg jobs share two copy slots, so a proxy can take a while under a loaded test run. */
const MADE_WITHIN = { timeout: 30_000, interval: 100 };

const runningServers: RunningServer[] = [];
afterEach(async () => {
  for (const server of runningServers.splice(0)) await server.close();
});

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const proxyOf = (dir: string, hash: string): string => join(dir, 'footage/.proxy', `sha256-${hash}.mp4`);
const audioOf = (dir: string, hash: string): string => join(dir, 'footage/.audio', `sha256-${hash}.aac`);

let clip: Buffer;
let clipHash: string;
let talkHash: string;

beforeAll(() => {
  // A clip with sound whose bytes differ from the fixture's talk.mp4.
  const file = join(emptyProject(), 'clip.mp4');
  const run = spawnSync('ffmpeg', [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-c:v', 'libx264', '-c:a', 'aac', file,
  ], { encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
  clip = readFileSync(file);
  clipHash = sha256(clip);
  talkHash = sha256(readFileSync(join(copyFixture('footage-project'), 'media/talk.mp4')));
});

describe('legacy reels play from proxies and audio files', () => {
  it('serves the reel footage proxy to the editor once made, and makes it when missing', async () => {
    const dir = copyFixture('footage-project');
    const kinotta = openProject(dir);
    expect(await kinotta.footageFile('founder-talk')).toBe(join(dir, 'media/talk.mp4'));
    await vi.waitFor(() => expect(existsSync(proxyOf(dir, talkHash))).toBe(true), MADE_WITHIN);
    expect(await kinotta.footageFile('founder-talk')).toBe(proxyOf(dir, talkHash));
  }, 60_000);

  it('serves the reel footage audio file at /footage/:slug/audio once made, and 404 for an unknown reel', async () => {
    const dir = copyFixture('footage-project');
    // The fixture's talk.mp4 has no sound, so the reel points at a clip that has some.
    writeFileSync(join(dir, 'media/voiced.mp4'), clip);
    writeFileSync(join(dir, 'reels/founder-talk/reel.json'), JSON.stringify({ title: 'Founder talk', footage: 'media/voiced.mp4' }));
    const server = await startServer({ projectDir: dir, port: 0 });
    runningServers.push(server);
    await vi.waitFor(async () => {
      const response = await fetch(`${server.url}/footage/founder-talk/audio`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('audio/aac');
    }, MADE_WITHIN);
    expect(existsSync(audioOf(dir, clipHash))).toBe(true);
    expect((await fetch(`${server.url}/footage/no-such-reel/audio`)).status).toBe(404);
  }, 60_000);
});

describe('the one-time pass finds video by content, not only at the top of footage/', () => {
  it('makes proxies for reel footage, older library entries in subfolders and saved-version sources', async () => {
    const dir = copyFixture('footage-project');
    mkdirSync(join(dir, 'footage/sub'), { recursive: true });
    const nested = clip;
    writeFileSync(join(dir, 'footage/sub/nested.mp4'), nested);
    // An entry registered before proxies existed: nothing scheduled one at import.
    writeFileSync(join(dir, 'reels/.media-library.json'), JSON.stringify([{
      id: `sha256:${clipHash}`, contentHash: clipHash, kind: 'video', name: 'nested.mp4', path: 'footage/sub/nested.mp4',
      size: nested.length, state: 'ready', codec: 'h264', audio: true, duration: 1,
    }]));
    const savedBytes = Buffer.concat([clip, Buffer.from('saved')]);
    const savedHash = sha256(savedBytes);
    const versionDir = join(dir, 'reels/founder-talk/v2');
    mkdirSync(join(versionDir, 'media'), { recursive: true });
    writeFileSync(join(versionDir, 'media/saved.mp4'), savedBytes);
    writeFileSync(join(versionDir, 'plan.json'), JSON.stringify({
      media: { schema: 1, sources: [{ id: 'saved', kind: 'video', path: 'media/saved.mp4', duration: 1, contentHash: savedHash }], placements: [], sequence: [] },
    }));

    openProject(dir, { proxies: true });

    await vi.waitFor(() => {
      expect(existsSync(proxyOf(dir, talkHash))).toBe(true);
      expect(existsSync(proxyOf(dir, clipHash))).toBe(true);
      expect(existsSync(proxyOf(dir, savedHash))).toBe(true);
    }, MADE_WITHIN);
  }, 60_000);

  it('does not run the pass for a project opened without the editor', async () => {
    const dir = copyFixture('footage-project');
    mkdirSync(join(dir, 'footage'), { recursive: true });
    writeFileSync(join(dir, 'footage/top.mp4'), clip);
    openProject(dir);
    await new Promise((done) => setTimeout(done, 1_000));
    expect(existsSync(proxyOf(dir, clipHash))).toBe(false);
  });

  it('schedules a missing proxy when a saved version source is served for editing', async () => {
    const dir = copyFixture('footage-project');
    const versionDir = join(dir, 'reels/founder-talk/v2');
    mkdirSync(join(versionDir, 'media'), { recursive: true });
    writeFileSync(join(versionDir, 'media/saved.mp4'), clip);
    writeFileSync(join(versionDir, 'plan.json'), JSON.stringify({
      media: { schema: 1, sources: [{ id: 'saved', kind: 'video', path: 'media/saved.mp4', duration: 1, contentHash: clipHash }], placements: [], sequence: [] },
    }));
    const kinotta = openProject(dir);
    expect(await kinotta.mediaFile('saved', { reel: 'founder-talk', version: 2 })).toBe(join(versionDir, 'media/saved.mp4'));
    await vi.waitFor(() => expect(existsSync(proxyOf(dir, clipHash))).toBe(true), MADE_WITHIN);
    expect(await kinotta.mediaFile('saved', { reel: 'founder-talk', version: 2 })).toBe(proxyOf(dir, clipHash));
  }, 60_000);
});
