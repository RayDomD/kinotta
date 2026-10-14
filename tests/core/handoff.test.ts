import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import type { Project, ProjectEvent } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'founder-talk';
const PIN = { shot: '01', x: 0.3, y: 0.4, element: 'document' };
const EVENT_WAIT_MS = 10_000;

const readJson = (path: string): any => JSON.parse(readFileSync(path, 'utf8'));

/** Footage reel with two unsaved edits (one on clip 04, one on a word) and a comment, so a batch can be copied. */
async function withEdits() {
  const dir = copyFixture('footage-project');
  const reelDir = join(dir, 'reels', REEL);
  const project = openProject(dir);
  await project.addComment(REEL, 1, { pin: PIN, text: 'Slide the laptops in faster.' });
  await project.addOperation(REEL, { kind: 'clip-trim', clip: '04', in: 9.6, out: 12 });
  await project.addOperation(REEL, { kind: 'word-text', at: 0.4, text: 'imagine', was: 'picture' });
  await project.addOperation(REEL, { kind: 'clip-slide', clip: '01', delta: 0.4 });
  return { dir, reelDir, project };
}

/** A new version the way an agent writes one: a copy of v1 whose plan the agent has changed. */
function agentVersion(dir: string, reelDir: string, changePlan: (plan: any) => void): void {
  cpSync(join(reelDir, 'v1'), join(reelDir, 'v2'), { recursive: true });
  const planFile = join(dir, 'motion', 'plan.json');
  const plan = readJson(planFile);
  changePlan(plan);
  writeFileSync(planFile, JSON.stringify(plan));
}

function nextEvent(project: Project, type: ProjectEvent['type']): Promise<ProjectEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${type} event`)), EVENT_WAIT_MS);
    const stop = project.subscribe((event) => {
      if (event.type !== type) return;
      clearTimeout(timer);
      stop();
      resolve(event);
    });
  });
}

describe('a hand-off freezes a snapshot while Working continues', () => {
  it('records the frozen snapshot, keeps collecting edits, and remembers the hand-off across a restart', async () => {
    const { dir, reelDir, project } = await withEdits();
    expect((await project.readEditList(REEL)).handedOff).toBeUndefined();

    await project.copyBatch(REEL, 1, { section: 'cold-open' });

    const list = await project.readEditList(REEL);
    expect(list.handedOff).toMatchObject({ version: 2, reason: expect.stringContaining('A comment batch for v2 is out') });
    expect(list.handedOff!.reason).not.toMatch(/claude|codex/i);
    expect(existsSync(join(reelDir, 'handoff.json'))).toBe(true);
    expect(await project.freezeEdits(REEL)).toEqual({ version: 2 });
    expect(existsSync(join(reelDir, 'v2'))).toBe(true);
    // Operations still collect, and the list keeps the hand-off note.
    const added = await project.addOperation(REEL, { kind: 'clip-slide', clip: '02', delta: 0.2 });
    expect(added.operations).toHaveLength(4);
    expect(added.handedOff).toBeDefined();
    expect((await openProject(dir).readEditList(REEL)).handedOff).toBeDefined();
  });

  it('ends the hand-off marker without discarding working edits or history', async () => {
    const { reelDir, project } = await withEdits();
    await project.copyBatch(REEL, 1, { section: 'cold-open' });
    expect(await project.freezeEdits(REEL)).toEqual({ version: 2 });

    const list = await project.cancelHandoff(REEL);

    expect(list.handedOff).toBeUndefined();
    expect(list.operations).toHaveLength(3);
    expect(existsSync(join(reelDir, 'handoff.json'))).toBe(false);
    expect(await project.freezeEdits(REEL)).toEqual({ version: 2 });
  });

  // It waits up to EVENT_WAIT_MS for the watcher, then builds twice, so the default 5 s is too short under a full run.
  it('replays only post-hand-off edits, flags a removed target and refuses a freeze until it is resolved', { timeout: EVENT_WAIT_MS * 2 }, async () => {
    const { reelDir, project } = await withEdits();
    await project.copyBatch(REEL, 1, { section: 'cold-open' });
    await project.addOperation(REEL, { kind: 'clip-trim', clip: '04', in: 9.8, out: 12 });
    const added = await project.addOperation(REEL, { kind: 'clip-slide', clip: '02', delta: 0.2 });
    const later = added.operations.slice(3);
    const heard = nextEvent(project, 'version-added');
    cpSync(join(reelDir, 'v2'), join(reelDir, 'v3'), { recursive: true });
    const file = join(reelDir, 'v3', 'plan.json');
    const agent = readJson(file);
    agent.clips = agent.clips.filter((clip: { id: string }) => clip.id !== '04');
    writeFileSync(file, JSON.stringify(agent));
    await heard;
    const list = await project.readEditList(REEL);
    expect(list.base).toBe(3);
    expect(list.handedOff).toBeUndefined();
    expect(list.operations.map((operation) => operation.id)).toEqual(later.map((operation) => operation.id));
    expect(list.flagged).toEqual({ [later[0]!.id]: expect.stringContaining('no clip "04"') });
    await expect(project.freezeEdits(REEL)).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('One edit no longer applies to v3') });
    await project.removeOperation(REEL, later[0]!.id);
    expect(await project.freezeEdits(REEL)).toEqual({ version: 4 });
    const plan = readJson(join(reelDir, 'v4', 'plan.json'));
    expect(plan.clips.find((clip: { id: string }) => clip.id === '01')).toMatchObject({ in: 0.4, slid: true });
    expect(plan.clips.find((clip: { id: string }) => clip.id === '02')).toMatchObject({ in: 3.4, slid: true });
    expect(readJson(join(reelDir, 'v4', 'transcript.json')).words[0].text).toBe('imagine');
  });

  it('replays a list when the version arrives with no one watching, the next time the list is read', async () => {
    const { dir, reelDir } = await withEdits();
    agentVersion(dir, reelDir, (plan) => {
      plan.clips = plan.clips.filter((c: { id: string }) => c.id !== '04');
    });

    const list = await openProject(dir).readEditList(REEL);

    expect(list.base).toBe(2);
    expect(Object.keys(list.flagged ?? {})).toHaveLength(1);
  });
});
