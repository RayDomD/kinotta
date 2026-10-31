// Plan: docs/plans/2026-10-31-style-from-examples.md, step 2.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = resolve(import.meta.dirname, '../../skill/kinotta/scripts/measure_style.py');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

/** A clip of solid shots `seconds` long each, at `size`, with a tone under it. */
function clip(dir: string, name: string, seconds: number[], size: string): string {
  const file = join(dir, name);
  const colors = ['red', 'blue', 'green', 'white'];
  const inputs = seconds.flatMap((s, i) => ['-f', 'lavfi', '-i', `color=c=${colors[i % colors.length]}:s=${size}:r=30:d=${s}`]);
  const total = seconds.reduce((a, b) => a + b, 0);
  const made = spawnSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-f', 'lavfi', '-i', `sine=frequency=300:duration=${total}`,
    '-filter_complex', `${seconds.map((_, i) => `[${i}]`).join('')}concat=n=${seconds.length}:v=1:a=0[v]`, '-map', '[v]', '-map', `${seconds.length}`, '-c:v', 'libx264', '-c:a', 'aac', '-shortest', file], { encoding: 'utf8' });
  expect(made.status, made.stderr).toBe(0);
  return file;
}

const run = (args: string[]) => {
  const out = spawnSync(PYTHON, [SCRIPT, ...args], { encoding: 'utf8' });
  return { status: out.status, stderr: out.stderr, json: out.status === 0 ? JSON.parse(out.stdout) : null };
};

describe('measure_style.py', () => {
  it('measures each reference: frame shape, cuts, shot pace, loudness and, with a transcript, speech pace', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kinotta-measure-'));
    const portrait = clip(dir, 'portrait.mp4', [2, 3, 1], '180x320');
    const transcript = join(dir, 'words.json');
    writeFileSync(transcript, JSON.stringify({ words: [{ text: 'a', start: 0, end: 0.5 }, { text: 'b', start: 1, end: 1.5 }, { text: 'c', start: 1.5, end: 2 }] }));
    const { json } = run([portrait, '--transcripts', transcript]);
    const [ref] = json.references;
    expect(ref).toMatchObject({ shape: '9:16', width: 180, height: 320, duration: 6, cuts: [2, 5], shotsPerMinute: 30, medianShot: 2, wordsPerMinute: 90, medianPause: 0.5 });
    expect(ref.loudness).toBeLessThan(0);
    expect(json.summary).toBeUndefined();
  });

  it('summarises several references with their spread, and names mixed frame shapes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kinotta-measure-'));
    const fast = clip(dir, 'fast.mp4', [1, 1, 1, 1], '180x320');
    const slow = clip(dir, 'slow.mp4', [4], '320x180');
    const { json } = run([fast, slow]);
    expect(json.summary.shotsPerMinute).toMatchObject({ min: 15, max: 60, of: 2 });
    expect(json.summary.shape).toEqual(['16:9', '9:16']);
  });

  it('refuses transcripts that do not pair with the references', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kinotta-measure-'));
    const one = clip(dir, 'one.mp4', [1], '180x320');
    const result = run([one, one, '--transcripts', join(dir, 'missing.json')]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('one transcript per reference');
  });
});
