import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture, emptyProject } from '../helpers/project.ts';

const SLOW_MS = 90_000;
const SAMPLE = 'media/talk.mp4';
/** Long enough that its playback copy is still being made when the import returns. */
const LONG_CLIP_SECONDS = 20;

const sha = (file: string): string => createHash('sha1').update(readFileSync(file)).digest('hex');
/** The editing proxy a video gets in the background, which the editor plays instead of the playback copy once made. */
const proxyOf = (dir: string, file: string): string => join(dir, 'footage', '.proxy', `sha256-${createHash('sha256').update(readFileSync(file)).digest('hex')}.mp4`);

/** A one-second HEVC clip from ffmpeg, a codec browsers do not play. */
function makeHevc(file: string, seconds = 1): void {
  const run = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=640x360:rate=30:duration=${seconds}`, '-c:v', 'libx265', '-pix_fmt', 'yuv420p', file],
    { encoding: 'utf8' },
  );
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr}`);
}

/** Resolves once `file` exists: the playback copy lands after `importVideo` returns. */
async function whenExists(file: string): Promise<void> {
  const POLL_MS = 50;
  while (!existsSync(file)) await new Promise((wake) => setTimeout(wake, POLL_MS));
}

const codecOf = (file: string): string =>
  spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim();

describe('importVideo', () => {
  it('writes a dropped video to footage/ byte for byte, and lists it', { timeout: SLOW_MS }, async () => {
    const source = copyFixture('footage-project');
    const dir = emptyProject();
    const project = openProject(dir);

    const result = await project.importVideo('Founder Talk.mp4', createReadStream(join(source, SAMPLE)));

    expect(result).toEqual({ path: 'footage/Founder Talk.mp4', copied: true, playbackCopy: false });
    expect(sha(join(dir, result.path))).toBe(sha(join(source, SAMPLE)));
    expect(readdirSync(join(dir, 'footage')).filter((f) => !f.startsWith('.'))).toEqual(['Founder Talk.mp4']);
    expect((await project.listVideos()).map((v) => v.path)).toEqual(['footage/Founder Talk.mp4']);
  });

  it('does not copy an identical file twice, whatever it is called', { timeout: SLOW_MS }, async () => {
    const source = copyFixture('footage-project');
    const dir = emptyProject();
    const project = openProject(dir);
    const first = await project.importVideo('talk.mp4', createReadStream(join(source, SAMPLE)));

    const again = await project.importVideo('talk.mp4', createReadStream(join(source, SAMPLE)));
    const renamed = await project.importVideo('copy of talk.mp4', createReadStream(join(source, SAMPLE)));

    expect(again).toEqual({ ...first, copied: false });
    expect(renamed).toEqual({ ...first, copied: false });
    expect(readdirSync(join(dir, 'footage')).filter((f) => !f.startsWith('.'))).toEqual(['talk.mp4']);
  });

  it('keeps a different file that has the same name under a new name', { timeout: SLOW_MS }, async () => {
    const source = copyFixture('footage-project');
    const dir = emptyProject();
    makeHevc(join(dir, 'other.mp4'));
    const project = openProject(dir);
    await project.importVideo('talk.mp4', createReadStream(join(source, SAMPLE)));

    const second = await project.importVideo('talk.mp4', createReadStream(join(dir, 'other.mp4')));

    expect(second).toMatchObject({ path: 'footage/talk-2.mp4', copied: true });
    expect(readdirSync(join(dir, 'footage')).filter((f) => f.endsWith('.mp4')).sort()).toEqual(['talk-2.mp4', 'talk.mp4']);
  });

  it('makes an H.264 playback copy of an HEVC video and leaves the original alone', { timeout: SLOW_MS }, async () => {
    const dir = emptyProject();
    const hevc = join(dir, 'hevc-source.mp4');
    makeHevc(hevc);
    const project = openProject(dir);

    const result = await project.importVideo('clip.mp4', createReadStream(hevc));

    expect(result).toEqual({ path: 'footage/clip.mp4', copied: true, playbackCopy: true });
    await whenExists(join(dir, 'footage/.playback/clip.mp4'));
    expect(sha(join(dir, 'footage/clip.mp4'))).toBe(sha(hevc));
    expect(codecOf(join(dir, 'footage/clip.mp4'))).toBe('hevc');
    expect(codecOf(join(dir, 'footage/.playback/clip.mp4'))).toBe('h264');
    // The copy is not offered as a video of its own.
    expect((await project.listVideos()).map((v) => v.path).filter((p) => p.startsWith('footage/'))).toEqual(['footage/clip.mp4']);
  });

  it('serves the playback copy for a reel whose footage is the HEVC original', { timeout: SLOW_MS }, async () => {
    const dir = emptyProject();
    const hevc = join(dir, 'hevc-source.mp4');
    makeHevc(hevc);
    const project = openProject(dir);
    await project.importVideo('clip.mp4', createReadStream(hevc));
    await whenExists(join(dir, 'footage/.playback/clip.mp4'));
    mkdirSync(join(dir, 'reels', 'r'), { recursive: true });
    writeFileSync(join(dir, 'reels', 'r', 'reel.json'), JSON.stringify({ title: 'r', footage: 'footage/clip.mp4' }));

    expect([join(dir, 'footage', '.playback', 'clip.mp4'), proxyOf(dir, hevc)]).toContain(await project.footageFile('r'));
  });

  it('gives a picked HEVC video an H.264 copy in footage/.playback at start, leaves it where it is, and serves the copy', { timeout: SLOW_MS }, async () => {
    const dir = emptyProject();
    mkdirSync(join(dir, 'media'));
    const hevc = join(dir, 'media', 'clip.mp4');
    makeHevc(hevc);
    const before = sha(hevc);
    const project = openProject(dir, { transcriber: async () => [] });

    const { slug } = await project.startReel({ video: 'media/clip.mp4' });
    await project.whenTranscribed(slug);

    expect(sha(hevc)).toBe(before);
    expect(codecOf(join(dir, 'footage/.playback/media--clip.mp4'))).toBe('h264');
    expect(existsSync(join(dir, 'media', '.playback'))).toBe(false);
    expect([join(dir, 'footage', '.playback', 'media--clip.mp4'), proxyOf(dir, hevc)]).toContain(await project.footageFile(slug));
    expect((await project.listVideos()).map((v) => v.path)).toEqual(['media/clip.mp4']);
  });

  it('returns before the playback copy is made, and starting a reel waits for it', { timeout: SLOW_MS }, async () => {
    const dir = emptyProject();
    const hevc = join(dir, 'hevc-source.mp4');
    makeHevc(hevc, LONG_CLIP_SECONDS);
    const project = openProject(dir, { transcriber: async () => [] });

    const result = await project.importVideo('clip.mp4', createReadStream(hevc));

    expect(result.playbackCopy).toBe(true);
    expect(existsSync(join(dir, 'footage/.playback/clip.mp4'))).toBe(false);
    const { slug } = await project.startReel({ video: result.path });
    expect([join(dir, 'footage', '.playback', 'clip.mp4'), proxyOf(dir, hevc)]).toContain(await project.footageFile(slug));
    expect(codecOf(join(dir, 'footage/.playback/clip.mp4'))).toBe('h264');
    await project.whenTranscribed(slug);
  });

  it('rejects a file that is not a video and leaves nothing behind',{ timeout: SLOW_MS }, async () => {
    const dir = emptyProject();
    const project = openProject(dir);
    const notVideo = join(dir, 'x.txt');
    writeFileSync(notVideo, 'plain text');

    await expect(project.importVideo('notes.txt', createReadStream(notVideo))).rejects.toMatchObject({ code: 'invalid' });
    await expect(project.importVideo('fake.mp4', createReadStream(notVideo))).rejects.toMatchObject({ code: 'invalid' });

    expect(existsSync(join(dir, 'footage')) ? readdirSync(join(dir, 'footage')) : []).toEqual([]);
  });

  it('keeps a name from leaving footage/', { timeout: SLOW_MS }, async () => {
    const source = copyFixture('footage-project');
    const dir = emptyProject();
    const project = openProject(dir);

    const result = await project.importVideo('..\\..\\evil/../talk.mp4', createReadStream(join(source, SAMPLE)));

    expect(result.path).toBe('footage/talk.mp4');
  });
});

describe('removeVideo', () => {
  it('deletes a copied video no reel uses, with its playback copy', { timeout: SLOW_MS }, async () => {
    const source = copyFixture('footage-project');
    const dir = emptyProject();
    const project = openProject(dir);
    const { path } = await project.importVideo('talk.mp4', createReadStream(join(source, SAMPLE)));
    const playback = join(dir, 'footage', '.playback', 'talk.mp4');
    mkdirSync(join(dir, 'footage', '.playback'), { recursive: true });
    writeFileSync(playback, 'copy');

    expect(await project.removeVideo(path)).toEqual({ removed: true });

    expect(existsSync(join(dir, path))).toBe(false);
    expect(existsSync(playback)).toBe(false);
    expect(await project.listVideos()).toEqual([]);
  });

  it('keeps a video a reel uses', { timeout: SLOW_MS }, async () => {
    const source = copyFixture('footage-project');
    const dir = emptyProject();
    const project = openProject(dir);
    const { path } = await project.importVideo('talk.mp4', createReadStream(join(source, SAMPLE)));
    mkdirSync(join(dir, 'reels', 'talk'), { recursive: true });
    writeFileSync(join(dir, 'reels', 'talk', 'reel.json'), JSON.stringify({ title: 'talk', footage: path }));

    expect(await project.removeVideo(path)).toEqual({ removed: false });

    expect(existsSync(join(dir, path))).toBe(true);
  });

  it('refuses a video outside footage/', async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);

    await expect(project.removeVideo(SAMPLE)).rejects.toMatchObject({ code: 'invalid' });
    await expect(project.removeVideo('footage/../media/talk.mp4')).rejects.toMatchObject({ code: 'invalid' });
    expect(existsSync(join(dir, SAMPLE))).toBe(true);
  });
});
