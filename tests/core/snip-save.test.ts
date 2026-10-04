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

describe('an agent-built footage reel', () => {
  const SLUG = 'founder-talk';

  it('is edited and saved through the project\'s motion/plan.json, so an agent\'s next build keeps the edit', { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    const reelDir = join(dir, 'reels', SLUG);
    const transcriptBefore = readFileSync(join(reelDir, 'transcript.json'), 'utf8');
    await project.addOperation(SLUG, { kind: 'snip', from: 3.5, to: 5 });

    expect(await project.saveEdits(SLUG)).toEqual({ version: 2 });

    const v2 = join(reelDir, 'v2');
    expect(readdirSync(v2).sort()).toEqual(['edits.json', 'index.html', 'plan.json', 'shots.json', 'transcript.json']);
    expect(readJson(join(v2, 'edits.json'))).toMatchObject({ base: 1, operations: [{ kind: 'snip', from: 3.5, to: 5 }] });
    expect(readJson(join(v2, 'shots.json'))).toMatchObject({ builtBy: 'you', changedSections: ['cold-open', 'sync-problem'] });
    // The sources an agent builds from hold the edit; the reel folder gained no plan of its own.
    expect(readJson(join(dir, 'motion/plan.json')).pieces).toEqual([{ in: 0, out: 3.5 }, { in: 5, out: 12 }]);
    expect(readJson(join(dir, 'motion/plan.json')).clips).toHaveLength(4);
    expect(existsSync(join(reelDir, 'plan.json'))).toBe(false);
    expect(readFileSync(join(reelDir, 'transcript.json'), 'utf8')).toBe(transcriptBefore);
    // The version's own plan finds the footage and the clip fragments from the version folder.
    const own = readJson(join(v2, 'plan.json'));
    expect(own.video).toBe('../../../media/talk.mp4');
    expect(own.clips.map((c: any) => c.clip)).toEqual(['../../../motion/clips/01-two-laptops.html', '../../../motion/clips/02-conflict-counter.html', '../../../motion/clips/03-last-write-wins.html', '../../../motion/clips/04-merge-diagram.html']);
    expect(readJson(join(v2, 'transcript.json')).words).toEqual(readJson(join(reelDir, 'transcript.json')).words);

    const version = await project.readVersion(SLUG, 2);
    expect(version.builtBy).toBe('you');
    expect(version.duration).toBeCloseTo(10.5, 1);
    expect(version.issues).toEqual([]);
    expect(version.claimMismatch).toEqual([]);
    expect(version.shots).toHaveLength(4);
    expect(version.pieces?.map((p) => [p.in, p.at])).toEqual([[0, 0], [5, 3.5]]);
    expect((await project.listVersions(SLUG)).map((v) => [v.number, v.builtBy])).toEqual([[1, undefined], [2, 'you']]);
    expect(existsSync(join(reelDir, 'edit-list.json'))).toBe(false);
  });

  it('carries unsent comments to the saved version at remapped times, and marks the one whose moment was snipped', { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    await project.addComment(SLUG, 1, { pin: { shot: '02', x: 0.5, y: 0.5, element: 'conflict-panel' }, text: 'Bigger count.' });
    await project.addComment(SLUG, 1, { pin: { shot: '03', x: 0.5, y: 0.6, element: null }, text: 'Hold the grey-out longer.' });
    await project.addComment(SLUG, 1, { pin: { kind: 'word', shot: '03', time: 8.65, word: 'lose' }, text: 'Land this word harder.' });
    await project.addOperation(SLUG, { kind: 'snip', from: 6, to: 7 });

    await project.saveEdits(SLUG);

    const v2 = await project.listComments(SLUG, 2);
    expect(v2.map((c) => [c.text, c.pin.shot, c.pin.time, c.state])).toEqual([
      ['Bigger count.', '02', 3.2, undefined],
      ['Hold the grey-out longer.', '03', 6, 'moment-removed'],
      ['Land this word harder.', '03', 7.65, undefined],
    ]);
    expect(v2[0]!.pin).toMatchObject({ element: 'conflict-panel' });
    expect(v2[2]!.pin).toMatchObject({ kind: 'word', word: 'lose' });
    expect((await project.listComments(SLUG, 1)).every((c) => c.carried?.to === 2)).toBe(true);
  });

  it('refuses edits on a code-only reel with a clear reason',{ timeout: SLOW_MS }, async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    const slug = readdirSync(join(dir, 'reels'))[0]!;

    await expect(project.addOperation(slug, { kind: 'snip', from: 1, to: 2 })).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('built from code') });
  });
});

describe('undo, redo and removing one edit', () => {
  const pieceOf = async (project: Project, slug: string): Promise<number> => (await project.readEditList(slug)).operations.length;

  it('steps the list back and forward, and a new edit ends the redo history', { timeout: SLOW_MS }, async () => {
    const { slug, project } = await startedReel();
    await project.addOperation(slug, { kind: 'snip', from: 3, to: 5 });
    await project.addOperation(slug, { kind: 'snip', from: 9, to: 10 });

    const undone = await project.undoEdit(slug);
    expect(undone.operations.map((op) => (op as { from: number }).from)).toEqual([3]);
    expect(undone).toMatchObject({ canUndo: true, canRedo: true });

    expect((await project.redoEdit(slug)).operations).toHaveLength(2);
    expect(await project.readEditList(slug)).toMatchObject({ canUndo: true, canRedo: false });

    await project.undoEdit(slug);
    const changed = await project.addOperation(slug, { kind: 'snip', from: 6, to: 7 });
    expect(changed.canRedo).toBe(false);
    await expect(project.redoEdit(slug)).rejects.toMatchObject({ code: 'invalid' });

    await project.undoEdit(slug);
    await project.undoEdit(slug);
    const empty = await project.undoEdit(slug).then(
      (list) => list,
      (err) => err,
    );
    expect(empty).toMatchObject({ code: 'invalid' });
    expect(await project.readEditList(slug)).toMatchObject({ operations: [], canUndo: false, canRedo: true });
  });

  it('keeps the redo history on disk, so a reopened project still has it', { timeout: SLOW_MS }, async () => {
    const { dir, reelDir, slug, project } = await startedReel();
    await project.addOperation(slug, { kind: 'snip', from: 3, to: 5 });
    await project.addOperation(slug, { kind: 'snip', from: 9, to: 10 });
    await project.undoEdit(slug);

    expect(readJson(join(reelDir, 'edit-list.json'))).toMatchObject({ operations: [{ from: 3 }], redo: [[{ from: 3 }, { from: 9 }]] });
    const reopened = openProject(dir, { transcriber: fakeTranscriber });
    expect(await reopened.readEditList(slug)).toMatchObject({ canUndo: true, canRedo: true });
    expect((await reopened.redoEdit(slug)).operations).toHaveLength(2);
  });

  it('removes one edit and leaves the later ones applied', { timeout: SLOW_MS }, async () => {
    const { reelDir, slug, project } = await startedReel();
    const first = await project.addOperation(slug, { kind: 'snip', from: 3, to: 5 });
    await project.addOperation(slug, { kind: 'snip', from: 9, to: 10 });

    const list = await project.removeOperation(slug, first.operations[0]!.id);

    expect(list.operations.map((op) => (op as { from: number }).from)).toEqual([9]);
    expect(await pieceOf(project, slug)).toBe(1);
    // Save builds the later snip alone: the first stretch of footage is back.
    await project.saveEdits(slug);
    expect(readJson(join(reelDir, 'v2', 'plan.json')).pieces).toEqual([{ in: 0, out: 9 }, { in: 10, out: expect.closeTo(VIDEO_SECONDS, 0) }]);
  });

  it('can undo a removal, and refuses an unknown edit', { timeout: SLOW_MS }, async () => {
    const { slug, project } = await startedReel();
    const list = await project.addOperation(slug, { kind: 'snip', from: 3, to: 5 });
    await project.removeOperation(slug, list.operations[0]!.id);
    expect((await project.undoEdit(slug)).operations).toHaveLength(1);
    await expect(project.removeOperation(slug, 'nope')).rejects.toMatchObject({ code: 'not-found' });
  });

  it('drops the history with Discard and with Save', { timeout: SLOW_MS }, async () => {
    const { reelDir, slug, project } = await startedReel();
    await project.addOperation(slug, { kind: 'snip', from: 3, to: 5 });
    await project.undoEdit(slug);
    expect(await project.discardEdits(slug)).toMatchObject({ canUndo: false, canRedo: false });
    expect(existsSync(join(reelDir, 'edit-list.json'))).toBe(false);

    await project.addOperation(slug, { kind: 'snip', from: 3, to: 5 });
    await project.saveEdits(slug);
    expect(await project.readEditList(slug)).toMatchObject({ operations: [], canUndo: false, canRedo: false });
  });
});

describe('cut and move-piece on Save', () => {
  const SLUG = 'founder-talk';
  const SECTION_CUT = 6;

  it('puts clips, words and sections at their new places and keeps each section one stretch', { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    const reelDir = join(dir, 'reels', SLUG);
    await project.addOperation(SLUG, { kind: 'cut', at: SECTION_CUT });
    const listed = await project.addOperation(SLUG, { kind: 'move-piece', from: 1, to: 0 });
    expect(listed.operations.map((op) => op.kind)).toEqual(['cut', 'move-piece']);

    expect(await project.saveEdits(SLUG)).toEqual({ version: 2 });

    expect(readJson(join(dir, 'motion/plan.json')).pieces).toEqual([{ in: 6, out: 12 }, { in: 0, out: 6 }]);
    expect(readJson(join(reelDir, 'v2', 'shots.json'))).toMatchObject({ builtBy: 'you', changedSections: ['cold-open', 'sync-problem'] });
    const version = await project.readVersion(SLUG, 2);
    expect(version.issues).toEqual([]);
    expect(version.claimMismatch).toEqual([]);
    expect(version.duration).toBeCloseTo(12, 1);
    expect(version.pieces?.map((p) => [p.in, p.at])).toEqual([[6, 0], [0, 6]]);
    // Sections: "sync-problem" now plays first, "cold-open" after it; each is one stretch.
    const sections = (await project.readVersion(SLUG, 2)).sections ?? [];
    expect(sections.map((s) => [s.id, s.start, s.end])).toEqual([['cold-open', 6, 12], ['sync-problem', 0, 6]]);
    // Clips follow their footage: 03 and 04 sit in the first six seconds, 01 in the second six. 02 crosses the cut and the longer half wins.
    const startOf = (id: string): number => version.shots.find((s) => s.number === id)!.start;
    expect(startOf('03')).toBeCloseTo(0.2, 1);
    expect(startOf('04')).toBeCloseTo(3.4, 1);
    expect(startOf('01')).toBeCloseTo(6, 1);
    expect(startOf('02')).toBeCloseTo(9.2, 1);
    // Words move with their piece: one at source second s >= 6 is now at s - 6, one before it at s + 6.
    const source = readJson(join(reelDir, 'transcript.json')).words as { text: string; start: number }[];
    expect(readJson(join(reelDir, 'v2', 'transcript.json')).words).toEqual(source);
    const late = source.find((w) => w.start >= SECTION_CUT)!;
    const early = source.find((w) => w.start < SECTION_CUT)!;
    expect(version.transcript!.find((w) => w.text === late.text && Math.abs(w.start - (late.start - SECTION_CUT)) < 0.01)).toBeDefined();
    expect(version.transcript!.find((w) => w.text === early.text && Math.abs(w.start - (early.start + SECTION_CUT)) < 0.01)).toBeDefined();
  });

  it('refuses a move that would split a section, and says why', { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    await project.addOperation(SLUG, { kind: 'cut', at: SECTION_CUT });
    await project.addOperation(SLUG, { kind: 'cut', at: 4 });

    await expect(project.addOperation(SLUG, { kind: 'move-piece', from: 1, to: 2 })).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('split the section') });
    expect((await project.readEditList(SLUG)).operations).toHaveLength(2);
  });

  it('undoes a move and removes a cut that a later move depends on only if what remains still applies', { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    const first = await project.addOperation(SLUG, { kind: 'cut', at: SECTION_CUT });
    await project.addOperation(SLUG, { kind: 'move-piece', from: 1, to: 0 });
    expect((await project.undoEdit(SLUG)).operations).toHaveLength(1);
    await project.redoEdit(SLUG);
    await expect(project.removeOperation(SLUG, first.operations[0]!.id)).rejects.toMatchObject({ code: 'invalid' });
    expect((await project.readEditList(SLUG)).operations).toHaveLength(2);
  });
});
