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
