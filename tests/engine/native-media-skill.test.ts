import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { mediaTimeline, mixAt } from '../../server/core/model.ts';
import type { Plan } from '../../server/core/model.ts';

it('the skill audio-track example validates in both engines and retains track levels, fades and loop phase', () => {
  const reference = readFileSync(resolve('skill/kinotta/reference/native-media.md'), 'utf8');
  const plan = JSON.parse(reference.match(/```json\r?\n([\s\S]*?)\r?\n```/)![1]!) as Plan;
  expect(mediaTimeline(plan.media!, plan.duration).duration).toBe(4);
  const at = (time: number) => mixAt(plan.media!, time, plan.duration).find((s) => s.placement === 'music-bed');
  expect(at(0.25)).toMatchObject({ time: 0.25, gain: 0.125 });
  expect(at(2.25)).toMatchObject({ time: 0.25, gain: 0.25 });
  expect(at(3.75)).toMatchObject({ gain: 0.125 });
  expect(mixAt(plan.media!, 4, plan.duration)).toEqual([]);
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const run = spawnSync(python, ['-c', 'import json,sys;sys.path.insert(0,sys.argv[1]);from pieces import timeline_plan;print(json.dumps(timeline_plan(json.load(sys.stdin))))', resolve('skill/kinotta/engine')], { input: JSON.stringify(plan), encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
  expect(JSON.parse(run.stdout).media).toEqual(plan.media);
  const codeOnly = { ...plan.media!, sources: [plan.media!.sources[1]!], placements: [plan.media!.placements[1]!], sequence: [] };
  expect(mediaTimeline(codeOnly, 4).duration).toBe(4);
  expect(mixAt(codeOnly, 2.25, 4)).toEqual([{ placement: 'music-bed', source: 'song', time: 0.25, gain: 0.25 }]);
});
