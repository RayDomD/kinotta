import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { applyOperation, mediaTimeline } from '../../server/core/model.ts';
import type { Operation, Plan, Sources } from '../../server/core/model.ts';

it('bundles synthesized WAV effects with positive durations', () => {
  const assets = resolve('skill/kinotta/assets/sfx-synth');
  const manifest = JSON.parse(readFileSync(resolve(assets, 'manifest.json'), 'utf8')) as Record<string, { file: string; duration: number; description: string }>;
  expect(Object.keys(manifest)).toHaveLength(17);
  for (const entry of Object.values(manifest)) {
    expect(entry.file).toMatch(/\.wav$/);
    expect(entry.duration).toBeGreaterThan(0);
    expect(entry.description).toEqual(expect.any(String));
    expect(existsSync(resolve(assets, entry.file))).toBe(true);
    const audio = readFileSync(resolve(assets, entry.file));
    expect(audio.toString('ascii', 0, 4)).toBe('RIFF');
    expect(audio.toString('ascii', 8, 12)).toBe('WAVE');
  }
});

it.each(['missing', 'existing', 'partial'] as const)('applies generated score operations with %s tracks', (mode) => {
  const dir = mkdtempSync(resolve(tmpdir(), 'kinotta-score-tracks-'));
  try {
    const tracks = [
      { id: 'speech', name: 'Speech', order: 3, gain: 1, mute: false },
      ...(['music', 'sfx'].filter((id) => mode === 'existing' || (mode === 'partial' && id === 'music'))
        .map((id, index) => ({ id, name: id, order: 5 + index, gain: 0.7, mute: false }))),
    ];
    const plan: Plan = { duration: 4, clips: [], media: {
      schema: 1, sources: [], tracks,
      placements: [{ id: 'gap', role: 'gap', duration: 4 }], sequence: ['gap'],
    } };
    const file = resolve(dir, 'plan.json');
    writeFileSync(file, JSON.stringify({ ...plan, cuts: [1, 2] }));
    const python = process.platform === 'win32' ? 'python' : 'python3';
    const run = spawnSync(python, [resolve('skill/kinotta/scripts/synth.py'), 'score', file, resolve(dir, 'stems')], { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    const operations = run.stdout.trim().split('\n').map((line) => JSON.parse(line) as Operation);
    const additions = operations.filter((op) => op.kind === 'track-add');
    expect(additions.map((op) => op.track.id)).toEqual(mode === 'missing' ? ['music', 'sfx'] : mode === 'partial' ? ['sfx'] : []);
    expect(operations.slice(0, additions.length)).toEqual(additions);
    let sources: Sources = { plan, words: [] };
    operations.forEach((op, index) => { sources = applyOperation(sources, { ...op, id: `score-${index}`, by: 'test' }); });
    expect(sources.plan.media!.tracks).toEqual([...tracks, ...additions.map((op) => op.track)]);
    const placements = mediaTimeline(sources.plan.media!, 4).placements.filter((p) => p.role === 'audio');
    expect(placements.map((p) => [p.id, p.at])).toEqual([['score-bed', 0], ['hit-01', 1], ['hit-02', 2]]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
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

const python = process.platform === 'win32' ? 'python' : 'python3';
const SYNTH_DIR = resolve('skill/kinotta/scripts');
/** Runs a snippet with synth.py importable as `synth`; the snippet prints JSON. */
function runSynth<T>(snippet: string): T {
  const run = spawnSync(python, ['-c', `import sys,json;sys.path.insert(0,${JSON.stringify(SYNTH_DIR)});import synth\n${snippet}`], { encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
  return JSON.parse(run.stdout) as T;
}

it('renders every catalogue recipe at default settings as the committed WAV bytes', () => {
  const mismatched = runSynth<string[]>(`
import scipy.io.wavfile as w, numpy as np, pathlib
assets = pathlib.Path(${JSON.stringify(resolve('skill/kinotta/assets/sfx-synth'))})
bad = []
for name, (fn, _) in synth.CATALOGUE_RECIPES.items():
    _, committed = w.read(str(assets / (name + '.wav')))
    for made in (fn(), fn(sound=synth.Sound())):
        if not np.array_equal(made, committed): bad.append(name)
print(json.dumps(bad))`);
  expect(mismatched).toEqual([]);
});

it('shapes a recipe differently for each setting and is deterministic for the same settings', () => {
  const result = runSynth<{ differs: Record<string, boolean>; again: boolean }>(`
import numpy as np
base = synth.synth_click(seed=7)
cases = {n: synth.synth_click(seed=7, sound=synth.Sound(**{n: 0.9})) for n in ('pitch', 'length', 'brightness', 'weight')}
differs = {n: not np.array_equal(base, s) for n, s in cases.items()}
a = synth.synth_chime(seed=7, sound=synth.Sound(0.2, 0.7, 0.4, 0.9)); b = synth.synth_chime(seed=7, sound=synth.Sound(0.2, 0.7, 0.4, 0.9))
print(json.dumps({'differs': differs, 'again': bool(np.array_equal(a, b))}))`);
  expect(result.differs).toEqual({ pitch: true, length: true, brightness: true, weight: true });
  expect(result.again).toBe(true);
});

it('keeps every recipe at -4 dBFS or below across the whole settings range', () => {
  const worst = runSynth<number>(`
# Each setting alone at both ends, plus the extreme corners where they compound.
combos = [(0.5,)*4] + [tuple(v if j == i else 0.5 for j in range(4)) for i in range(4) for v in (0.0, 1.0)] + [(0.0,)*4, (1.0,)*4, (0.0, 1.0, 1.0, 1.0), (1.0, 0.0, 0.0, 0.0)]
worst = -96.0
for name, (fn, _) in synth.CATALOGUE_RECIPES.items():
    for combo in combos:
        worst = max(worst, synth.measure_peak_dbfs(fn(sound=synth.Sound(*combo))))
# Out-of-range values clamp rather than overload.
worst = max(worst, synth.measure_peak_dbfs(synth.synth_impact_bass_1(sound=synth.Sound(5.0, -3.0, 9.0, 9.0))))
print(json.dumps(worst))`);
  expect(worst).toBeLessThanOrEqual(-4 + 1e-6);
}, 60_000);

it('score gives hits with different sound settings different audio, byte-identically on a rerun', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'kinotta-score-sound-'));
  try {
    const file = resolve(dir, 'plan.json');
    writeFileSync(file, JSON.stringify({ duration: 6, clips: [], hits: [
      { at: 1, sound: { kind: 'click', id: 'send-button', pitch: 0.2, length: 0.3, brightness: 0.8, weight: 0.6 } },
      { at: 2, sound: { kind: 'click', id: 'toggle-switch', pitch: 0.8, length: 0.7, brightness: 0.3, weight: 0.2 } },
      { at: 3, sound: { kind: 'click', id: 'send-button', pitch: 0.2, length: 0.3, brightness: 0.8, weight: 0.6 } },
      { at: 4, effect: 'pop' },
    ] }));
    const render = (out: string) => {
      const run = spawnSync(python, [resolve('skill/kinotta/scripts/synth.py'), 'score', file, resolve(dir, out)], { encoding: 'utf8' });
      expect(run.status, run.stderr).toBe(0);
      return [1, 2, 3, 4].map((n) => readFileSync(resolve(dir, out, `hit-0${n}.wav`)));
    };
    const first = render('a');
    const second = render('b');
    first.forEach((bytes, index) => expect(bytes.equals(second[index]!)).toBe(true));
    expect(first[0]!.equals(first[1]!)).toBe(false);
    // The same id and settings give the same sound wherever the hit sits in the list.
    expect(first[0]!.equals(first[2]!)).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it('runs the sound.md score input example and applies its operations', () => {
  const reference = readFileSync(resolve('skill/kinotta/reference/sound.md'), 'utf8');
  const blocks = [...reference.matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)].map((match) => match[1]!);
  const input = blocks.find((block) => block.includes('"hits"'));
  expect(input, 'sound.md should show a score input with hits').toBeDefined();
  const dir = mkdtempSync(resolve(tmpdir(), 'kinotta-score-example-'));
  try {
    const file = resolve(dir, 'score.json');
    writeFileSync(file, input!);
    const run = spawnSync(python, [resolve('skill/kinotta/scripts/synth.py'), 'score', file, resolve(dir, 'sound')], { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    const operations = run.stdout.trim().split('\n').map((line) => JSON.parse(line) as Operation);
    const plan: Plan = { duration: 12, clips: [], media: { schema: 1, sources: [], tracks: [], placements: [], sequence: [] } };
    let sources: Sources = { plan, words: [] };
    operations.forEach((op, index) => { sources = applyOperation(sources, { ...op, id: `score-${index}`, by: 'test' }); });
    const placements = sources.plan.media!.placements.filter((p) => p.role === 'audio');
    expect(placements.map((p) => [p.id, 'track' in p ? p.track : undefined])).toEqual([['score-bed', 'music'], ['hit-01', 'sfx'], ['hit-02', 'sfx']]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
