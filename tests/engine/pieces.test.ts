import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'node-html-parser';
import { describe, expect, it } from 'vitest';
import { composePlan, exampleClip } from '../helpers/engine.ts';

const SHOTS_SCRIPT = resolve(import.meta.dirname, '../../skill/kinotta/scripts/shots.py');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const BUILD_TIMEOUT_MS = 60_000;

/** Seconds 3 to 6 of a 12 s video are snipped. */
const SNIPPED = [
  { in: 0, out: 3 },
  { in: 6, out: 12 },
];

const WORDS = [
  ['one', 0.5, 0.9], ['two', 1.0, 1.4], ['three', 1.5, 2.0], ['inside', 3.5, 3.9], ['snip', 4.0, 4.4], ['five', 5.0, 5.4],
  ['after', 6.5, 6.9], ['the', 7.0, 7.2], ['cut', 7.3, 7.8], ['edge', 8.8, 9.2],
] as const;

const clip = (id: string, from: number, to: number): object => ({
  id, title: `Clip ${id}`, in: from, out: to, kind: 'full', section: 'all', clip: exampleClip('06-chapter.html'),
});

interface Built {
  scenes: { name: string; start: number; duration: number }[];
  captionWords: string[][];
  shots: { number: string; start: number; line: { start: number; end: number } }[];
  overlays: { start: number; end: number }[];
  sections: { id: string; start: number; end: number }[];
  duration: number;
  page: ReturnType<typeof parse>;
}

function build(plan: Record<string, unknown>): Built {
  const dir = mkdtempSync(join(tmpdir(), 'kinotta-pieces-'));
  writeFileSync(join(dir, 'transcript.json'), JSON.stringify({ words: WORDS.map(([text, start, end]) => ({ text, start, end })) }));
  writeFileSync(join(dir, 'plan.json'), JSON.stringify({ title: 'Pieces', transcript: 'transcript.json', captions: true, ...plan }));
  composePlan(join(dir, 'plan.json'), join(dir, 'page.html'));
  const run = spawnSync(PYTHON, [SHOTS_SCRIPT, join(dir, 'plan.json'), join(dir, 'shots.json')], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`shots.py failed: ${run.stderr}`);
  const page = parse(readFileSync(join(dir, 'page.html'), 'utf8'));
  const shots = JSON.parse(readFileSync(join(dir, 'shots.json'), 'utf8')) as { duration: number; sections: Built['sections']; shots: Built['shots']; overlays: Built['overlays'] };
  const scenes = page.querySelectorAll('[data-scene]:not([data-caption])').map((s) => ({
    name: s.getAttribute('data-scene')!, start: Number(s.getAttribute('data-start')), duration: Number(s.getAttribute('data-duration')),
  }));
  const captionWords = page.querySelectorAll('[data-caption]').map((s) => s.querySelectorAll('[data-t]').map((w) => w.text));
  return { scenes, captionWords, shots: shots.shots, overlays: shots.overlays, sections: shots.sections, duration: shots.duration, page };
}

const PLAN = {
  duration: 12,
  sections: [{ id: 'all', name: 'All', start: 0, end: 12 }],
  pieces: SNIPPED,
  clips: [clip('01', 0, 2), clip('02', 3.2, 5.5), clip('03', 2, 4.5), clip('04', 5, 8), clip('05', 8, 11)],
};

describe('engine plan with pieces', () => {
  it('puts scenes, shots, sections and the page length on the timeline', { timeout: BUILD_TIMEOUT_MS }, () => {
    const built = build(PLAN);

    expect(built.scenes.map((s) => [s.start, s.duration])).toEqual([[0, 2], [2, 1], [3, 2], [5, 3]]);
    expect(built.shots.map((s) => [s.number, s.line.start, s.line.end])).toEqual([['01', 0, 2], ['03', 2, 3], ['04', 3, 5], ['05', 5, 8]]);
    expect(built.sections).toEqual([{ id: 'all', name: 'All', start: 0, end: 9 }]);
    expect(built.duration).toBe(9);
    expect(built.page.toString()).toContain('M.page(9)');
  });

  it('drops a clip inside a snip and trims one straddling it to the edge', { timeout: BUILD_TIMEOUT_MS }, () => {
    const built = build(PLAN);

    expect(built.shots.map((s) => s.number)).not.toContain('02');
    // 03 ran 2 to 4.5 in the source: only 2 to 3 is left. 04 ran 5 to 8: only 6 to 8, closed up to 3 to 5.
    expect(built.shots.find((s) => s.number === '03')?.line).toEqual({ start: 2, end: 3 });
    expect(built.shots.find((s) => s.number === '04')?.line).toEqual({ start: 3, end: 5 });
  });

  it('leaves words and caption phrases in a snip out of the page and the shot list', { timeout: BUILD_TIMEOUT_MS }, () => {
    const built = build(PLAN);

    expect(built.captionWords).toEqual([['one', 'two', 'three'], ['after', 'the', 'cut'], ['edge']]);
    expect(Number(built.page.querySelectorAll('[data-caption]')[1]!.getAttribute('data-start'))).toBeCloseTo(3.5, 6);
    expect(built.overlays).toEqual([{ kind: 'CAPTIONS', name: 'Captions', start: 0.5, end: 6.2 }]);
  });

  it('plays reordered pieces in list order', { timeout: BUILD_TIMEOUT_MS }, () => {
    const built = build({ ...PLAN, pieces: [{ in: 6, out: 12 }, { in: 0, out: 3 }], clips: [clip('01', 0, 2), clip('05', 8, 11)] });

    expect(built.shots.map((s) => [s.number, s.line.start, s.line.end])).toEqual([['05', 2, 5], ['01', 6, 8]]);
    expect(built.captionWords.flat()).toEqual(['after', 'the', 'cut', 'edge', 'one', 'two', 'three']);
  });

  it('builds a plan with one whole-video piece the same as a plan without pieces', { timeout: BUILD_TIMEOUT_MS }, () => {
    const a = build({ ...PLAN, pieces: undefined });
    const b = build({ ...PLAN, pieces: [{ in: 0, out: 12 }] });

    expect(b.scenes).toEqual(a.scenes);
    expect(b.shots).toEqual(a.shots);
    expect(b.captionWords).toEqual(a.captionWords);
  });

  it('stops on overlapping pieces', { timeout: BUILD_TIMEOUT_MS }, () => {
    expect(() => build({ ...PLAN, pieces: [{ in: 0, out: 5 }, { in: 4, out: 8 }] })).toThrow('overlap');
  });
});
