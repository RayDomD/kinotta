import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'node-html-parser';
import { describe, expect, it } from 'vitest';
import { composePlan, exampleClip } from '../helpers/engine.ts';

const SHOTS_SCRIPT = resolve(import.meta.dirname, '../../skill/kinotta/scripts/shots.py');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

type Word = [string, number, number];

/** Words as [text, start, end]: two sentences with a long pause between them. */
const WORDS: Word[] = [
  ['Hi,', 0.0, 0.4], ['my', 0.5, 0.7], ['name', 0.7, 0.9], ['is', 0.9, 1.0], ['Ryan', 1.0, 1.3], ['Dominic', 1.3, 1.7], ['Vidal', 1.7, 2.0], ['Cruz,', 2.0, 2.4],
  ['a', 2.5, 2.6], ['student', 2.6, 3.0], ['at', 3.0, 3.1], ['<Central>', 3.1, 3.5], ['University.', 3.5, 4.0],
  ['Later', 5.0, 5.3], ['words', 5.3, 5.6],
];

function project(captions: unknown): { dir: string; plan: string } {
  const dir = mkdtempSync(join(tmpdir(), 'kinotta-captions-'));
  writeFileSync(join(dir, 'transcript.json'), JSON.stringify({ words: WORDS.map(([text, start, end]) => ({ text, start, end })) }));
  const plan = {
    title: 'Captions',
    duration: 8,
    transcript: 'transcript.json',
    sections: [{ id: 'all', name: 'All', start: 0, end: 8 }],
    clips: [{ id: '06', title: 'Chapter', in: 0, out: 1.5, kind: 'full', section: 'all', clip: exampleClip('06-chapter.html') }],
    ...(captions === undefined ? {} : { captions }),
  };
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
  return { dir, plan: join(dir, 'plan.json') };
}

function composed(captions: unknown): ReturnType<typeof parse> {
  const { dir, plan } = project(captions);
  composePlan(plan, join(dir, 'page.html'));
  return parse(readFileSync(join(dir, 'page.html'), 'utf8'));
}

describe('captions in a composed plan', () => {
  it('writes each phrase as its own scene with one caption element, word by word', () => {
    const html = composed(true);
    const scenes = html.querySelectorAll('[data-scene][data-caption]');

    expect(scenes.map((s) => s.getAttribute('data-scene'))).toEqual(['cap-001', 'cap-002', 'cap-003']);
    const phrases = scenes.map((s) => s.querySelectorAll('[data-t]').map((w) => w.text).join(' '));
    // Up to 8 words to reach the comma, then a break at the clause end, then a break at the pause.
    expect(phrases).toEqual(['Hi, my name is Ryan Dominic Vidal Cruz,', 'a student at <Central> University.', 'Later words']);
    for (const scene of scenes) {
      expect(scene.querySelectorAll('[data-el]').map((el) => el.getAttribute('data-el'))).toEqual(['caption']);
    }
    expect(Number(scenes[0]!.getAttribute('data-start'))).toBe(0);
    // A short gap holds the phrase until the next one starts; the pause does not.
    expect(Number(scenes[0]!.getAttribute('data-duration'))).toBeCloseTo(2.5, 6);
    expect(Number(scenes[1]!.getAttribute('data-duration'))).toBeCloseTo(1.5, 6);
    expect(Number(scenes[1]!.querySelectorAll('[data-t]')[3]!.getAttribute('data-t'))).toBe(3.1);
  });

  it('puts the look and colour on each caption, highlight and the engine accent by default', () => {
    const plain = composed(true).querySelector('[data-el="caption"]')!;
    expect(plain.getAttribute('data-look')).toBe('highlight');
    expect(plain.getAttribute('style')).toContain('--cap-color:#FF5A1F');

    const chosen = composed({ look: 'words', color: '#3A7BFF' }).querySelector('[data-el="caption"]')!;
    expect(chosen.getAttribute('data-look')).toBe('words');
    expect(chosen.getAttribute('style')).toContain('--cap-color:#3A7BFF');
  });

  it('adds nothing to a plan without captions', () => {
    const html = composed(undefined);

    expect(html.querySelectorAll('[data-caption]')).toHaveLength(0);
    expect(html.toString()).not.toContain('cap-color');
  });

  it('stops on an unknown look', () => {
    const { dir, plan } = project({ look: 'karaoke' });

    expect(() => composePlan(plan, join(dir, 'page.html'))).toThrow(/captions look must be one of/);
  });

  it('gives the shot list one Captions overlay over the spoken span', () => {
    const { dir, plan } = project(true);
    const run = spawnSync(PYTHON, [SHOTS_SCRIPT, plan, join(dir, 'shots.json')], { encoding: 'utf8' });

    expect(run.status, run.stderr).toBe(0);
    const { overlays } = JSON.parse(readFileSync(join(dir, 'shots.json'), 'utf8')) as { overlays: unknown[] };
    expect(overlays).toEqual([{ kind: 'CAPTIONS', name: 'Captions', start: 0, end: 5.6 }]);
  });
});
