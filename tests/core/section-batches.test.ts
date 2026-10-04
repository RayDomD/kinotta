import { cpSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KinottaError, openProject } from '../../server/core/index.ts';
import type { Comment } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'founder-talk';
const COLD = 'cold-open';
const SYNC = 'sync-problem';
const COLD_PIN = { shot: '01', x: 0.3, y: 0.4, element: 'document' };
const COLD_PIN_TWO = { shot: '02', x: 0.5, y: 0.5, element: 'conflict-panel' };
const SYNC_PIN = { shot: '03', x: 0.5, y: 0.6, element: null };
const SYNC_WORD = { kind: 'word', shot: '03', time: 8.65, word: 'lose' } as const;

interface ShotsFile {
  duration: number;
  sections: Array<{ id: string; name: string; start: number; end: number }>;
  changedSections?: string[];
  shots: Array<{ number: string; start: number; title: string; description: string; section: string; type: string; line: unknown }>;
}

interface Edits {
  /** The version's own plan.json, as a Save writes it: the pieces of the footage it plays. */
  plan?: { pieces: Array<{ in: number; out: number }> };
  shots?(file: ShotsFile): void;
  html?(page: string): string;
}

/** A new version the way an agent writes one: a copy of `from`, changed as asked. */
function addVersion(dir: string, from: number, to: number, edits: Edits = {}): void {
  const source = join(dir, 'reels', REEL, `v${from}`);
  const target = join(dir, 'reels', REEL, `v${to}`);
  cpSync(source, target, { recursive: true });
  for (const name of ['comments.json', `comments-${COLD}.json`, `comments-${SYNC}.json`]) rmSync(join(target, name), { force: true });
  if (edits.plan) writeFileSync(join(target, 'plan.json'), JSON.stringify(edits.plan));
  if (edits.shots) {
    const shotsFile = join(target, 'shots.json');
    const file = JSON.parse(readFileSync(shotsFile, 'utf8')) as ShotsFile;
    edits.shots(file);
    writeFileSync(shotsFile, JSON.stringify(file, null, 2));
  }
  if (edits.html) writeFileSync(join(target, 'index.html'), edits.html(readFileSync(join(target, 'index.html'), 'utf8')));
}

const renameShot = (number: string, title: string) => (file: ShotsFile) => {
  file.shots.find((s) => s.number === number)!.title = title;
};

const batchFile = (dir: string, version: number, name: string): string => join(dir, 'reels', REEL, `v${version}`, name);
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const texts = (comments: Comment[]): string[] => comments.map((c) => c.text);

async function withComments() {
  const dir = copyFixture('footage-project');
  const project = openProject(dir);
  await project.addComment(REEL, 1, { pin: COLD_PIN, text: 'Slide the laptops in faster.' });
  await project.addComment(REEL, 1, { pin: COLD_PIN_TWO, text: 'Bigger count.' });
  await project.addComment(REEL, 1, { pin: SYNC_PIN, text: 'Hold the grey-out longer.' });
  await project.addComment(REEL, 1, { pin: SYNC_WORD, text: 'Land this word harder.' });
  return { dir, project };
}

describe('section batches', () => {
  it('covers only the asked-for section: file, fields and text', async () => {
    const { dir, project } = await withComments();

    const result = await project.copyBatch(REEL, 1, { section: COLD });

    expect(result.file).toBe(`reels/${REEL}/v1/comments-${COLD}.json`);
    expect(result.count).toBe(2);
    expect(result.text).toContain('Kinotta comments: Founder talk: going local-first, v1, section 01 Cold open');
    expect(result.text).toContain('1. Shot 01, 00.00s, document: Slide the laptops in faster.');
    expect(result.text).toContain('2. Shot 02, 03.20s, conflict-panel: Bigger count.');
    expect(result.text).not.toContain('grey-out');
    const saved = readJson<{ section: string; comments: Array<{ shot: string }> }>(batchFile(dir, 1, `comments-${COLD}.json`));
    expect(saved.section).toBe(COLD);
    expect(saved.comments.map((c) => c.shot)).toEqual(['01', '02']);
    expect(existsSync(batchFile(dir, 1, 'comments.json'))).toBe(false);
    expect(existsSync(batchFile(dir, 1, `comments-${SYNC}.json`))).toBe(false);
  });

  it('keeps the numbers the comments column shows, and puts the reel note in every section batch', async () => {
    const { dir, project } = await withComments();
    await project.setNote(REEL, 1, 'Keep it punchy.');

    const sync = await project.copyBatch(REEL, 1, { section: SYNC });
    const cold = await project.copyBatch(REEL, 1, { section: COLD });

    expect(sync.text).toContain('section 02 The sync problem');
    expect(sync.text).toContain('3. Shot 03, 06.20s, position 50% 60%: Hold the grey-out longer.');
    expect(sync.text).toContain('\nNotes\n- Keep it punchy.\n');
    expect(cold.text).toContain('\nNotes\n- Keep it punchy.\n');
    expect(readJson<{ notes: string[] }>(batchFile(dir, 1, `comments-${SYNC}.json`)).notes).toEqual(['Keep it punchy.']);
  });

  it('needs a known section on a reel with several', async () => {
    const { project } = await withComments();

    await expect(project.copyBatch(REEL, 1)).rejects.toMatchObject({ code: 'invalid' });
    await expect(project.copyBatch(REEL, 1, { section: 'nope' })).rejects.toBeInstanceOf(KinottaError);
  });

  it('refuses a section with no comments and no note, and writes nothing', async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    await project.addComment(REEL, 1, { pin: COLD_PIN, text: 'Only here.' });

    await expect(project.copyBatch(REEL, 1, { section: SYNC })).rejects.toMatchObject({ code: 'invalid' });
    expect(existsSync(batchFile(dir, 1, `comments-${SYNC}.json`))).toBe(false);
  });

  it('records each copy as the latest hand-off of its section, replacing an earlier one', async () => {
    const { dir, project } = await withComments();
    await project.copyBatch(REEL, 1, { section: COLD });
    const stateFile = join(dir, 'reels', '.kinotta', REEL, 'v1.json');
    const first = readJson<{ handedOff: Record<string, { commentIds: string[] }> }>(stateFile).handedOff;
    expect(first[COLD]!.commentIds).toHaveLength(2);
    expect(first[SYNC]).toBeUndefined();

    await project.addComment(REEL, 1, { pin: { ...COLD_PIN, x: 0.9 }, text: 'A third.' });
    await project.copyBatch(REEL, 1, { section: COLD });

    const again = readJson<{ handedOff: Record<string, { commentIds: string[] }> }>(stateFile).handedOff;
    expect(again[COLD]!.commentIds).toHaveLength(3);
    expect(readJson<{ comments: unknown[] }>(batchFile(dir, 1, `comments-${COLD}.json`)).comments).toHaveLength(3);
    const listed = await project.listComments(REEL, 1);
    expect(listed.filter((c) => c.sent).length).toBe(3);
    expect(listed.filter((c) => !c.sent).length).toBe(2);
  });
});

describe('change detection', () => {
  it('finds the section whose shot title changed, and only that one', async () => {
    const dir = copyFixture('footage-project');
    addVersion(dir, 1, 2, { shots: renameShot('01', 'Two laptops, one file') });

    const v2 = await openProject(dir).readVersion(REEL, 2);

    expect(v2.changedSections).toEqual([COLD]);
    expect(v2.claimMismatch).toEqual([]);
  });

  it('finds a changed scene page, judged by markup', async () => {
    const dir = copyFixture('footage-project');
    addVersion(dir, 1, 2, { html: (page) => page.replace('data-el="laptop-left"', 'data-el="laptop-left" title="left"') });

    expect((await openProject(dir).readVersion(REEL, 2)).changedSections).toEqual([COLD]);
  });

  it('finds a changed section field, and a new section', async () => {
    const dir = copyFixture('footage-project');
    addVersion(dir, 1, 2, { shots: (f) => (f.sections[1]!.name = 'The merge problem') });
    addVersion(dir, 2, 3, {
      shots: (f) => {
        f.sections.push({ id: 'wrap', name: 'Wrap', start: 12, end: 14 });
        f.duration = 14;
      },
    });
    const project = openProject(dir);

    expect((await project.readVersion(REEL, 2)).changedSections).toEqual([SYNC]);
    expect((await project.readVersion(REEL, 3)).changedSections).toEqual(['wrap']);
  });

  it('finds nothing in an identical copy', async () => {
    const dir = copyFixture('footage-project');
    addVersion(dir, 1, 2);

    const v2 = await openProject(dir).readVersion(REEL, 2);

    expect(v2.changedSections).toEqual([]);
    expect(v2.claimMismatch).toEqual([]);
  });

  it('counts a claim as changed even when the contents match, and reports the mismatch', async () => {
    const dir = copyFixture('footage-project');
    addVersion(dir, 1, 2, { shots: (f) => (f.changedSections = [SYNC]) });

    const v2 = await openProject(dir).readVersion(REEL, 2);

    expect(v2.changedSections).toEqual([SYNC]);
    expect(v2.claimMismatch).toEqual([SYNC]);
  });

  it('does not believe a claim of unchanged', async () => {
    const dir = copyFixture('footage-project');
    addVersion(dir, 1, 2, {
      shots: (f) => {
        f.changedSections = [];
        renameShot('03', 'Last write always wins')(f);
      },
    });

    const v2 = await openProject(dir).readVersion(REEL, 2);

    expect(v2.changedSections).toEqual([SYNC]);
    expect(v2.claimMismatch).toEqual([SYNC]);
  });

  it('treats the single section of a one-section reel as changed when anything differs', async () => {
    const project = openProject(copyFixture('showreel-project'));

    expect((await project.readVersion('product-showreel', 2)).changedSections).toEqual(['reel']);
  });

  it('lists the changed sections of each version on the version rail, for reels with several', async () => {
    const dir = copyFixture('footage-project');
    addVersion(dir, 1, 2, { shots: renameShot('03', 'Last write always wins') });

    const entries = await openProject(dir).listVersions(REEL);

    expect(entries).toEqual([
      { number: 1, isNewest: false, isStoryboard: true },
      { number: 2, isNewest: true, isStoryboard: false, changedSections: [SYNC] },
    ]);
  });
});

describe('carry-forward', () => {
  it('moves every unsent comment, even in a changed section, and keeps the sent ones on the old version', async () => {
    const { project, dir } = await withComments();
    await project.copyBatch(REEL, 1, { section: COLD });
    await project.addComment(REEL, 1, { pin: { ...COLD_PIN, x: 0.9 }, text: 'Added after the copy.' });
    addVersion(dir, 1, 2, { shots: renameShot('01', 'Two laptops, one file') });

    const v2 = await project.listComments(REEL, 2);

    expect(texts(v2).sort()).toEqual(['Added after the copy.', 'Hold the grey-out longer.', 'Land this word harder.']);
    expect(v2.every((c) => c.pin.version === 2 && c.state === undefined)).toBe(true);
    const word = v2.find((c) => c.pin.kind === 'word')!;
    expect(word.pin).toMatchObject({ kind: 'word', shot: '03', section: SYNC, time: 8.65, word: 'lose' });
    const added = v2.find((c) => c.text === 'Added after the copy.')!;
    expect(added.pin).toMatchObject({ kind: 'frame', shot: '01', section: COLD, time: 0, x: 0.9, y: 0.4, element: 'document' });
    const v1 = await project.listComments(REEL, 1);
    expect(v1).toHaveLength(5);
    for (const text of ['Hold the grey-out longer.', 'Land this word harder.', 'Added after the copy.']) {
      expect(v1.find((c) => c.text === text)!.carried).toEqual({ to: 2 });
    }
    expect(v1.find((c) => c.text === 'Bigger count.')).toMatchObject({ sent: true });
    expect(v1.find((c) => c.text === 'Bigger count.')!.carried).toBeUndefined();
    expect(v2.map((c) => c.id).some((id) => v1.some((c) => c.id === id))).toBe(false);
  });

  it('leaves nothing behind: every unsent comment of a changed section moves too', async () => {
    const { project, dir } = await withComments();
    addVersion(dir, 1, 2, { shots: renameShot('01', 'Two laptops, one file') });

    expect(await project.listComments(REEL, 2)).toHaveLength(4);
    expect((await project.listComments(REEL, 1)).every((c) => c.carried?.to === 2)).toBe(true);
  });

  it('keeps sent comments, on an unchanged section too, on the old version', async () => {
    const { project, dir } = await withComments();
    await project.copyBatch(REEL, 1, { section: SYNC });
    addVersion(dir, 1, 2, { shots: renameShot('01', 'Two laptops, one file') });

    expect(texts(await project.listComments(REEL, 2)).sort()).toEqual(['Bigger count.', 'Slide the laptops in faster.']);
    const v1 = await project.listComments(REEL, 1);
    expect(v1.filter((c) => c.sent).map((c) => c.text).sort()).toEqual(['Hold the grey-out longer.', 'Land this word harder.']);
    expect(v1.filter((c) => c.sent).every((c) => c.carried === undefined)).toBe(true);
  });

  it('moves a comment onto the shot that plays at its moment when the numbers shifted', async () => {
    const { project, dir } = await withComments();
    addVersion(dir, 1, 2, {
      shots: (f) => {
        f.shots.splice(2, 0, { number: '03', start: 4.5, title: 'An extra beat', description: 'New.', section: COLD, type: 'panel', line: { start: 4.5, end: 5.5 } });
        f.shots[3]!.number = '04';
        f.shots[4]!.number = '05';
      },
    });

    const v2 = await project.listComments(REEL, 2);

    expect(v2.map((c) => [c.text, c.pin.shot]).sort()).toEqual([
      ['Bigger count.', '02'],
      ['Hold the grey-out longer.', '04'],
      ['Land this word harder.', '04'],
      ['Slide the laptops in faster.', '01'],
    ]);
  });

  describe('through a snip', () => {
    /** v2 as a Save builds it after snipping the footage from 4s to 7s: its own plan with two pieces, shots at the new times. */
    const snipped = (dir: string): void =>
      addVersion(dir, 1, 2, {
        plan: { pieces: [{ in: 0, out: 4 }, { in: 7, out: 12 }] },
        shots: (f) => {
          f.duration = 9;
          f.sections = [{ id: COLD, name: 'Cold open', start: 0, end: 4 }, { id: SYNC, name: 'The sync problem', start: 4, end: 9 }];
          f.shots[2]!.start = 4;
          f.shots[2]!.line = { start: 4, end: 6.4 };
          f.shots[3]!.start = 6.4;
          f.shots[3]!.line = { start: 6.4, end: 9 };
        },
      });

    it('puts the comments at their remapped times', async () => {
      const { project, dir } = await withComments();
      snipped(dir);

      const v2 = await project.listComments(REEL, 2);

      const word = v2.find((c) => c.pin.kind === 'word')!;
      expect(word.pin).toMatchObject({ shot: '03', section: SYNC, time: 5.65, word: 'lose' });
      expect(word.state).toBeUndefined();
      expect(v2.find((c) => c.text === 'Bigger count.')!.pin).toMatchObject({ shot: '02', time: 3.2, element: 'conflict-panel' });
      expect(v2.find((c) => c.text === 'Slide the laptops in faster.')!.pin).toMatchObject({ shot: '01', time: 0, element: 'document' });
    });

    it('keeps a comment whose moment was snipped, marked moment-removed, where the snip closed up', async () => {
      const { project, dir } = await withComments();
      snipped(dir);

      const gone = (await project.listComments(REEL, 2)).find((c) => c.text === 'Hold the grey-out longer.')!;

      expect(gone.state).toBe('moment-removed');
      expect(gone.pin).toMatchObject({ version: 2, shot: '03', section: SYNC, time: 4, x: 0.5, y: 0.6 });
      expect(gone.carried).toBeUndefined();
      expect((await project.listComments(REEL, 1)).find((c) => c.text === 'Hold the grey-out longer.')!.carried).toEqual({ to: 2 });
      await project.deleteComment(REEL, 2, gone.id);
      expect(texts(await project.listComments(REEL, 2))).not.toContain('Hold the grey-out longer.');
    });

    it('keeps the mark on the next version, and the comment follows the closed-up place', async () => {
      const { project, dir } = await withComments();
      snipped(dir);
      addVersion(dir, 2, 3);

      const v3 = await project.listComments(REEL, 3);

      expect(v3.find((c) => c.text === 'Hold the grey-out longer.')).toMatchObject({ state: 'moment-removed', pin: { time: 4 } });
      expect(v3.find((c) => c.text === 'Land this word harder.')).toMatchObject({ pin: { time: 5.65 } });
      expect(v3.filter((c) => c.state === undefined)).toHaveLength(3);
    });

    it('follows reordered pieces', async () => {
      const { project, dir } = await withComments();
      addVersion(dir, 1, 2, { plan: { pieces: [{ in: 6, out: 12 }, { in: 0, out: 6 }] } });

      const v2 = await project.listComments(REEL, 2);

      expect(v2.find((c) => c.text === 'Hold the grey-out longer.')!.pin.time).toBe(0.2);
      expect(v2.find((c) => c.text === 'Land this word harder.')!.pin.time).toBe(2.65);
      expect(v2.find((c) => c.text === 'Bigger count.')!.pin.time).toBe(9.2);
    });
  });

  it('settles once: reading again changes nothing', async () => {
    const { project, dir } = await withComments();
    addVersion(dir, 1, 2, { shots: renameShot('01', 'Two laptops, one file') });
    const first = await project.listComments(REEL, 2);
    const oldState = join(dir, 'reels', '.kinotta', REEL, 'v1.json');
    const newState = join(dir, 'reels', '.kinotta', REEL, 'v2.json');
    const before = [readFileSync(oldState, 'utf8'), readFileSync(newState, 'utf8')];

    const second = await project.listComments(REEL, 2);
    await project.readVersion(REEL, 2);
    await project.listComments(REEL, 1);

    expect(second.map((c) => c.id)).toEqual(first.map((c) => c.id));
    expect([readFileSync(oldState, 'utf8'), readFileSync(newState, 'utf8')]).toEqual(before);
  });

  it('settles when the watcher sees the new version, before anyone reads it', async () => {
    const { project, dir } = await withComments();
    const seen: number[] = [];
    const unsubscribe = project.subscribe((event) => {
      if (event.type === 'version-added') seen.push(event.version);
    });
    addVersion(dir, 1, 2);
    const deadline = Date.now() + 4000;
    while (seen.length === 0 && Date.now() < deadline) await new Promise((done) => setTimeout(done, 25));
    unsubscribe();

    expect(seen).toEqual([2]);
    expect(readJson<{ carriedFrom: { version: number; ids: string[] } }>(join(dir, 'reels', '.kinotta', REEL, 'v2.json')).carriedFrom).toMatchObject({ version: 1 });
  });

  it('leaves the batch files of the old version exactly as they were', async () => {
    const { project, dir } = await withComments();
    await project.copyBatch(REEL, 1, { section: COLD });
    const file = batchFile(dir, 1, `comments-${COLD}.json`);
    const before = { text: readFileSync(file, 'utf8'), mtime: statSync(file).mtimeMs };
    addVersion(dir, 1, 2, { shots: renameShot('01', 'Two laptops, one file') });

    await project.listComments(REEL, 2);
    await project.listComments(REEL, 1);

    expect({ text: readFileSync(file, 'utf8'), mtime: statSync(file).mtimeMs }).toEqual(before);
    await expect(project.addComment(REEL, 1, { pin: COLD_PIN, text: 'Too late.' })).rejects.toMatchObject({ code: 'frozen' });
    await expect(project.copyBatch(REEL, 1, { section: COLD })).rejects.toMatchObject({ code: 'frozen' });
  });

  it('carries across a chain of versions, one step at a time', async () => {
    const { project, dir } = await withComments();
    addVersion(dir, 1, 2, { shots: renameShot('01', 'Two laptops, one file') });
    addVersion(dir, 2, 3, { shots: (f) => (f.sections[0]!.name = 'Cold open, again') });

    const v3 = await project.listComments(REEL, 3);

    expect(texts(v3).sort()).toEqual(['Bigger count.', 'Hold the grey-out longer.', 'Land this word harder.', 'Slide the laptops in faster.']);
    const v2 = await project.listComments(REEL, 2);
    expect(v2.filter((c) => c.carried?.to === 3)).toHaveLength(4);
  });
});

describe('waiting', () => {
  const waitingIds = async (project: ReturnType<typeof openProject>, version: number): Promise<string[]> =>
    (await project.readVersion(REEL, version)).sections.filter((s) => s.waiting).map((s) => s.id);

  it('shows on the section that was copied, and only there', async () => {
    const { project } = await withComments();
    expect(await waitingIds(project, 1)).toEqual([]);

    await project.copyBatch(REEL, 1, { section: COLD });

    expect(await waitingIds(project, 1)).toEqual([COLD]);
  });

  it('persists across a version that leaves the section alone, and clears on the first that changes it', async () => {
    const { project, dir } = await withComments();
    await project.copyBatch(REEL, 1, { section: COLD });
    await project.copyBatch(REEL, 1, { section: SYNC });
    addVersion(dir, 1, 2, { shots: renameShot('01', 'Two laptops, one file') });
    addVersion(dir, 2, 3, { shots: renameShot('01', 'Two laptops, one file') });
    addVersion(dir, 3, 4, { shots: renameShot('03', 'Last write always wins') });

    expect(await waitingIds(project, 2)).toEqual([SYNC]);
    expect(await waitingIds(project, 3)).toEqual([SYNC]);
    expect(await waitingIds(project, 4)).toEqual([]);
  });

  it('starts again when the newest version is copied', async () => {
    const { project, dir } = await withComments();
    await project.copyBatch(REEL, 1, { section: COLD });
    addVersion(dir, 1, 2, { shots: renameShot('01', 'Two laptops, one file') });
    await project.addComment(REEL, 2, { pin: COLD_PIN, text: 'Round two.' });
    expect(await waitingIds(project, 2)).toEqual([]);

    await project.copyBatch(REEL, 2, { section: COLD });

    expect(await waitingIds(project, 2)).toEqual([COLD]);
  });
});
