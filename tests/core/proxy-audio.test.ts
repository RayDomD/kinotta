import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { makeEditingProxy, makeAudioFile } from '../../server/core/_internal/runner.ts';
import { mediaAudioFile } from '../../server/core/_internal/media-library.ts';
import { mediaRenderArgs } from '../../server/core/_internal/media-render.ts';
import { mediaAudioUrl } from '../../web/src/api/index.ts';
import { startServer } from '../../server/main.ts';
import type { RunningServer } from '../../server/main.ts';
import { copyFixture, emptyProject } from '../helpers/project.ts';

const SOURCE = 'clip';
let videoBytes: Buffer;
let videoHash: string;

const runningServers: RunningServer[] = [];
afterEach(async () => {
  for (const server of runningServers.splice(0)) await server.close();
});

async function serve(projectDir: string): Promise<string> {
  const server = await startServer({ projectDir, port: 0 });
  runningServers.push(server);
  return server.url;
}

const probe = (file: string, args: string[]): string =>
  spawnSync('ffprobe', ['-v', 'error', ...args, '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim();

beforeAll(() => {
  const file = join(emptyProject(), 'test-clip.mp4');
  // 1920x1080 30fps video with a 1000Hz sine audio track, 2 seconds long
  const run = spawnSync('ffmpeg', [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=2',
    '-c:v', 'libx264', '-c:a', 'aac',
    file,
  ], { encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
  videoBytes = readFileSync(file);
  videoHash = createHash('sha256').update(videoBytes).digest('hex');
});

function setupProjectWithVideo(): { dir: string; videoPath: string; hash: string } {
  const dir = copyFixture('footage-project');
  const footageDir = join(dir, 'footage');
  mkdirSync(footageDir, { recursive: true });
  const videoPath = join(footageDir, 'clip.mp4');
  writeFileSync(videoPath, videoBytes);
  return { dir, videoPath, hash: videoHash };
}

describe('Proxy and Audio makers (runner.ts)', () => {
  it('makeEditingProxy generates H.264, 540p with keyframes every 6 frames', async () => {
    const tempDir = emptyProject();
    const source = join(tempDir, 'source.mp4');
    const proxy = join(tempDir, 'proxy.mp4');
    writeFileSync(source, videoBytes);

    await makeEditingProxy(source, proxy);

    // Verify 540p height and H.264
    expect(probe(proxy, ['-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height'])).toBe('h264,960,540');

    // Verify keyframe every 6 frames
    const pictTypes = probe(proxy, ['-select_streams', 'v:0', '-show_entries', 'frame=pict_type']).split(/[\r\n,]+/).filter(Boolean);
    const iFrameIndices: number[] = [];
    pictTypes.forEach((type, idx) => {
      if (type === 'I') iFrameIndices.push(idx);
    });
    expect(iFrameIndices.length).toBeGreaterThan(1);
    for (let i = 1; i < iFrameIndices.length; i++) {
      expect(iFrameIndices[i]! - iFrameIndices[i - 1]!).toBeLessThanOrEqual(6);
    }
  });

  it('makeAudioFile generates an AAC audio-only file', async () => {
    const tempDir = emptyProject();
    const source = join(tempDir, 'source.mp4');
    const audio = join(tempDir, 'audio.aac');
    writeFileSync(source, videoBytes);

    await makeAudioFile(source, audio);

    // Verify aac codec and no video stream
    const codec = probe(audio, ['-select_streams', 'a:0', '-show_entries', 'stream=codec_name']);
    expect(codec).toBe('aac');
    const videoStream = probe(audio, ['-select_streams', 'v:0', '-show_entries', 'stream=codec_name']);
    expect(videoStream).toBe('');
  });
});

describe('mediaFile serves proxy for editing and original for renders', () => {
  it('serves editing proxy once created, falls back to original/playback beforehand, and original reads never use proxy', async () => {
    const { dir, videoPath, hash } = setupProjectWithVideo();
    const kinotta = openProject(dir);
    const entry = await kinotta.referenceMedia('footage/clip.mp4');

    // Before proxy exists: mediaFile returns the registered file (or playback copy)
    const beforeProxy = await kinotta.mediaFile(entry.id);
    expect(beforeProxy).toBe(videoPath);

    // Create the proxy under footage/.proxy/
    const proxyDir = join(dir, 'footage/.proxy');
    mkdirSync(proxyDir, { recursive: true });
    const proxyFile = join(proxyDir, `sha256-${hash}.mp4`);
    await makeEditingProxy(videoPath, proxyFile);

    // Once proxy exists: mediaFile returns the proxy
    const afterProxy = await kinotta.mediaFile(entry.id);
    expect(afterProxy).toBe(proxyFile);

    // When original is requested: mediaFile returns original, NOT proxy
    const originalFile = await kinotta.mediaFile(entry.id, undefined, true);
    expect(originalFile).toBe(videoPath);

    // mediaRenderArgs uses source.path directly, never the proxy
    const planDir = join(dir, 'reels/founder-talk/v1');
    const renderPlan = {
      schema: 1 as const,
      sources: [{ id: entry.id, kind: 'video' as const, path: '../../footage/clip.mp4', duration: 2, contentHash: hash }],
      placements: [{ id: 'p1', source: entry.id, role: 'insert' as const, in: 0, out: 2, at: 0, duration: 2 }],
      sequence: [],
    };
    const renderArgs = mediaRenderArgs(renderPlan, planDir, 'graphics.mov', 'out.mp4', 2, 1920, 1080, '30', 18);
    // Ensure the ffmpeg inputs for mediaRenderArgs reference the original file, not .proxy
    expect(renderArgs.args.some((arg) => arg.includes('.proxy'))).toBe(false);
    expect(renderArgs.args.some((arg) => arg.includes('clip.mp4'))).toBe(true);
  });
});

describe('GET /api/media/:id/audio and mediaAudioUrl API contract', () => {
  it('mediaAudioUrl builds route with optional reel and version query params', () => {
    expect(mediaAudioUrl('clip-1')).toBe('/api/media/clip-1/audio');
    expect(mediaAudioUrl('clip/special:1', { reel: 'my reel', version: 2 })).toBe('/api/media/clip%2Fspecial%3A1/audio?reel=my+reel&version=2');
  });

  it('GET /api/media/:id/audio returns 404 until made, then 200 with AAC audio', async () => {
    const { dir, videoPath, hash } = setupProjectWithVideo();
    const kinotta = openProject(dir);
    const entry = await kinotta.referenceMedia('footage/clip.mp4');
    const url = await serve(dir);

    // 404 for unknown source
    const resUnknown = await fetch(`${url}/api/media/unknown-source/audio`);
    expect(resUnknown.status).toBe(404);

    // 404 for video without sound
    const silentFile = join(dir, 'footage/silent.mp4');
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=1', '-c:v', 'libx264', silentFile]);
    const silentEntry = await kinotta.referenceMedia('footage/silent.mp4');
    const resSilent = await fetch(`${url}/api/media/${encodeURIComponent(silentEntry.id)}/audio`);
    expect(resSilent.status).toBe(404);

    // 200 after audio file is made for source with sound
    // Wait briefly for background copy or make directly
    const audioPath = join(dir, 'footage/.audio', `sha256-${hash}.aac`);
    const { existsSync } = await import('node:fs');
    if (!existsSync(audioPath)) {
      await makeAudioFile(videoPath, audioPath);
    }
    const resAfter = await fetch(`${url}/api/media/${encodeURIComponent(entry.id)}/audio`);
    expect(resAfter.status).toBe(200);
    expect(resAfter.headers.get('content-type')).toBe('audio/aac');
    expect(resAfter.headers.get('accept-ranges')).toBe('bytes');
    expect(resAfter.headers.get('accept-ranges')).toBe('bytes');
  });
});
