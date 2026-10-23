import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { mediaTimeline } from '../../server/core/model.ts';
import type { Plan } from '../../server/core/model.ts';

it('bundles synthesized WAV effects with positive durations', () => {
  // The generator lane may not have delivered its catalogue yet.
  const assets = existsSync(resolve('skill/kinotta/assets/sfx-synth/manifest.json'))
    ? resolve('skill/kinotta/assets/sfx-synth') : resolve('tests/fixtures/sfx-synth');
  const manifest = JSON.parse(readFileSync(resolve(assets, 'manifest.json'), 'utf8')) as Record<string, { file: string; duration: number; description: string }>;
  expect(Object.keys(manifest).length).toBeGreaterThan(0);
  for (const entry of Object.values(manifest)) {
    expect(entry.file).toMatch(/\.wav$/);
    expect(entry.duration).toBeGreaterThan(0);
    expect(entry.description).toEqual(expect.any(String));
    const audio = readFileSync(resolve(assets, entry.file));
    expect(audio.toString('ascii', 0, 4)).toBe('RIFF');
    expect(audio.toString('ascii', 8, 12)).toBe('WAVE');
  }
});

it('validates the sound reference plan in both engines', () => {
  const reference = readFileSync(resolve('skill/kinotta/reference/sound.md'), 'utf8');
  const plan = JSON.parse(reference.match(/```json\r?\n([\s\S]*?)\r?\n```/)![1]!) as Plan;
  expect(mediaTimeline(plan.media!, plan.duration).duration).toBe(4);
  expect(plan.media!.placements[0]).toMatchObject({ role: 'audio', track: 'sfx', gain: 0.35, out: plan.media!.sources[0]!.duration });
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const run = spawnSync(python, ['-c', 'import json,sys;sys.path.insert(0,sys.argv[1]);from pieces import timeline_plan;timeline_plan(json.load(sys.stdin))', resolve('skill/kinotta/engine')], { input: JSON.stringify(plan), encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
});
