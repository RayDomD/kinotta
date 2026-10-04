import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import type { Project, Transcriber } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const SLOW_MS = 120_000;
const VIDEO = 'media/talk.mp4';
const VIDEO_SECONDS = 12;
const WORDS = [
  { text: 'hello', start: 0.5, end: 0.9 },
  { text: 'there', start: 1, end: 1.4 },
  { text: 'friends.', start: 1.5, end: 2 },
  { text: 'later', start: 8.2, end: 8.6 },
];
const fakeTranscriber: Transcriber = async () => WORDS;

const readJson = (path: string): any => JSON.parse(readFileSync(path, 'utf8'));

/** A reel started from the sample video, with one clip over its first words. */
async function startedReel(): Promise<{ dir: string; reelDir: string; slug: string; project: Project }> {
  const dir = copyFixture('footage-project');
  const project = openProject(dir, { transcriber: fakeTranscriber });
  const { slug } = await project.startReel({ video: VIDEO, title: 'Snippy' });
  const reelDir = join(dir, 'reels', slug);
  mkdirSync(join(reelDir, 'clips'));
  cpSync(join(dir, 'motion/clips/01-two-laptops.html'), join(reelDir, 'clips/01-two-laptops.html'));
  const plan = readJson(join(reelDir, 'plan.json'));
  plan.clips = [{ id: '01', title: 'Two laptops', in: 0, out: 3.2, kind: 'full', section: 'all', still: 0, description: 'Two laptops.' }];
  writeFileSync(join(reelDir, 'plan.json'), JSON.stringify(plan));
  return { dir, reelDir, slug, project };
}

describe('the edit list', () => {
  it('keeps each operation in the reel folder, outside every version, as it is added', { timeout: SLOW_MS }, async () => {
    const { reelDir, slug, project } = await startedReel();

    const list = await project.addOperation(slug, { kind: 'snip', from: 3, to: 5 });

    expect(list.operations).toMatchObject([{ kind: 'snip', from: 3, to: 5 }]);
    expect(list.operations[0]!.id).toBeTruthy();
    expect(readJson(join(reelDir, 'edit-list.json'))).toMatchObject({ base: 1, operations: [{ kind: 'snip', from: 3, to: 5 }] });
    expect(readdirSync(join(reelDir, 'v1')).sort()).toEqual(['index.html', 'plan.json', 'shots.json', 'transcript.json']);
    // A new project object reads the same list back.
    expect((await openProject(join(reelDir, '../..')).readEditList(slug)).operations).toHaveLength(1);
  });

  it('refuses a snip that does not apply, and keeps what is there', { timeout: SLOW_MS }, async () => {
    const { slug, project } = await startedReel();
    await project.addOperation(slug, { kind: 'snip', from: 3, to: 5 });

    await expect(project.addOperation(slug, { kind: 'snip', from: 5, to: 3 })).rejects.toMatchObject({ code: 'invalid' });
    await expect(project.addOperation(slug, { kind: 'snip', from: 3.5, to: 4.5 })).rejects.toMatchObject({ code: 'invalid' });
    await expect(project.addOperation(slug, { kind: 'snip', from: 0, to: VIDEO_SECONDS })).rejects.toMatchObject({ code: 'invalid' });
    expect((await project.readEditList(slug)).operations).toHaveLength(1);
  });

  it('is dropped by Discard', { timeout: SLOW_MS }, async () => {
    const { reelDir, slug, project } = await startedReel();
    await project.addOperation(slug, { kind: 'snip', from: 3, to: 5 });

    const list = await project.discardEdits(slug);

    expect(list.operations).toEqual([]);
    expect(existsSync(join(reelDir, 'edit-list.json'))).toBe(false);
    expect(existsSync(join(reelDir, 'v2'))).toBe(false);
  });
});

describe('Save', () => {
  it('builds the next version from the sources with its own transcript and plan, then clears the list', { timeout: SLOW_MS }, async () => {
    const { reelDir, slug, project } = await startedReel();
    await project.addOperation(slug, { kind: 'snip', from: 3, to: 5 });

    expect(await project.saveEdits(slug)).toEqual({ version: 2 });

    const v2 = join(reelDir, 'v2');
    expect(readdirSync(v2).sort()).toEqual(['edits.json', 'index.html', 'plan.json', 'shots.json', 'transcript.json']);
    expect(readJson(join(v2, 'edits.json'))).toMatchObject({ base: 1, operations: [{ kind: 'snip', from: 3, to: 5 }] });
    expect(readJson(join(v2, 'shots.json'))).toMatchObject({ builtBy: 'you', changedSections: ['all'] });
    expect(readJson(join(v2, 'plan.json')).pieces).toEqual([{ in: 0, out: 3 }, { in: 5, out: expect.closeTo(VIDEO_SECONDS, 0) }]);
    expect(readJson(join(v2, 'transcript.json')).words).toEqual(WORDS);
    // The reel's sources hold the edit, and nothing is left over.
    expect(readJson(join(reelDir, 'plan.json')).pieces).toHaveLength(2);
    expect(existsSync(join(reelDir, 'edit-list.json'))).toBe(false);
    expect(existsSync(join(reelDir, '.save'))).toBe(false);
    expect((await project.readEditList(slug)).operations).toEqual([]);

    const version = await project.readVersion(slug, 2);
    expect(version.builtBy).toBe('you');
    expect(version.duration).toBeCloseTo(VIDEO_SECONDS - 2, 1);
    expect(version.pieces?.map((p) => [p.in, p.at])).toEqual([[0, 0], [5, 3]]);
    expect(version.issues).toEqual([]);
    expect(version.claimMismatch).toEqual([]);
    expect(version.changedSections).toEqual(['all']);
    // The clip's fragment was found from the version folder, and the snip sits after the clip's words.
    expect(version.shots).toHaveLength(1);
    expect(version.transcript?.map((w) => [w.text, w.start])).toEqual([['hello', 0.5], ['there', 1], ['friends.', 1.5], ['later', expect.closeTo(6.2, 5)]]);
    expect((await project.listVersions(slug)).map((v) => [v.number, v.builtBy])).toEqual([[1, 'you'], [2, 'you']]);
  });

  it('leaves no new version, the sources as they were and the list in place when the build fails', { timeout: SLOW_MS }, async () => {
    const { reelDir, slug, project } = await startedReel();
    await project.addOperation(slug, { kind: 'snip', from: 3, to: 5 });
    const plan = readJson(join(reelDir, 'plan.json'));
    plan.clips[0].clip = 'clips/missing.html';
    writeFileSync(join(reelDir, 'plan.json'), JSON.stringify(plan));
    const before = readFileSync(join(reelDir, 'plan.json'), 'utf8');

    await expect(project.saveEdits(slug)).rejects.toThrow();

    expect(readdirSync(reelDir).filter((name) => /^v\d+$/.test(name))).toEqual(['v1']);
    expect(existsSync(join(reelDir, '.save'))).toBe(false);
    expect(readFileSync(join(reelDir, 'plan.json'), 'utf8')).toBe(before);
    expect((await project.readEditList(slug)).operations).toHaveLength(1);
  });

  it('refuses an empty list', { timeout: SLOW_MS }, async () => {
    const { slug, project } = await startedReel();
    await expect(project.saveEdits(slug)).rejects.toMatchObject({ code: 'invalid' });
  });

  it('keeps an older version\'s spoken lines when a later version corrects a word', { timeout: SLOW_MS }, async () => {
    const { reelDir, slug, project } = await startedReel();
    await project.addOperation(slug, { kind: 'snip', from: 3, to: 5 });
    await project.saveEdits(slug);
    // A word is corrected in the reel's transcript, then a second Save builds v3 from it.
    const transcriptFile = join(reelDir, 'transcript.json');
    writeFileSync(transcriptFile, JSON.stringify({ words: WORDS.map((w) => (w.text === 'hello' ? { ...w, text: 'howdy' } : w)) }));
    await project.addOperation(slug, { kind: 'snip', from: 10, to: 11 });
    await project.saveEdits(slug);

    const spoken = async (n: number): Promise<string | undefined> => (await project.readVersion(slug, n)).shots[0]?.spoken;
    expect(await spoken(2)).toBe('hello there friends.');
    expect(await spoken(3)).toBe('howdy there friends.');
  });
});
