import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const HAS_LIBROSA = spawnSync(PYTHON, ['-c', 'import importlib.util,sys;sys.exit(0 if importlib.util.find_spec("librosa") else 1)']).status === 0;
it.skipIf(!HAS_LIBROSA)('detects a 120 BPM accented click track and returns silence without invented beats', { timeout: 120_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'kinotta-beats-'));
  const audio = join(dir, 'click.wav'); const output = join(dir, 'beats.json');
  const make = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', "aevalsrc='if(lt(mod(t,0.5),0.015),if(lt(mod(t,2),0.015),0.8,0.2)*sin(2*PI*1000*t),0)':s=22050:d=12", audio], { encoding: 'utf8' });
  expect(make.status, make.stderr).toBe(0);
  const run = spawnSync(PYTHON, [resolve('skill/kinotta/scripts/beats.py'), audio, output], { encoding: 'utf8', timeout: 100_000 });
  expect(run.status, run.stderr).toBe(0);
  const grid = JSON.parse(readFileSync(output, 'utf8'));
  expect(grid.tempo).toBeCloseTo(120, 0);
  expect(grid.beats.length).toBeGreaterThanOrEqual(20);
  for (const beat of grid.beats) expect(Math.abs(beat - Math.round(beat * 2) / 2)).toBeLessThan(0.025);
  expect(grid.downbeats.length).toBeGreaterThanOrEqual(4);
  for (const beat of grid.downbeats) expect(Math.abs(beat - Math.round(beat / 2) * 2)).toBeLessThan(0.025);
  const corrected = spawnSync(PYTHON, [resolve('skill/kinotta/scripts/beats.py'), audio, output, '--beats-per-bar', '3', '--first-downbeat', '2'], { encoding: 'utf8', timeout: 30_000 });
  expect(corrected.status, corrected.stderr).toBe(0);
  expect(JSON.parse(readFileSync(output, 'utf8')).downbeats).toEqual(grid.beats.filter((_: number, index: number) => index >= 2 && (index - 2) % 3 === 0));
  const quiet = join(dir, 'silence.wav');
  expect(spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono', '-t', '2', quiet]).status).toBe(0);
  const silent = spawnSync(PYTHON, [resolve('skill/kinotta/scripts/beats.py'), quiet, output], { encoding: 'utf8', timeout: 30_000 });
  expect(silent.status, silent.stderr).toBe(0);
  expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({ tempo: 0, beats: [], downbeats: [] });
});

it('reports how to install the optional runtime and validates arguments without loading it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kinotta-beats-args-'));
  const audio = join(dir, 'silent.wav');
  expect(spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono', '-t', '1', audio]).status).toBe(0);
  const script = resolve('skill/kinotta/scripts/beats.py');
  const missing = spawnSync(PYTHON, ['-S', script, audio], { encoding: 'utf8' });
  expect(missing.status).toBe(2); expect(missing.stderr).toContain('pip install librosa==0.11.0');
  const invalid = spawnSync(PYTHON, ['-S', script, audio, '--beats-per-bar', '0'], { encoding: 'utf8' });
  expect(invalid.status).toBe(2); expect(invalid.stderr).toContain('beats per bar must be 1-12');
  expect(spawnSync(PYTHON, ['-S', script, '--help']).status).toBe(0);
});
