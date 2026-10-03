import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPTS = resolve(import.meta.dirname, '../../skill/kinotta/scripts');
const SAMPLE = resolve(import.meta.dirname, '../fixtures/projects/footage-project');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

function run(script: string, args: string[]): { status: number | null; stderr: string } {
  const r = spawnSync(PYTHON, [join(SCRIPTS, script), ...args], { encoding: 'utf8' });
  return { status: r.status, stderr: r.stderr };
}

const temp = (): string => mkdtempSync(join(tmpdir(), 'kinotta-scripts-'));
const json = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

interface Word {
  text: string;
  start: number;
  end: number;
}

describe('transcript.py', () => {
  it('spreads each caption cue across its time, word by word', () => {
    const dir = temp();
    writeFileSync(join(dir, 'talk.srt'), '1\n00:00:01,000 --> 00:00:03,000\nhi there\n\n2\n00:00:04,500 --> 00:00:05,500\nbye\n');

    expect(run('transcript.py', [join(dir, 'talk.srt'), join(dir, 'transcript.json')]).status).toBe(0);
    const { words } = json(join(dir, 'transcript.json')) as { words: Word[] };

    expect(words.map((w) => w.text)).toEqual(['hi', 'there', 'bye']);
    expect(words[0]).toMatchObject({ start: 1 });
    expect(words[1]!.start).toBeGreaterThan(words[0]!.end);
    expect(words[1]!.end).toBeLessThanOrEqual(3);
    expect(words[2]).toMatchObject({ start: 4.5 });
  });

  it('reads WebVTT, with its header, short timestamps and cue tags', () => {
    const dir = temp();
    writeFileSync(join(dir, 'talk.vtt'), 'WEBVTT\n\n00:02.000 --> 00:03.000 align:start\n<v Ana>local first</v>\n');

    expect(run('transcript.py', [join(dir, 'talk.vtt'), join(dir, 'transcript.json')]).status).toBe(0);
    const { words } = json(join(dir, 'transcript.json')) as { words: Word[] };

    expect(words.map((w) => w.text)).toEqual(['local', 'first']);
    expect(words[0]!.start).toBe(2);
  });
});

describe('shots.py', () => {
  it('writes the footage sample\'s shot list from its plan, as committed', () => {
    const out = join(temp(), 'shots.json');

    expect(run('shots.py', [join(SAMPLE, 'motion', 'plan.json'), out]).status).toBe(0);

    expect(json(out)).toEqual(json(join(SAMPLE, 'reels', 'founder-talk', 'v1', 'shots.json')));
  });

  it('starts each shot where its clip has settled, and names the changed sections after the output path', () => {
    const dir = temp();
    const plan = {
      duration: 20,
      sections: [{ id: 'intro', name: 'Intro', start: 0, end: 20 }],
      clips: [
        { id: '01', title: 'Long clip', in: 2, out: 8, kind: 'full', section: 'intro' },
        { id: '02', title: 'Short clip', in: 10, out: 11, kind: 'panel', section: 'intro', description: 'A pill pops in.' },
      ],
    };
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));

    expect(run('shots.py', [join(dir, 'plan.json'), join(dir, 'shots.json'), 'intro']).status).toBe(0);
    const file = json(join(dir, 'shots.json')) as { changedSections: string[]; shots: Array<Record<string, unknown>> };

    expect(file.changedSections).toEqual(['intro']);
    expect(file.shots[0]).toMatchObject({ number: '01', start: 3, type: 'cutaway', description: 'Long clip', line: { start: 2, end: 8 } });
    expect(file.shots[1]).toMatchObject({ number: '02', start: 10.5, type: 'panel', description: 'A pill pops in.', section: 'intro' });
  });

  it('lists shots in time order when a later-numbered clip comes earlier, as a batch adds them', () => {
    const dir = temp();
    const plan = {
      duration: 30,
      sections: [{ id: 'a', name: 'A', start: 0, end: 30 }],
      clips: [
        { id: '01', title: 'First', in: 0, out: 5, kind: 'full', section: 'a' },
        { id: '02', title: 'Third', in: 20, out: 25, kind: 'full', section: 'a' },
        { id: '03', title: 'Added between', in: 10, out: 15, kind: 'panel', section: 'a' },
      ],
    };
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));

    expect(run('shots.py', [join(dir, 'plan.json'), join(dir, 'shots.json')]).status).toBe(0);
    const { shots } = json(join(dir, 'shots.json')) as { shots: Array<{ number: string }> };

    expect(shots.map((s) => s.number)).toEqual(['01', '03', '02']);
  });

  it('stops on a clip with no section', () => {
    const dir = temp();
    const plan = { duration: 5, sections: [{ id: 'a', name: 'A', start: 0, end: 5 }], clips: [{ id: '01', title: 'x', in: 0, out: 2, kind: 'full' }] };
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));

    const result = run('shots.py', [join(dir, 'plan.json'), join(dir, 'shots.json')]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('clip 01: "section" must be one of');
  });
});
