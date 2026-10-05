import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture, emptyProject } from '../helpers/project.ts';

const SLOW_MS = 90_000;
const SAMPLE = 'media/talk.mp4';

const sha = (file: string): string => createHash('sha1').update(readFileSync(file)).digest('hex');

/** A one-second HEVC clip from ffmpeg, a codec browsers do not play. */
function makeHevc(file: string): void {
  const run = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=10:duration=1', '-c:v', 'libx265', '-pix_fmt', 'yuv420p', file],
    { encoding: 'utf8' },
  );
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr}`);
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
    expect(readdirSync(join(dir, 'footage'))).toEqual(['Founder Talk.mp4']);
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
    expect(readdirSync(join(dir, 'footage'))).toEqual(['talk.mp4']);
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
    mkdirSync(join(dir, 'reels', 'r'), { recursive: true });
    writeFileSync(join(dir, 'reels', 'r', 'reel.json'), JSON.stringify({ title: 'r', footage: 'footage/clip.mp4' }));

    expect(await project.footageFile('r')).toBe(join(dir, 'footage', '.playback', 'clip.mp4'));
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
    expect(await project.footageFile(slug)).toBe(join(dir, 'footage', '.playback', 'media--clip.mp4'));
    expect((await project.listVideos()).map((v) => v.path)).toEqual(['media/clip.mp4']);
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
