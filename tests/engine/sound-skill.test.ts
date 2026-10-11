import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { mediaTimeline } from '../../server/core/model.ts';
import type { Plan } from '../../server/core/model.ts';

it('bundles all 19 effects with their credits and validates the sound reference plan in both engines', () => {
  const assets = resolve('skill/kinotta/assets/sfx');
  const manifest = JSON.parse(readFileSync(resolve(assets, 'manifest.json'), 'utf8')) as Record<string, { file: string; duration: number }>;
  expect(Object.keys(manifest)).toHaveLength(19);
  for (const entry of Object.values(manifest)) {
    expect(existsSync(resolve(assets, entry.file))).toBe(true);
    expect(entry.duration).toBeGreaterThan(0);
  }
  expect(existsSync(resolve(assets, 'CREDITS.md'))).toBe(true);
  expect(existsSync(resolve(assets, 'LICENSE-Apache-2.0.txt'))).toBe(true);
  const reference = readFileSync(resolve('skill/kinotta/reference/sound.md'), 'utf8');
  const plan = JSON.parse(reference.match(/```json\r?\n([\s\S]*?)\r?\n```/)![1]!) as Plan;
  expect(mediaTimeline(plan.media!, plan.duration).duration).toBe(4);
  expect(plan.media!.placements[0]).toMatchObject({ role: 'audio', track: 'sfx', gain: 0.35, out: manifest.pop!.duration });
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const run = spawnSync(python, ['-c', 'import json,sys;sys.path.insert(0,sys.argv[1]);from pieces import timeline_plan;timeline_plan(json.load(sys.stdin))', resolve('skill/kinotta/engine')], { input: JSON.stringify(plan), encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
});
