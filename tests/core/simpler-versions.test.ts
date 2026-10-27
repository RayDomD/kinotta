import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { alternatesFixture } from '../helpers/parts.ts';
import { copyFixture } from '../helpers/project.ts';

const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const move = (x: number) => ({ kind: 'element-offset' as const, clip: 'cube-lands', element: 'cube', x, y: 0, scale: 1 });
const cubeX = (version: Awaited<ReturnType<ReturnType<typeof openProject>['readVersion']>>) => version.code?.offsets['cube-lands']?.cube?.x;

/** A footage reel whose edit on clip 04 is flagged once the agent builds a v2 without that clip, next to an edit that still applies. */
async function staleReel() {
  const dir = copyFixture('footage-project');
  const reelDir = join(dir, 'reels/founder-talk');
  const project = openProject(dir);
  const { operations } = await project.addOperation('founder-talk', { kind: 'clip-trim', clip: '04', in: 9.6, out: 12 });
  const { operations: both } = await project.addOperation('founder-talk', { kind: 'clip-slide', clip: '02', delta: 0.2 });
  cpSync(join(reelDir, 'v1'), join(reelDir, 'v2'), { recursive: true });
  const file = join(dir, 'motion/plan.json');
  const plan = readJson(file);
  plan.clips = plan.clips.filter((clip: { id: string }) => clip.id !== '04');
  writeFileSync(file, JSON.stringify(plan));
  return { dir, reelDir, trim: operations[0]!, slide: both[1]! };
}

describe('a save with a stale edit', () => {
  it('succeeds without that edit, names it and its shot, and Undo brings it back flagged', async () => {
    const { dir, reelDir, trim, slide } = await staleReel();
    const project = openProject(dir);
    expect(Object.keys((await project.readEditList('founder-talk')).flagged ?? {})).toEqual([trim.id]);

    const saved = await project.freezeEdits('founder-talk');

    expect(saved.version).toBe(3);
    expect(saved.skipped).toEqual([{ id: trim.id, text: expect.stringContaining('Trimmed'), shot: '04', time: 9.6 }]);
    // The version holds only the edit that applied, so replaying its edit list gives the same result.
    expect(readJson(join(reelDir, 'v3/edits.json')).operations.map((op: { id: string }) => op.id)).toEqual([slide.id]);
    expect(readJson(join(reelDir, 'v3/plan.json')).clips.find((clip: { id: string }) => clip.id === '02')).toMatchObject({ slid: true });

    const after = await openProject(dir).readEditList('founder-talk');
    expect(after.operations.map((op) => op.id)).toEqual([slide.id]);
    expect(after.flagged).toBeUndefined();
    expect(after.skipped).toEqual({ version: 3, edits: saved.skipped });
    expect(after.canUndo).toBe(true);

    const undone = await project.undoEdit('founder-talk');
    expect(undone.operations.map((op) => op.id)).toEqual([trim.id, slide.id]);
    expect(Object.keys(undone.flagged ?? {})).toEqual([trim.id]);
    expect(undone.flaggedAt?.[trim.id]).toMatchObject({ shot: '04' });
    expect(undone.skipped).toBeUndefined();
  });

  it('skips the edit again on the next save, and the note goes when dismissed', async () => {
    const { dir, trim } = await staleReel();
    const project = openProject(dir);
    await project.freezeEdits('founder-talk');
    await project.undoEdit('founder-talk');

    const again = await project.freezeEdits('founder-talk');

    expect(again.version).toBe(3);
    expect(again.skipped?.map((edit) => edit.id)).toEqual([trim.id]);
    expect((await project.readEditList('founder-talk')).skipped?.edits).toHaveLength(1);
    expect((await project.dismissSkipped('founder-talk')).skipped).toBeUndefined();
    expect((await openProject(dir).readEditList('founder-talk')).skipped).toBeUndefined();
    expect((await openProject(dir).undoEdit('founder-talk')).operations.map((op) => op.id)).toContain(trim.id);
  });

  it('saves when every edit is stale, recording the skip without a new version', async () => {
    const { dir, trim, slide } = await staleReel();
    const project = openProject(dir);
    await project.removeOperation('founder-talk', slide.id);
    const saved = await project.freezeEdits('founder-talk');
    expect(saved).toMatchObject({ version: 2, skipped: [{ id: trim.id }] });
    expect((await project.readEditList('founder-talk')).operations).toEqual([]);
    expect((await project.undoEdit('founder-talk')).operations.map((op) => op.id)).toEqual([trim.id]);
  });

  it('captures a Draft without the stale edit and leaves the list as it was', async () => {
    const { dir, trim, slide } = await staleReel();
    const project = openProject(dir);
    const { captureWorking } = await import('../../server/core/_internal/save.ts');
    const capture = await captureWorking(dir, 'founder-talk');
    expect(readJson(join(capture.dir, 'plan.json')).clips.find((clip: { id: string }) => clip.id === '02')).toMatchObject({ slid: true });
    const list = await project.readEditList('founder-talk');
    expect(list.operations.map((op) => op.id)).toEqual([trim.id, slide.id]);
    expect(list.skipped).toBeUndefined();
  });
});

describe('Use this version', () => {
  it('makes an earlier version of a page reel Working in one undoable step', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    await project.addOperation('product-showreel', move(10));
    expect((await project.freezeEdits('product-showreel')).version).toBe(3);
    await project.addOperation('product-showreel', move(20));
    expect((await project.freezeEdits('product-showreel')).version).toBe(4);
    const before = await project.readEditList('product-showreel');
    const workingBefore = await project.readWorkingVersion('product-showreel');

    const list = await project.addOperation('product-showreel', { kind: 'use-version', version: 3 });

    expect(list.operations.at(-1)).toMatchObject({ kind: 'use-version', version: 3, by: 'you' });
    expect(await project.readWorkingVersion('product-showreel')).toMatchObject({ workingBase: 3 });
    expect((await project.readEditList('product-showreel')).operations).toHaveLength(before.operations.length + 1);

    await project.undoEdit('product-showreel');
    const workingAfter = await project.readWorkingVersion('product-showreel');
    expect(workingAfter).toEqual(workingBefore);
    expect((await project.readEditList('product-showreel')).operations).toEqual(before.operations);
  });

  it('builds the next version from the used one, ignoring the edits made before it, and keeps later edits', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    await project.addOperation('product-showreel', move(10));
    await project.freezeEdits('product-showreel');
    await project.addOperation('product-showreel', move(20));
    await project.freezeEdits('product-showreel');

    await project.addOperation('product-showreel', { kind: 'use-version', version: 3 });
    expect(await project.freezeEdits('product-showreel')).toEqual({ version: 5 });
    expect(cubeX(await project.readVersion('product-showreel', 5))).toBe(10);
    // Versions already saved stay as they were, and the new one records what it applied.
    expect(cubeX(await project.readVersion('product-showreel', 4))).toBe(20);
    expect(readJson(join(dir, 'reels/product-showreel/v5/edits.json'))).toMatchObject({ base: 3, operations: [] });

    await project.addOperation('product-showreel', move(30));
    expect((await project.freezeEdits('product-showreel')).version).toBe(6);
    expect(cubeX(await project.readVersion('product-showreel', 6))).toBe(30);
  });

  it('refuses a version that does not exist', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    await expect(project.addOperation('product-showreel', { kind: 'use-version', version: 9 })).rejects.toThrow('v9');
    await expect(project.addOperation('product-showreel', { kind: 'use-version', version: 0 })).rejects.toThrow('version');
  });

  it('makes an earlier version of a footage reel Working, and Undo returns to the newest', async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    const pieces = async (version?: number) => ((version === undefined ? await project.readWorkingVersion('founder-talk') : await project.readVersion('founder-talk', version)).pieces ?? []).map(({ in: start, out }) => [start, out]);
    await project.addOperation('founder-talk', { kind: 'snip', from: 6, to: 7 });
    expect((await project.freezeEdits('founder-talk')).version).toBe(2);
    await project.addOperation('founder-talk', { kind: 'snip', from: 8, to: 9 });
    expect((await project.freezeEdits('founder-talk')).version).toBe(3);

    await project.addOperation('founder-talk', { kind: 'use-version', version: 2 });
    expect(await project.readWorkingVersion('founder-talk')).toMatchObject({ workingBase: 2 });
    const saved = await project.freezeEdits('founder-talk');
    expect(await pieces(saved.version)).toEqual(await pieces(2));
    expect(await pieces(2)).toEqual([[0, 6], [7, 12]]);
    expect(await pieces(3)).toEqual([[0, 6], [7, 8], [9, 12]]);
    await project.undoEdit('founder-talk');
    expect((await project.readEditList('founder-talk')).operations.some((op) => op.kind === 'use-version')).toBe(false);
  });

  it('saves a used version as a new version after an agent build, even with no edits after it', async () => {
    const dir = copyFixture('footage-project');
    const reelDir = join(dir, 'reels/founder-talk');
    const project = openProject(dir);
    const pieces = async (version: number) => ((await project.readVersion('founder-talk', version)).pieces ?? []).map(({ in: start, out }) => [start, out]);
    await project.addOperation('founder-talk', { kind: 'snip', from: 6, to: 7 });
    await project.freezeEdits('founder-talk');
    await project.addOperation('founder-talk', { kind: 'snip', from: 8, to: 9 });
    await project.freezeEdits('founder-talk');
    // An agent builds v4, so the list is replayed onto it and no longer records a save of its own.
    cpSync(join(reelDir, 'v3'), join(reelDir, 'v4'), { recursive: true });
    expect((await openProject(dir).readEditList('founder-talk')).base).toBe(4);

    await project.addOperation('founder-talk', { kind: 'use-version', version: 2 });
    const saved = await project.freezeEdits('founder-talk');

    expect(saved.version).toBe(5);
    expect(await pieces(5)).toEqual(await pieces(2));
  });

  it('uses the first version of a legacy footage reel by the inputs its edits were made on', async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    await project.addOperation('founder-talk', { kind: 'snip', from: 6, to: 7 });
    expect((await project.freezeEdits('founder-talk')).version).toBe(2);
    await project.addOperation('founder-talk', { kind: 'use-version', version: 1 });
    expect(((await project.readWorkingVersion('founder-talk')).pieces ?? []).map(({ in: start, out }) => [start, out])).toEqual([[0, 12]]);
    expect((await project.freezeEdits('founder-talk')).version).toBe(3);
    expect(((await project.readVersion('founder-talk', 3)).pieces ?? []).map(({ in: start, out }) => [start, out])).toEqual([[0, 12]]);
  });

  it('refuses a footage version that kept no plan and is not what the edits are based on', async () => {
    const dir = copyFixture('footage-project');
    const reelDir = join(dir, 'reels/founder-talk');
    const project = openProject(dir);
    await project.addOperation('founder-talk', { kind: 'snip', from: 6, to: 7 });
    cpSync(join(reelDir, 'v1'), join(reelDir, 'v2'), { recursive: true });
    expect((await openProject(dir).readEditList('founder-talk')).base).toBe(2);
    await expect(openProject(dir).addOperation('founder-talk', { kind: 'use-version', version: 1 })).rejects.toThrow('v1 did not keep its plan');
  });

  it('switches a parts reel back to an earlier alternate choice, and Undo chooses it again', async () => {
    const { dir } = alternatesFixture();
    const project = openProject(dir);
    await project.buildParts('parts');
    await project.addOperation('parts', { kind: 'shot-alternate', shot: 'proof', revision: 'r2' });
    expect((await project.freezeEdits('parts')).version).toBe(2);
    const revisions = async () => (await project.readWorkingVersion('parts')).workingParts?.shots.map((shot) => shot.revision);
    expect(await revisions()).toEqual(['r1', 'r2', 'r1']);

    await project.addOperation('parts', { kind: 'use-version', version: 1 });
    expect(await revisions()).toEqual(['r1', 'r1', 'r1']);
    await project.undoEdit('parts');
    expect(await revisions()).toEqual(['r1', 'r2', 'r1']);
    await project.redoEdit('parts');
    const saved = await project.freezeEdits('parts');
    expect((await project.readVersion('parts', saved.version)).shots[1]).toMatchObject({ revision: 'r1' });
  });

  it('flags the choice when an agent builds a newer version, rather than putting its work back', async () => {
    const dir = copyFixture('showreel-project');
    const reelDir = join(dir, 'reels/product-showreel');
    const project = openProject(dir);
    await project.addOperation('product-showreel', move(10));
    await project.freezeEdits('product-showreel');
    const used = await project.addOperation('product-showreel', { kind: 'use-version', version: 2 });
    cpSync(join(reelDir, 'v3'), join(reelDir, 'v4'), { recursive: true });
    const shotsFile = join(reelDir, 'v4/shots.json');
    writeFileSync(shotsFile, JSON.stringify({ ...readJson(shotsFile), builtBy: 'agent' }));

    const replayed = await openProject(dir).readEditList('product-showreel');

    expect(replayed.base).toBe(4);
    expect(Object.keys(replayed.flagged ?? {})).toEqual([used.operations.at(-1)!.id]);
  });
});
