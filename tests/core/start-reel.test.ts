import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KinottaError, openProject } from '../../server/core/index.ts';
import type { Transcriber } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const LAUNCHER = resolve(import.meta.dirname, '../../bin/kinotta.mjs');
const SERVER_DIR = resolve(import.meta.dirname, '../../server');
const SLOW_MS = 90_000;
const VIDEO = 'media/talk.mp4';
const VIDEO_SECONDS = 12;

const WORDS = [
  { text: 'hello', start: 0.5, end: 0.9 },
  { text: 'there', start: 1, end: 1.4 },
  { text: 'friends.', start: 1.5, end: 2 },
];
const fakeTranscriber: Transcriber = async () => WORDS;

const readJson = (path: string): any => JSON.parse(readFileSync(path, 'utf8'));
const fingerprint = (path: string): string => `${createHash('sha1').update(readFileSync(path)).digest('hex')} ${statSync(path).mtimeMs}`;

function check(projectDir: string, slug: string): { status: number | null; stdout: string } {
  const run = spawnSync(process.execPath, [LAUNCHER, 'check', slug], { cwd: projectDir, encoding: 'utf8', timeout: SLOW_MS });
  return { status: run.status, stdout: run.stdout };
}

describe('listVideos', () => {
  it('lists the project videos with length, codec and size, not those inside reels', { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);

    const videos = await project.listVideos();

    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({ path: VIDEO, name: 'talk.mp4', codec: 'h264', suggestedTitle: 'talk' });
    expect(videos[0]!.duration).toBeCloseTo(VIDEO_SECONDS, 0);
    expect(videos[0]!.size).toBe(statSync(join(dir, VIDEO)).size);
  });

  it('is empty in a project with no videos', async () => {
    expect(await openProject(copyFixture('showreel-project')).listVideos()).toEqual([]);
  });
});

describe('startReel', () => {
  it('writes the reel and a v1 built by you, and leaves the video alone', { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    const before = fingerprint(join(dir, VIDEO));
    const files = readdirSync(join(dir, 'media'));
    const project = openProject(dir, { transcriber: fakeTranscriber });

    const { slug } = await project.startReel({ video: VIDEO, title: 'My Talk' });
    await project.whenTranscribed(slug);

    expect(slug).toBe('my-talk');
    const reelDir = join(dir, 'reels', slug);
    expect(readJson(join(reelDir, 'reel.json'))).toEqual({ title: 'My Talk', footage: VIDEO });
    expect(readJson(join(reelDir, 'transcript.json')).words).toEqual(WORDS);
    const plan = readJson(join(reelDir, 'plan.json'));
    expect(plan).toMatchObject({ clips: [], captions: true, pieces: [{ in: 0, out: expect.closeTo(VIDEO_SECONDS, 0) }] });
    const shots = readJson(join(reelDir, 'v1', 'shots.json'));
    expect(shots.builtBy).toBe('you');
    expect(existsSync(join(reelDir, 'v1', 'index.html'))).toBe(true);
    expect(readdirSync(join(reelDir, 'v1')).sort()).toEqual(['index.html', 'plan.json', 'shots.json', 'transcript.json']);
    // The video is not copied, moved or rewritten.
    expect(readdirSync(join(dir, 'media'))).toEqual(files);
    expect(fingerprint(join(dir, VIDEO))).toBe(before);
  });

  it('gives a v1 that opens with the words as captions and passes kinotta check', { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir, { transcriber: fakeTranscriber });

    const { slug } = await project.startReel({ video: VIDEO, title: 'Checked' });
    await project.whenTranscribed(slug);
    const version = await project.readVersion(slug, 1);

    expect(version.issues).toEqual([]);
    expect(version.footage).toEqual({ path: VIDEO, exists: true });
    expect(version.transcript).toEqual(WORDS);
    expect(version.overlays.map((o) => o.kind)).toEqual(['CAPTIONS']);
    expect(check(dir, slug)).toMatchObject({ status: 0, stdout: expect.stringContaining('no contract issues') });
    expect((await project.listReels()).reels.map((r) => [r.slug, r.title, r.newestVersion])).toContainEqual([slug, 'Checked', 1]);
  });

  it('takes the name from the file name when none is given, and keeps slugs unique', { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir, { transcriber: fakeTranscriber });

    const first = await project.startReel({ video: VIDEO });
    const second = await project.startReel({ video: VIDEO });
    await Promise.all([project.whenTranscribed(first.slug), project.whenTranscribed(second.slug)]);

    expect(readJson(join(dir, 'reels', first.slug, 'reel.json')).title).toBe('talk');
    expect([first.slug, second.slug]).toEqual(['talk', 'talk-2']);
  });

  it('rejects a video that is not in the project, or that does not exist', async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir, { transcriber: fakeTranscriber });

    await expect(project.startReel({ video: '../outside.mp4' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(project.startReel({ video: 'media/missing.mp4' })).rejects.toBeInstanceOf(KinottaError);
    expect(existsSync(join(dir, 'reels', 'talk'))).toBe(false);
  });

  it('keeps the reel without a version when transcription fails, and says why', { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir, {
      transcriber: async () => {
        throw new Error('faster-whisper is not installed');
      },
    });

    const { slug } = await project.startReel({ video: VIDEO, title: 'Broken' });
    await project.whenTranscribed(slug);

    expect(project.transcriptionProgress(slug)).toMatchObject({ state: 'failed', error: expect.stringContaining('faster-whisper is not installed') });
    const reelDir = join(dir, 'reels', 'broken');
    expect(readJson(join(reelDir, 'reel.json')).footage).toBe(VIDEO);
    expect(existsSync(join(reelDir, 'v1'))).toBe(false);
  });
});

describe('the runner', () => {
  it('is the only module that names the skill scripts or starts Python', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.ts$/.test(entry.name) && !path.endsWith('runner.ts') && /python|\.py\b|ffprobe/i.test(readFileSync(path, 'utf8'))) offenders.push(path);
      }
    };
    walk(SERVER_DIR);

    expect(offenders).toEqual([]);
  });
});
