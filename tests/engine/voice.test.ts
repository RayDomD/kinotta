import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const SCRIPT = resolve('skill/kinotta/scripts/voice.py');

it('voiceover validates text, speed and local model files before loading the optional runtime', { timeout: 20_000 }, () => {
  const out = join(mkdtempSync(join(tmpdir(), 'kinotta-voice-')), 'voice.wav');
  const args = ['--voice', 'af_sarah', '--model', 'missing.onnx', '--voices', 'missing.bin', out];
  for (const [extra, message] of [
    [['--text', '  '], 'text must not be empty'],
    [['--text', 'Hello', '--speed', 'nan'], 'speed must be finite and positive'],
    [['--text', 'Hello', '--speed', '0'], 'speed must be finite and positive'],
    [['--text', 'Hello'], 'model file not found'],
  ] as const) {
    const run = spawnSync(PYTHON, [SCRIPT, ...args, ...extra], { encoding: 'utf8' });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain(message);
    expect(existsSync(out)).toBe(false);
  }
  const help = spawnSync(PYTHON, [SCRIPT, '--help'], { encoding: 'utf8' });
  expect(help.status).toBe(0);
  expect(help.stdout).toContain('--voice');
});
