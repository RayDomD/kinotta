import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { applyOperation, mixAt } from '../../server/core/model.ts';
import type { Operation, Plan } from '../../server/core/model.ts';
import { emptyProject } from '../helpers/project.ts';

it('prints a duck operation for the agent without changing the plan or writing an edit list', { timeout: 20_000 }, () => {
  const dir = emptyProject();
  const file = join(dir, 'plan.json');
  const plan: Plan = { duration: 4, media: { schema: 1, tracks: [
    { id: 'music', name: 'Music', order: 0, gain: 1, mute: false }, { id: 'voice', name: 'Voice', order: 1, gain: 1, mute: false },
  ], sources: [
    { id: 'bed', kind: 'audio', path: 'bed.wav', duration: 4 }, { id: 'talk', kind: 'audio', path: 'talk.wav', duration: 4, words: [{ text: 'Hello', start: 1, end: 2 }] },
  ], placements: [
    { id: 'song', role: 'audio', source: 'bed', track: 'music', at: 0, in: 0, out: 4 },
    { id: 'narration', role: 'audio', source: 'talk', track: 'voice', at: 0, in: 0, out: 4, speech: true },
  ], sequence: [] } };
  const bytes = JSON.stringify(plan);
  writeFileSync(file, bytes);
  const run = spawnSync(process.execPath, ['bin/kinotta.mjs', 'duck', '--plan', file, '--placement', 'song', '--speech-track', 'voice', '--amount', '20'], { encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
  const operation = JSON.parse(run.stdout) as Operation;
  const edited = applyOperation({ plan, words: [] }, { ...operation, id: 'agent' });
  expect(mixAt(edited.plan.media!, 1.5, 4).find((p) => p.placement === 'song')!.gain).toBeCloseTo(0.1);
  expect(readFileSync(file, 'utf8')).toBe(bytes);
  const bad = spawnSync(process.execPath, ['bin/kinotta.mjs', 'duck', '--plan', file, '--placement', 'song', '--speech-track', 'voice', '--amount', '-1'], { encoding: 'utf8' });
  expect(bad.status).toBe(1);
  expect(bad.stderr).toContain('Ducking');
});
