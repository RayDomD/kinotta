// Plan: docs/plans/2026-10-31-stressed-word-captions.md, step 3.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = resolve(import.meta.dirname, '../../skill/kinotta/scripts/stress.py');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const WORDS = [['this', 0.2, 0.5], ['really', 0.6, 0.9], ['changes', 0.9, 1.15], ['everything', 1.2, 1.6], ['for', 1.6, 1.8], ['you', 1.8, 2.1]] as const;

/** A tone at a quarter volume, full volume while `loud` is spoken. */
function take(loud: [number, number] | null): { audio: string; transcript: string } {
  const dir = mkdtempSync(join(tmpdir(), 'kinotta-stress-'));
  const audio = join(dir, 'talk.wav');
  const volume = loud ? `volume='if(between(t,${loud[0]},${loud[1]}),1,0.25)':eval=frame` : 'volume=0.25';
  const made = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=3', '-af', volume, audio], { encoding: 'utf8' });
  expect(made.status, made.stderr).toBe(0);
  const transcript = join(dir, 'transcript.json');
  writeFileSync(transcript, JSON.stringify({ words: WORDS.map(([text, start, end]) => ({ text, start, end })) }));
  return { audio, transcript };
}

const run = (args: string[]) => {
  const out = spawnSync(PYTHON, [SCRIPT, ...args], { encoding: 'utf8' });
  expect(out.status, out.stderr).toBe(0);
  return JSON.parse(out.stdout) as { emphasis: { at: number; placement?: string }[]; words: { text: string; score: number }[] };
};

describe('stress.py', () => {
  it('suggests the louder, longer word of a phrase, named the way captions.emphasis names it', () => {
    const { audio, transcript } = take([1.2, 1.6]);
    const result = run([audio, transcript, '--placement', 'talk']);
    expect(result.emphasis).toEqual([{ at: 1.2, placement: 'talk' }]);
    expect(result.words).toHaveLength(WORDS.length);
  });

  it('suggests nothing when every word is said alike, and never a function word like "for"', () => {
    expect(run([...Object.values(take(null))]).emphasis).toEqual([]);
    expect(run([...Object.values(take([1.6, 1.8]))]).emphasis).toEqual([]);
  });
});
