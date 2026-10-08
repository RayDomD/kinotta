import { spawnSync } from 'node:child_process';
import { createReadStream, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { emptyProject } from '../helpers/project.ts';

describe('project media library', () => {
  it('imports reusable sound by content and restores it with name/type search after reopening', async () => {
    const input = emptyProject();
    const file = join(input, 'tone.wav');
    const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', file], { encoding: 'utf8' });
    expect(generated.status, generated.stderr).toBe(0);
    const dir = emptyProject();
    const project = openProject(dir);

    const first = await project.importMedia('Tone.wav', createReadStream(file));
    const repeat = await project.importMedia('Same sound.wav', createReadStream(file));

    expect(first).toMatchObject({ kind: 'audio', name: 'Tone.wav', copied: true, state: 'ready', duration: 1 });
    expect(repeat).toMatchObject({ id: first.id, path: first.path, copied: false });
    expect(readFileSync(join(dir, first.path))).toEqual(readFileSync(file));
    expect(await project.mediaFile(first.id)).toBe(join(dir, first.path));
    expect(await project.mediaFile('../original.wav')).toBeNull();
    const reopened = openProject(dir);
    expect((await reopened.listMedia({ kind: 'audio', search: 'tone' })).map((s) => s.id)).toEqual([first.id]);
    expect(await reopened.listMedia({ kind: 'image' })).toEqual([]);
  });

  it('keeps failures out of the ready library and retains different same-named sounds for retry', async () => {
    const input = emptyProject();
    const first = join(input, 'first.wav');
    const second = join(input, 'second.wav');
    for (const [file, frequency] of [[first, 440], [second, 880]] as const) {
      const run = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=1`, file], { encoding: 'utf8' });
      expect(run.status, run.stderr).toBe(0);
    }
    const dir = emptyProject();
    const project = openProject(dir);
    const original = await project.importMedia('sound.wav', createReadStream(first));
    async function* interrupted() { yield new Uint8Array([1, 2]); throw new Error('copy interrupted'); }
    await expect(project.importMedia('sound.wav', interrupted())).rejects.toThrow('copy interrupted');
    writeFileSync(join(input, 'invalid.wav'), 'not sound');
    await expect(project.importMedia('sound.wav', createReadStream(join(input, 'invalid.wav')))).rejects.toThrow();
    const retry = await project.importMedia('sound.wav', createReadStream(second));

    expect(retry.path).toBe('footage/sound-2.wav');
    expect(retry.id).not.toBe(original.id);
    expect(readFileSync(join(dir, original.path))).toEqual(readFileSync(first));
    expect((await project.listMedia()).map((s) => s.id)).toEqual([original.id, retry.id]);
    expect(readdirSync(join(dir, 'footage')).filter((name) => name.startsWith('.incoming'))).toEqual([]);
  });

  it('references a project file without copying and relinks only the exact missing content', async () => {
    const dir = emptyProject();
    const file = join(dir, 'original.wav');
    const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', file], { encoding: 'utf8' });
    expect(generated.status, generated.stderr).toBe(0);
    const project = openProject(dir);
    const entry = await project.referenceMedia('original.wav');
    expect(entry).toMatchObject({ path: 'original.wav', copied: false });
    renameSync(file, join(dir, 'moved.wav'));
    expect((await project.listMedia())[0]!.state).toBe('missing');
    writeFileSync(join(dir, 'different.wav'), 'different bytes');
    await expect(project.relinkMedia(entry.id, 'different.wav')).rejects.toThrow('different content');
    expect((await project.listMedia())[0]!.path).toBe('original.wav');
    expect(await project.relinkMedia(entry.id, 'moved.wav')).toMatchObject({ id: entry.id, path: 'moved.wav', state: 'ready' });
    expect((await openProject(dir).listMedia())[0]!.state).toBe('ready');
    writeFileSync(join(dir, 'moved.wav'), 'modified bytes');
    expect((await project.listMedia())[0]!.state).toBe('changed');
    expect(await project.mediaFile(entry.id)).toBeNull();
    await expect(project.referenceMedia('../outside.wav')).rejects.toThrow('inside the project');
  });

  it('leaves no unregistered original behind when preparing a playback copy fails, so a retry keeps the name', async () => {
    const input = emptyProject();
    const good = join(input, 'clip.mp4');
    const run = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=3', '-c:v', 'libx265', '-tag:v', 'hvc1', '-movflags', '+faststart', good], { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    // Truncated HEVC still probes, but its playback copy cannot be made.
    const bytes = readFileSync(good);
    const broken = join(input, 'broken.mp4');
    writeFileSync(broken, bytes.subarray(0, Math.floor(bytes.length / 3)));
    const dir = emptyProject();
    const project = openProject(dir);

    await expect(project.importMedia('clip.mp4', createReadStream(broken))).rejects.toThrow();
    expect(readdirSync(join(dir, 'footage')).filter((name) => !name.startsWith('.'))).toEqual([]);
    expect(await project.listMedia()).toEqual([]);
    expect(await project.importMedia('clip.mp4', createReadStream(good))).toMatchObject({ path: 'footage/clip.mp4', state: 'ready', copied: true });
  }, 60_000);

  it('finds media already in the project that is not in the library yet, so it can be referenced without a copy', async () => {
    const dir = emptyProject();
    mkdirSync(join(dir, 'sounds'), { recursive: true });
    mkdirSync(join(dir, 'reels', 'some-reel'), { recursive: true });
    mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
    const run = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', join(dir, 'sounds', 'bell.wav')], { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    writeFileSync(join(dir, 'photo.png'), 'not checked here');
    writeFileSync(join(dir, 'notes.txt'), 'not media');
    writeFileSync(join(dir, 'reels', 'some-reel', 'inside.wav'), 'a reel file');
    writeFileSync(join(dir, 'node_modules', 'pkg', 'asset.png'), 'a dependency');
    const project = openProject(dir);

    expect(await project.listProjectMedia()).toEqual([
      { path: 'photo.png', name: 'photo.png', kind: 'image', size: 16 },
      { path: 'sounds/bell.wav', name: 'bell.wav', kind: 'audio', size: expect.any(Number) },
    ]);
    await project.referenceMedia('sounds/bell.wav');
    expect((await project.listProjectMedia()).map((file) => file.path)).toEqual(['photo.png']);
  });
});
