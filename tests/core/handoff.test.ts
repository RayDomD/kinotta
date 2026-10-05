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

describe('a hand-off blocks Save', () => {
  it('blocks Save with a reason while a batch is out, keeps collecting edits, and remembers it across a restart', async () => {
    const { dir, reelDir, project } = await withEdits();
    expect((await project.readEditList(REEL)).handedOff).toBeUndefined();

    await project.copyBatch(REEL, 1, { section: 'cold-open' });

    const list = await project.readEditList(REEL);
    expect(list.handedOff).toMatchObject({ version: 1, reason: expect.stringContaining('A comment batch for v1 is out') });
    expect(list.handedOff!.reason).not.toMatch(/claude|codex|agent/i);
    expect(existsSync(join(reelDir, 'handoff.json'))).toBe(true);
    await expect(project.saveEdits(REEL)).rejects.toMatchObject({ code: 'invalid', message: list.handedOff!.reason });
    expect(existsSync(join(reelDir, 'v2'))).toBe(false);
    // Operations still collect, and the list keeps the hand-off note.
    const added = await project.addOperation(REEL, { kind: 'clip-slide', clip: '02', delta: 0.2 });
    expect(added.operations).toHaveLength(4);
    expect(added.handedOff).toBeDefined();
    expect((await openProject(dir).readEditList(REEL)).handedOff).toBeDefined();
  });

  it('is ended by cancelling it, and Save builds the next version', async () => {
    const { reelDir, project } = await withEdits();
    await project.copyBatch(REEL, 1, { section: 'cold-open' });
    await expect(project.saveEdits(REEL)).rejects.toMatchObject({ code: 'invalid' });

    const list = await project.cancelHandoff(REEL);

    expect(list.handedOff).toBeUndefined();
    expect(list.operations).toHaveLength(3);
    expect(existsSync(join(reelDir, 'handoff.json'))).toBe(false);
    expect(await project.saveEdits(REEL)).toEqual({ version: 2 });
  });

  it('replays the edit list onto the next version, flags an operation whose target is gone, and blocks Save until it is dropped', async () => {
    const { dir, reelDir, project } = await withEdits();
    await project.copyBatch(REEL, 1, { section: 'cold-open' });
    const before = (await project.readEditList(REEL)).operations;
    const heard = nextEvent(project, 'version-added');

    // The agent's version has no clip 04, and a new clip 05 in its place.
    agentVersion(dir, reelDir, (plan) => {
      plan.clips = plan.clips.filter((c: { id: string }) => c.id !== '04');
    });
    await heard;

    // The watcher's version-added path already replayed the list onto v2 and wrote it down.
    expect(readJson(join(reelDir, 'edit-list.json'))).toMatchObject({ base: 2 });
    const list = await project.readEditList(REEL);
    expect(list.base).toBe(2);
    expect(list.stale).toBeUndefined();
    expect(list.handedOff).toBeUndefined();
    expect(list.operations.map((o) => o.id)).toEqual(before.map((o) => o.id));
    expect(list.flagged).toEqual({ [before[0]!.id]: expect.stringContaining('no clip "04"') });

    // Save is blocked by the flagged edit, with the reason.
    await expect(project.saveEdits(REEL)).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('One edit no longer applies to v2') });
    // New edits still collect and the flagged one is left out of what they are checked against.
    await project.addOperation(REEL, { kind: 'clip-slide', clip: '02', delta: 0.2 });

    // Dropping the flagged one unblocks Save; the rest were replayed onto v2's sources.
    const dropped = await project.removeOperation(REEL, before[0]!.id);
    expect(dropped.flagged).toBeUndefined();
    expect(await project.saveEdits(REEL)).toEqual({ version: 3 });
    const plan = readJson(join(reelDir, 'v3', 'plan.json'));
    expect(plan.clips.find((c: { id: string }) => c.id === '01')).toMatchObject({ in: 0.4, slid: true });
    expect(readJson(join(reelDir, 'v3', 'transcript.json')).words[0].text).toBe('imagine');
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
