import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'founder-talk';
/** Seconds 3 to 5 of the 12 s video are snipped; everything after them moves 2 s earlier. */
const SNIP_IN = 3;
const SNIP_OUT = 5;
const SNIPPED = [
  { in: 0, out: SNIP_IN },
  { in: SNIP_OUT, out: 12 },
];

const plan = (pieces?: { in: number; out: number }[]): string => JSON.stringify({ title: 'Founder talk', duration: 12, ...(pieces ? { pieces } : {}) });

function sourceWords(dir: string): { text: string; start: number; end: number }[] {
  return (JSON.parse(readFileSync(join(dir, 'reels', REEL, 'transcript.json'), 'utf8')) as { words: { text: string; start: number; end: number }[] }).words;
}

describe('a version of a footage reel with pieces', () => {
  it('is one piece over the whole video when the reel has no plan', async () => {
    const version = await openProject(copyFixture('footage-project')).readVersion(REEL, 1);

    expect(version.pieces).toEqual([{ in: 0, out: 12, at: 0 }]);
  });

  it('lays out the pieces of the reel plan on the timeline', async () => {
    const dir = copyFixture('footage-project');
    writeFileSync(join(dir, 'reels', REEL, 'plan.json'), plan(SNIPPED));

    const version = await openProject(dir).readVersion(REEL, 1);

    expect(version.pieces).toEqual([
      { in: 0, out: 3, at: 0 },
      { in: 5, out: 12, at: 3 },
    ]);
  });

  it('reads the version\'s own plan before the reel\'s', async () => {
    const dir = copyFixture('footage-project');
    writeFileSync(join(dir, 'reels', REEL, 'plan.json'), plan(SNIPPED));
    writeFileSync(join(dir, 'reels', REEL, 'v1', 'plan.json'), plan([{ in: 1, out: 4 }]));

    const version = await openProject(dir).readVersion(REEL, 1);

    expect(version.pieces).toEqual([{ in: 1, out: 4, at: 0 }]);
  });

  it('puts the transcript on the timeline and drops the words in a snip', async () => {
    const dir = copyFixture('footage-project');
    writeFileSync(join(dir, 'reels', REEL, 'plan.json'), plan(SNIPPED));
    const source = sourceWords(dir);

    const version = await openProject(dir).readVersion(REEL, 1);

    const kept = source.filter((w) => w.start < SNIP_IN || (w.start >= SNIP_OUT && w.start < 12));
    expect(version.transcript?.map((w) => w.text)).toEqual(kept.map((w) => w.text));
    const after = kept.find((w) => w.start >= SNIP_OUT)!;
    expect(version.transcript?.find((w) => w.text === after.text && w.end - w.start > 0 && Math.abs(w.start - (after.start - 2)) < 1e-6)).toBeDefined();
  });

  it('matches a shot\'s spoken line against the timeline, since its line is on the timeline', async () => {
    const dir = copyFixture('footage-project');
    writeFileSync(join(dir, 'reels', REEL, 'plan.json'), plan(SNIPPED));
    const source = sourceWords(dir);

    const version = await openProject(dir).readVersion(REEL, 1);

    // Shot 02's line is 3.2 to 6.2 on the timeline, which is 5.2 to 8.2 in the source.
    const second = version.shots.find((s) => s.number === '02')!;
    const expected = source.filter((w) => w.start >= 5.2 && w.start < 8.2).map((w) => w.text);
    expect(expected.length).toBeGreaterThan(0);
    expect(second.words?.map((w) => w.text)).toEqual(expected);
    expect(second.spoken).toBe(expected.join(' '));
    expect(second.words?.every((w) => w.start >= 3.2 && w.start < 6.2)).toBe(true);
  });

  it('does not set pieces on a reel with no footage', async () => {
    const dir = copyFixture('engine-project');
    mkdirSync(join(dir, 'reels', 'opus-drop'), { recursive: true });

    const version = await openProject(dir).readVersion('opus-drop', 1);

    expect(version.pieces).toBeUndefined();
  });
});
