import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'product-showreel';
const move = (x: number) => ({ kind: 'element-offset' as const, clip: 'cube-lands', element: 'cube', x, y: 0, scale: 1 });
const setup = () => {
  const dir = copyFixture('showreel-project');
  return { dir, reelDir: join(dir, 'reels', REEL), project: openProject(dir) };
};

describe('durable working-state identity and history', () => {
  it('round-trips undo and redo across a freeze without replaying onto its own snapshot', async () => {
    const { dir, project } = setup();
    const first = await project.addOperation(REEL, move(10));
    await project.freezeEdits(REEL);
    const reopened = openProject(dir);
    expect(await reopened.readEditList(REEL)).toMatchObject({ base: 2, frozen: 3, operations: first.operations, canUndo: true });
    expect((await reopened.undoEdit(REEL)).operations).toEqual([]);
    expect((await reopened.redoEdit(REEL)).operations).toEqual(first.operations);
    await reopened.addOperation(REEL, move(20));
    await reopened.freezeEdits(REEL);
    expect((await reopened.readVersion(REEL, 3)).code?.offsets['cube-lands']?.cube?.x).toBe(10);
    expect((await reopened.readVersion(REEL, 4)).code?.offsets['cube-lands']?.cube?.x).toBe(20);
    expect(await reopened.readWorkingVersion(REEL)).toMatchObject({ number: 4, workingBase: 2, code: { offsets: {} } });
  });

  it('reopens a legacy pending edit list and migrates it without applying operations twice', async () => {
    const { dir, reelDir, project } = setup();
    const list = await project.addOperation(REEL, move(10));
    writeFileSync(join(reelDir, 'edit-list.json'), JSON.stringify({ base: 2, operations: list.operations, undo: [[]], redo: [], flagged: {} }));
    await openProject(dir).freezeEdits(REEL);
    expect((await openProject(dir).readEditList(REEL)).operations).toEqual(list.operations);
    expect((await project.readVersion(REEL, 3)).code?.offsets['cube-lands']?.cube?.x).toBe(10);
  });

  it('recovers a freeze interrupted after publication with its history intact', async () => {
    const { dir, reelDir, project } = setup();
    const list = await project.addOperation(REEL, move(10));
    const before = readFileSync(join(reelDir, 'edit-list.json'), 'utf8');
    await project.freezeEdits(REEL);
    writeFileSync(join(reelDir, 'edit-list.json'), before);
    writeFileSync(join(reelDir, 'save-intent.json'), JSON.stringify({ version: 3, files: [], operations: list.operations.map((op) => op.id), working: JSON.parse(before) }));
    expect(await openProject(dir).readEditList(REEL)).toMatchObject({ base: 2, frozen: 3, operations: list.operations, canUndo: true });
  });

  it('replays only later edits onto an agent rebuild without double application', async () => {
    const { reelDir, project } = setup();
    const first = await project.addOperation(REEL, move(10));
    await project.freezeEdits(REEL);
    const later = await project.addOperation(REEL, move(20));
    cpSync(join(reelDir, 'v3'), join(reelDir, 'v4'), { recursive: true });
    const shotsFile = join(reelDir, 'v4', 'shots.json');
    writeFileSync(shotsFile, JSON.stringify({ ...JSON.parse(readFileSync(shotsFile, 'utf8')), builtBy: 'agent' }));
    const replayed = await project.readEditList(REEL);
    expect(replayed.base).toBe(4);
    expect(replayed.operations).toEqual(later.operations.filter((op) => op.id !== first.operations[0]!.id));
    expect(replayed.flagged).toBeUndefined();
  });

  it('restores non-idempotent footage edits and history after restart without changing the frozen version', { timeout: 120_000 }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    const reel = 'founder-talk';
    await project.addOperation(reel, { kind: 'snip', from: 6, to: 7 });
    const { version } = await project.freezeEdits(reel);
    const reopened = openProject(dir);
    expect((await reopened.readEditList(reel)).operations).toHaveLength(1);
    await reopened.addOperation(reel, { kind: 'snip', from: 8, to: 9 });
    const second = await reopened.freezeEdits(reel);
    expect((await reopened.readVersion(reel, second.version)).pieces?.map(({ in: start, out }) => ({ in: start, out }))).toEqual([{ in: 0, out: 6 }, { in: 7, out: 8 }, { in: 9, out: 12 }]);
    expect((await reopened.readVersion(reel, version)).pieces?.map(({ in: start, out }) => ({ in: start, out }))).toEqual([{ in: 0, out: 6 }, { in: 7, out: 12 }]);
    expect((await reopened.undoEdit(reel)).operations).toHaveLength(1);
    expect((await reopened.redoEdit(reel)).operations).toHaveLength(2);
  });
});

describe('freeze boundary', () => {
  it('reuses unchanged content and content restored by undo', async () => {
    const { reelDir, project } = setup();
    expect(await project.freezeEdits(REEL)).toEqual({ version: 2 });
    await project.addOperation(REEL, move(10));
    expect(await project.freezeEdits(REEL)).toEqual({ version: 3 });
    expect(await project.freezeEdits(REEL)).toEqual({ version: 3 });
    await project.addOperation(REEL, move(20));
    await project.undoEdit(REEL);
    expect(await project.freezeEdits(REEL)).toEqual({ version: 3 });
    expect(existsSync(join(reelDir, 'v4'))).toBe(false);
    expect((await project.readEditList(REEL)).canRedo).toBe(true);
  });

  it('serializes concurrent freezes and later edits without a half-built version', async () => {
    const { reelDir, project } = setup();
    await project.addOperation(REEL, move(10));
    const [first, second] = await Promise.all([project.freezeEdits(REEL), project.freezeEdits(REEL)]);
    expect(first).toEqual({ version: 3 });
    expect(second).toEqual(first);
    const [captured] = await Promise.all([project.freezeEdits(REEL), project.addOperation(REEL, move(20))]);
    expect([10, 20]).toContain((await project.readVersion(REEL, captured.version)).code?.offsets['cube-lands']?.cube?.x);
    expect((await project.readVersion(REEL, 3)).code?.offsets['cube-lands']?.cube?.x).toBe(10);
    expect((await project.readEditList(REEL)).operations).toHaveLength(2);
    for (const name of readdirSync(reelDir).filter((name) => /^v\d+$/.test(name))) {
      expect(existsSync(join(reelDir, name, 'shots.json'))).toBe(true);
      expect(existsSync(join(reelDir, name, 'index.html'))).toBe(true);
    }
    expect(existsSync(join(reelDir, '.save'))).toBe(false);
  });

  it('refuses missing page dependencies with the working history and frozen versions intact', async () => {
    const { reelDir, project } = setup();
    const page = join(reelDir, 'v2', 'index.html');
    writeFileSync(page, readFileSync(page, 'utf8').replace('</head>', '<link rel="stylesheet" href="missing.css"></head>'));
    const list = await project.addOperation(REEL, move(10));
    await expect(project.freezeEdits(REEL)).rejects.toThrow();
    expect((await project.readEditList(REEL)).operations).toEqual(list.operations);
    expect(existsSync(join(reelDir, 'v3'))).toBe(false);
    expect(existsSync(join(reelDir, '.save'))).toBe(false);
  });

  it('recovers an interrupted publish without discovering or retaining the incomplete stage', async () => {
    const { dir, reelDir, project } = setup();
    const list = await project.addOperation(REEL, move(10));
    mkdirSync(join(reelDir, '.save'));
    writeFileSync(join(reelDir, '.save', 'index.html'), 'incomplete');
    writeFileSync(join(reelDir, 'save-intent.json'), JSON.stringify({ version: 3, files: [], operations: list.operations.map((op) => op.id), working: JSON.parse(readFileSync(join(reelDir, 'edit-list.json'), 'utf8')) }));
    expect((await openProject(dir).readEditList(REEL)).operations).toEqual(list.operations);
    expect(existsSync(join(reelDir, 'v3'))).toBe(false);
    expect(existsSync(join(reelDir, '.save'))).toBe(false);
    expect(existsSync(join(reelDir, 'save-intent.json'))).toBe(false);
  });

  it('refuses missing footage without publishing a version or losing history', { timeout: 120_000 }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    const reel = 'founder-talk';
    const list = await project.addOperation(reel, { kind: 'snip', from: 6, to: 7 });
    rmSync(join(dir, 'media', 'talk.mp4'));
    await expect(project.freezeEdits(reel)).rejects.toThrow();
    expect((await project.readEditList(reel)).operations).toEqual(list.operations);
    expect(existsSync(join(dir, 'reels', reel, 'v2'))).toBe(false);
    expect(existsSync(join(dir, 'reels', reel, '.save'))).toBe(false);
  });

  it('keeps media identity in the working journal so an altered original cannot replace frozen media', { timeout: 120_000 }, async () => {
    const dir = copyFixture('footage-project');
    const reel = 'founder-talk';
    const reelDir = join(dir, 'reels', reel);
    const source = join(dir, 'media', 'talk.mp4');
    const original = readFileSync(source);
    const plan = { title: 'Media identity', duration: 12, clips: [], sections: [{ id: 'all', name: 'All', start: 0, end: 12 }], media: { schema: 1, sources: [{ id: 'video', kind: 'video', path: '../../media/talk.mp4', duration: 12, audio: false }], placements: [{ id: 'main', role: 'main', source: 'video', in: 0, out: 12 }], sequence: ['main'] } };
    writeFileSync(join(reelDir, 'plan.json'), JSON.stringify(plan));
    const project = openProject(dir);
    await project.addOperation(reel, { kind: 'placement-change', placement: 'main', changes: { gain: 0.5 } });
    await project.freezeEdits(reel);
    const saved = await project.readVersion(reel, 2);
    writeFileSync(source, 'changed original');
    await project.addOperation(reel, { kind: 'placement-change', placement: 'main', changes: { gain: 0.4 } });
    await expect(project.freezeEdits(reel)).rejects.toThrow('changed');
    expect(readFileSync(join(reelDir, 'v2', saved.media!.sources[0]!.path))).toEqual(original);
    expect((await project.readEditList(reel)).operations).toHaveLength(2);
    expect(existsSync(join(reelDir, 'v3'))).toBe(false);
  });
});
