import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { applyOperation, mediaWithTracks, mixAt } from '../../server/core/model.ts';
import type { MediaPlan } from '../../server/core/model.ts';
import { emptyProject } from '../helpers/project.ts';

const RATE = 48000;
const DURATION = 2;
function ffmpeg(args: string[]): Buffer {
  const run = spawnSync('ffmpeg', ['-v', 'error', ...args], { maxBuffer: 16 * 1024 * 1024 });
  expect(run.status, run.stderr.toString()).toBe(0);
  return run.stdout;
}

it('decoded renders match preview with track gain, mute, detached insert sound and unchanged old defaults', { timeout: 180_000 }, async () => {
  const dir = emptyProject();
  const version = join(dir, 'reels/demo/v1');
  mkdirSync(version, { recursive: true });
  ffmpeg(['-y', '-f', 'lavfi', '-i', `color=c=black:s=160x90:r=30:d=${DURATION}`, '-f', 'lavfi', '-i', `aevalsrc=0.1:s=${RATE}:d=${DURATION}`, '-c:v', 'libx264', '-c:a', 'pcm_s16le', '-shortest', join(version, 'take.mov')]);
  ffmpeg(['-y', '-f', 'lavfi', '-i', `aevalsrc=0.2:s=${RATE}:d=${DURATION}`, join(version, 'song.wav')]);
  writeFileSync(join(dir, 'reels/demo/reel.json'), JSON.stringify({ title: 'Track parity' }));
  writeFileSync(join(version, 'index.html'), '<!doctype html><html class="alpha"><style>html,body{margin:0;background:transparent}#stage{width:160px;height:90px}</style><div id="stage"></div><script>window.DURATION=2;window.seek=()=>{};</script>');
  writeFileSync(join(version, 'shots.json'), JSON.stringify({ schema: 1, shots: [] }));
  const old: MediaPlan = {
    schema: 1,
    sources: [{ id: 'take', kind: 'video', path: 'take.mov', duration: DURATION, audio: true }, { id: 'song', kind: 'audio', path: 'song.wav', duration: DURATION }],
    placements: [{ id: 'picture', role: 'main', source: 'take', in: 0, out: DURATION }, { id: 'music', role: 'audio', source: 'song', at: 0, in: 0, out: DURATION, gain: 1, volume: [{ at: DURATION, gain: 0 }], fadeIn: 0.5 }],
    sequence: ['picture'],
  };
  const defaults = mediaWithTracks(old);
  const gain = { ...defaults, tracks: defaults.tracks!.map((t) => ({ ...t, gain: t.id === 'track:music' ? 0.5 : 0.8 })) };
  const muted = { ...gain, tracks: gain.tracks.map((t) => ({ ...t, mute: t.id === 'track:speech' })) };
  const inserted: MediaPlan = { ...gain, placements: [...gain.placements, { id: 'insert', role: 'insert', source: 'take', at: 0.5, in: 0, out: 1, mute: false, gain: 0.5 }] };
  const detached = applyOperation({ plan: { media: inserted }, words: [] }, { id: 'detach', kind: 'placement-detach', placement: 'insert', track: 'track:speech' }).plan.media!;
  for (const [name, media] of [['old', old], ['defaults', defaults], ['gain', gain], ['mute', muted], ['detached', detached]] as const) {
    const planFile = join(version, 'plan.json');
    const bytes = JSON.stringify({ duration: DURATION, clips: [], media });
    writeFileSync(planFile, bytes);
    const project = openProject(dir);
    const job = await project.whenRendered((await project.render({ reel: 'demo', version: 1, preset: 'draft', size: 'source', fps: 30 })).id);
    expect(job.error, name).toBeUndefined();
    const raw = ffmpeg(['-i', join(dir, job.output!), '-map', '0:a', '-af', 'pan=mono|c0=FL', '-ar', String(RATE), '-f', 'f32le', '-']);
    const decoded = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
    for (const at of [0.25, 0.75, 1.25, 1.75]) {
      const expected = mixAt(media, at).reduce((sum, p) => sum + p.gain * (p.source === 'song' ? 0.2 : 0.1), 0);
      const window = decoded.slice(Math.round(at * RATE), Math.round(at * RATE) + 480);
      expect(window.length).toBe(480);
      const heard = window.reduce((sum, value) => sum + value, 0) / window.length;
      expect(heard, `${name} at ${at}s`).toBeCloseTo(expected, 2);
    }
    expect(readFileSync(planFile, 'utf8'), 'render leaves the frozen model unchanged').toBe(bytes);
  }
});
