import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { emptyProject } from '../helpers/project.ts';

const RATE = 48000;
const LAUNCHER = resolve(import.meta.dirname, '../../bin/kinotta.mjs');
function ffmpeg(args: string[]): Buffer {
  const run = spawnSync('ffmpeg', ['-v', 'error', ...args], { maxBuffer: 64 * 1024 * 1024 });
  expect(run.status, run.stderr.toString()).toBe(0);
  return run.stdout;
}

it('renders centered crop by default, Fit and adjusted framing for video and still pictures', { timeout: 180_000 }, async () => {
  const dir = emptyProject();
  const version = join(dir, 'reels/demo/v1');
  mkdirSync(version, { recursive: true });
  const stripes = 'color=c=lime:s=90x180:r=30:d=1,drawbox=x=0:y=0:w=90:h=60:color=red:t=fill,drawbox=x=0:y=120:w=90:h=60:color=blue:t=fill';
  ffmpeg(['-y', '-f', 'lavfi', '-i', stripes, '-c:v', 'libx264', join(version, 'portrait.mp4')]);
  ffmpeg(['-y', '-i', join(version, 'portrait.mp4'), '-frames:v', '1', join(version, 'portrait.png')]);
  writeFileSync(join(dir, 'reels/demo/reel.json'), JSON.stringify({ title: 'Framing' }));
  writeFileSync(join(version, 'index.html'), '<!doctype html><html class="alpha"><style>html,body{margin:0;background:transparent}#stage{width:160px;height:90px}</style><div id="stage"></div><script>window.DURATION=4;window.seek=()=>{};</script>');
  writeFileSync(join(version, 'shots.json'), JSON.stringify({ schema: 1, shots: [] }));
  writeFileSync(join(version, 'plan.json'), JSON.stringify({ duration: 4, clips: [], media: {
    schema: 1,
    sources: [{ id: 'video', kind: 'video', path: 'portrait.mp4', duration: 1, audio: false }, { id: 'photo', kind: 'image', path: 'portrait.png', duration: 0 }],
    placements: [
      { id: 'crop', role: 'main', source: 'video', in: 0, out: 1 },
      { id: 'fit', role: 'main', source: 'video', in: 0, out: 1, framing: { mode: 'fit' } },
      { id: 'top', role: 'main', source: 'video', in: 0, out: 1, framing: { mode: 'crop', y: 0 } },
      { id: 'photo-bottom', role: 'main', source: 'photo', in: 0, out: 0, duration: 1, framing: { mode: 'crop', y: 1 } },
    ], sequence: ['crop', 'fit', 'top', 'photo-bottom'],
  } }));
  const project = openProject(dir);
  const job = await project.whenRendered((await project.render({ reel: 'demo', version: 1, preset: 'draft', size: 'source', fps: 30 })).id);
  expect(job.error).toBeUndefined();
  const pixels = (frame: number) => ffmpeg(['-i', join(dir, job.output!), '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const checks = [
    [7, 10, 45, [0, 254, 0]], // Crop fills the frame, including its sides.
    [37, 10, 45, [0, 0, 0]], // Fit leaves side bars.
    [37, 80, 10, [253, 0, 0]], // Fit retains the top of the source.
    [67, 80, 45, [253, 0, 0]], // Crop positioned at the top.
    [97, 80, 45, [0, 0, 254]], // Still picture positioned at the bottom.
  ] as const;
  for (const [frame, x, y, color] of checks) {
    const rgb = pixels(frame);
    color.forEach((value, channel) => expect(Math.abs(rgb[(y * 160 + x) * 3 + channel]! - value), `frame ${frame}, channel ${channel}, bytes ${rgb.length}`).toBeLessThan(10));
  }
});

it('renders distinct takes, a gap and a picture insert with the same whole-reel mix in single, segmented and CLI renders', { timeout: 180_000 }, async () => {
  const dir = emptyProject();
  const version = join(dir, 'reels/demo/v1');
  mkdirSync(version, { recursive: true });
  for (const [name, color] of [['red', 'red'], ['blue', 'blue'], ['green', 'lime']] as const) {
    ffmpeg(['-y', '-f', 'lavfi', '-i', `color=c=${color}:s=160x90:r=30:d=1`, '-f', 'lavfi', '-i', `aevalsrc=0.1:s=${RATE}:d=1`, '-c:v', 'libx264', '-c:a', 'pcm_s16le', '-shortest', join(version, `${name}.mov`)]);
  }
  ffmpeg(['-y', '-f', 'lavfi', '-i', `aevalsrc=0.2:s=${RATE}:d=1`, join(version, 'music.wav')]);
  writeFileSync(join(dir, 'reels/demo/reel.json'), JSON.stringify({ title: 'Demo' }));
  writeFileSync(join(version, 'index.html'), '<!doctype html><style>html,body{margin:0;background:transparent;width:160px;height:90px}</style><script>window.DURATION=3;window.seek=()=>{};</script>');
  writeFileSync(join(version, 'shots.json'), JSON.stringify({ schema: 1, shots: [] }));
  writeFileSync(join(version, 'plan.json'), JSON.stringify({ duration: 3, clips: [], media: {
    schema: 1,
    sources: [
      ...['red', 'blue', 'green'].map((id) => ({ id, kind: 'video', path: `${id}.mov`, duration: 1, audio: true })),
      { id: 'music', kind: 'audio', path: 'music.wav', duration: 1 },
    ],
    placements: [
      { id: 'first', role: 'main', source: 'red', in: 0, out: 1 },
      { id: 'gap', role: 'gap', duration: 1 },
      { id: 'second', role: 'main', source: 'blue', in: 0, out: 1 },
      { id: 'product', role: 'insert', source: 'green', in: 0, out: 0.5, at: 0.5 },
      { id: 'song', role: 'audio', source: 'music', in: 0, out: 1, at: 0, duration: 3, loop: true, gain: 1, volume: [{ at: 1, gain: 0 }, { at: 2, gain: 1 }] },
    ], sequence: ['first', 'gap', 'second'],
  } }));

  const audio: Float32Array[] = [];
  for (const segments of [1, 2, 'cli'] as const) {
    let file: string;
    if (segments === 'cli') {
      const run = spawnSync(process.execPath, [LAUNCHER, 'render', 'demo', 'v1', '--preset', 'draft', '--size', 'source', '--fps', '30'], { cwd: dir, encoding: 'utf8', timeout: 180_000 });
      expect(run.status, run.stderr).toBe(0);
      const last = run.stdout.trim().split(/\r?\n/).at(-1)!;
      expect(last).toMatch(/^Rendered /);
      file = last.replace(/^Rendered /, '');
    } else {
      const project = openProject(dir, { renderSegments: segments });
      const job = await project.whenRendered((await project.render({ reel: 'demo', version: 1, preset: 'draft', size: 'source', fps: 30 })).id);
      expect(job.error).toBeUndefined();
      file = join(dir, job.output!);
    }
    for (const [frame, expected] of [[7, [253, 0, 0]], [22, [0, 254, 0]], [45, [0, 0, 0]], [75, [0, 0, 254]]] as const) {
      const rgb = ffmpeg(['-i', file, '-vf', `select=eq(n\\,${frame}),scale=1:1`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
      expected.forEach((value, channel) => expect(Math.abs(rgb[channel]! - value)).toBeLessThan(6));
    }
    // One speaker as heard, as preview plays it. A mono fold-down (-ac 1) would add 3 dB and hide a level mismatch.
    const raw = ffmpeg(['-i', file, '-map', '0:a', '-af', 'pan=mono|c0=FL', '-ar', String(RATE), '-f', 'f32le', '-']);
    const decoded = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
    for (const [at, expected] of [[0.25, 0.25], [0.75, 0.15], [1.5, 0.1], [2.5, 0.3]]) {
      const from = Math.round(at! * RATE);
      const average = decoded.slice(from, from + 480).reduce((sum, value) => sum + value, 0) / 480;
      expect(average).toBeCloseTo(expected!, 2);
    }
    audio.push(decoded);
  }
  for (const decoded of audio.slice(1)) {
    expect(audio[0]!.length).toBe(decoded.length);
    let difference = 0;
    audio[0]!.forEach((sample, i) => { difference = Math.max(difference, Math.abs(sample - decoded[i]!)); });
    expect(difference).toBeLessThan(0.00001);
  }
});

it('switches picture and sound together within one output frame at a cut, at natural speed across frame rates (AM39, S9)', { timeout: 240_000 }, async () => {
  const dir = emptyProject();
  const version = join(dir, 'reels/demo/v1');
  mkdirSync(version, { recursive: true });
  // Take A: red at 25 fps with a quiet tone. Take B: blue at 30 fps with a loud one. Output at 30 fps.
  ffmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=25:d=1.5', '-f', 'lavfi', '-i', `aevalsrc=0.2*sin(2*PI*440*t):s=${RATE}:d=1.5`, '-c:v', 'libx264', '-c:a', 'pcm_s16le', '-shortest', join(version, 'a.mov')]);
  ffmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30:d=1.5', '-f', 'lavfi', '-i', `aevalsrc=0.6*sin(2*PI*440*t):s=${RATE}:d=1.5`, '-c:v', 'libx264', '-c:a', 'pcm_s16le', '-shortest', join(version, 'b.mov')]);
  writeFileSync(join(dir, 'reels/demo/reel.json'), JSON.stringify({ title: 'Cut' }));
  writeFileSync(join(version, 'index.html'), '<!doctype html><style>html,body{margin:0;background:transparent;width:160px;height:90px}</style><script>window.DURATION=2;window.seek=()=>{};</script>');
  writeFileSync(join(version, 'shots.json'), JSON.stringify({ schema: 1, shots: [] }));
  writeFileSync(join(version, 'plan.json'), JSON.stringify({ duration: 2, clips: [], media: {
    schema: 1,
    sources: [{ id: 'a', kind: 'video', path: 'a.mov', duration: 1.5, audio: true }, { id: 'b', kind: 'video', path: 'b.mov', duration: 1.5, audio: true }],
    placements: [{ id: 'first', role: 'main', source: 'a', in: 0.25, out: 1.25 }, { id: 'second', role: 'main', source: 'b', in: 0.5, out: 1.5 }],
    sequence: ['first', 'second'],
  } }));
  const FPS = 30;
  for (const segments of [1, 2]) {
    const project = openProject(dir, { renderSegments: segments });
    const job = await project.whenRendered((await project.render({ reel: 'demo', version: 1, preset: 'draft', size: 'source', fps: FPS })).id);
    expect(job.error).toBeUndefined();
    const file = join(dir, job.output!);
    // Picture: the first blue frame.
    const frames = ffmpeg(['-i', file, '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
    const count = frames.length / 3;
    expect(count).toBe(2 * FPS);
    let pictureCut = -1;
    for (let n = 0; n < count; n++) if (pictureCut < 0 && frames[n * 3 + 2]! > 128 && frames[n * 3]! < 128) pictureCut = n;
    // Sound: the first 1 ms window whose peak passes halfway between the two levels.
    const raw = ffmpeg(['-i', file, '-map', '0:a', '-af', 'pan=mono|c0=FL', '-ar', String(RATE), '-f', 'f32le', '-']);
    const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
    const window = RATE / 1000;
    let soundCut = -1;
    for (let i = 0; soundCut < 0 && i + window <= samples.length; i += window) {
      if (samples.slice(i, i + window).reduce((peak, value) => Math.max(peak, Math.abs(value)), 0) > 0.4) soundCut = i / RATE;
    }
    expect(pictureCut / FPS, `segments ${segments}`).toBeCloseTo(1, 5);
    expect(Math.abs(soundCut - pictureCut / FPS), `segments ${segments}: sound at ${soundCut}s`).toBeLessThan(1 / FPS);
  }
});
