import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('audio generation rejects invalid durations and empty prompts without loading Torch or downloading weights', { timeout: 20_000 }, () => {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const script = resolve('skill/kinotta/scripts/generate_audio.py');
  const out = join(mkdtempSync(join(tmpdir(), 'kinotta-audio-')), 'effect.wav');
  for (const seconds of ['0', '-1', '47.1', 'nan', 'inf']) {
    const run = spawnSync(python, [script, '--prompt', 'Gentle bell', '--seconds', seconds, '--model', 'missing-model', out], { encoding: 'utf8' });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('seconds must be finite, greater than 0 and at most 47');
  }
  const empty = spawnSync(python, [script, '--prompt', ' ', '--seconds', '2', '--model', 'missing-model', out], { encoding: 'utf8' });
  expect(empty.status).toBe(2);
  expect(empty.stderr).toContain('prompt must not be empty');
  const missing = spawnSync(python, [script, '--prompt', 'Bell', '--seconds', '47', '--model', 'missing-model', out], { encoding: 'utf8' });
  expect(missing.status).toBe(2);
  expect(missing.stderr).toContain('model directory not found');
  expect(existsSync(out)).toBe(false);
  expect(spawnSync(python, [script, '--help'], { encoding: 'utf8' }).status).toBe(0);
});
