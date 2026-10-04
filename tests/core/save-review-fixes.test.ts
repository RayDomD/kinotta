import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const SLOW_MS = 120_000;
const SLUG = 'founder-talk';
const SHOWREEL = 'product-showreel';
const SAVE_INTENT_FILE = 'save-intent.json';
const readJson = (path: string): any => JSON.parse(readFileSync(path, 'utf8'));
const stateOf = (dir: string, slug: string, n: number): any => readJson(join(dir, 'reels', '.kinotta', slug, `v${n}.json`));
const WORD_PIN = { kind: 'word', shot: '03', time: 8.65, word: 'lose' } as const;
const CUBE_OFFSET = { kind: 'element-offset', clip: 'cube-lands', element: 'cube', x: 4, y: 4, scale: 1 } as const;

/** The footage sample as a reel Kinotta edits through a plan of its own in the reel folder, v1 built by an agent (no plan.json in v1). */
function agentBuiltWithOwnPlan(): string {
  const dir = copyFixture('footage-project');
  const plan = readJson(join(dir, 'motion/plan.json'));
  const fragments = readdirSync(join(dir, 'motion/clips'));
  plan.video = '../../media/talk.mp4';
  plan.clips = plan.clips.map((c: any) => ({ ...c, clip: `../../motion/clips/${fragments.find((f) => f.startsWith(`${c.id}-`))}` }));
  writeFileSync(join(dir, 'reels', SLUG, 'plan.json'), JSON.stringify(plan));
  return dir;
}

describe('Save carries the comments at once (P2)', () => {
  it('marks the previous version moved and the new one carried before Save returns', { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    await project.addComment(SLUG, 1, { pin: WORD_PIN, text: 'Land this word harder.' });
    await project.addOperation(SLUG, { kind: 'snip', from: 6, to: 7 });

    await project.saveEdits(SLUG);

    // The files, not the API: reading through the API would settle on its own.
    expect(stateOf(dir, SLUG, 1).carriedTo).toMatchObject({ version: 2 });
    expect(stateOf(dir, SLUG, 2)).toMatchObject({ carriedFrom: { version: 1 }, comments: [{ text: 'Land this word harder.', pin: { time: 7.65 } }] });
  });

  it('does the same for a reel built from code', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    await project.addComment(SHOWREEL, 2, { pin: { shot: '03', x: 0.5, y: 0.5, element: 'icons-word' }, text: 'Hold ICONS.' });
    await project.addOperation(SHOWREEL, CUBE_OFFSET);

    await project.saveEdits(SHOWREEL);

    expect(stateOf(dir, SHOWREEL, 2).carriedTo).toMatchObject({ version: 3 });
    expect(stateOf(dir, SHOWREEL, 3).carriedFrom).toMatchObject({ version: 2 });
  });
});

describe('a version with no plan of its own (P3)', () => {
  it('is one piece over the whole video, so its comments remap through the pieces it was built with', { timeout: SLOW_MS }, async () => {
    const dir = agentBuiltWithOwnPlan();
    const project = openProject(dir);
    await project.addComment(SLUG, 1, { pin: WORD_PIN, text: 'Land this word harder.' });
    await project.addOperation(SLUG, { kind: 'snip', from: 6, to: 7 });

    await project.saveEdits(SLUG);

    expect(existsSync(join(dir, 'reels', SLUG, 'v1', 'plan.json'))).toBe(false);
    expect((await project.readVersion(SLUG, 1)).pieces).toHaveLength(1);
    expect((await project.listComments(SLUG, 2))[0]!.pin.time).toBe(7.65);
  });
});

describe('Save keeps a crash from double-applying the edits (P6)', () => {
  /** A reel with one snip listed; `crashed` leaves the disk as a crash at that step would. */
  const setup = async () => {
    const dir = copyFixture('footage-project');
    const reelDir = join(dir, 'reels', SLUG);
    const planFile = join(dir, 'motion/plan.json');
    const project = openProject(dir);
    await project.addOperation(SLUG, { kind: 'snip', from: 3.5, to: 5 });
    return { reelDir, project, planFile, list: readFileSync(join(reelDir, 'edit-list.json'), 'utf8'), planBefore: readFileSync(planFile, 'utf8') };
  };
  const journal = (planFile: string, text: string): string => JSON.stringify({ version: 2, files: [{ file: planFile, text }] });

  it('crash after the sources were written but before the version appeared: sources restored, list kept', { timeout: SLOW_MS }, async () => {
    const { reelDir, project, list, planFile, planBefore } = await setup();
    await project.saveEdits(SLUG);
    rmSync(join(reelDir, 'v2'), { recursive: true });
    writeFileSync(join(reelDir, 'edit-list.json'), list);
    writeFileSync(join(reelDir, SAVE_INTENT_FILE), journal(planFile, planBefore));

    const recovered = await project.readEditList(SLUG);

    expect(readFileSync(planFile, 'utf8')).toBe(planBefore);
    expect(recovered.operations).toHaveLength(1);
    expect(existsSync(join(reelDir, SAVE_INTENT_FILE))).toBe(false);
    expect(await project.saveEdits(SLUG)).toEqual({ version: 2 });
    expect(readJson(planFile).pieces).toEqual([{ in: 0, out: 3.5 }, { in: 5, out: 12 }]);
  });

  it('crash after the version appeared but before the list went: the list is cleared, never replayed', { timeout: SLOW_MS }, async () => {
    const { reelDir, project, list, planFile, planBefore } = await setup();
    await project.saveEdits(SLUG);
    const edited = readFileSync(planFile, 'utf8');
    writeFileSync(join(reelDir, 'edit-list.json'), list);
    writeFileSync(join(reelDir, SAVE_INTENT_FILE), journal(planFile, planBefore));

    expect((await project.readEditList(SLUG)).operations).toEqual([]);

    expect(readFileSync(planFile, 'utf8')).toBe(edited);
    expect(existsSync(join(reelDir, 'edit-list.json'))).toBe(false);
    expect(existsSync(join(reelDir, SAVE_INTENT_FILE))).toBe(false);
    expect(readdirSync(reelDir).filter((n) => /^v\d+$/.test(n))).toEqual(['v1', 'v2']);
  });
});

describe('Save keeps the fields of an agent-written transcript (P7)', () => {
  it("replaces only the words, in the reel's transcript and the version's copy", { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    const reelDir = join(dir, 'reels', SLUG);
    const file = join(reelDir, 'transcript.json');
    writeFileSync(file, JSON.stringify({ ...readJson(file), language: 'en', duration: 12 }));
    const project = openProject(dir);
    await project.addOperation(SLUG, { kind: 'word-text', at: 0.4, text: 'imagine' });

    await project.saveEdits(SLUG);

    for (const path of [file, join(reelDir, 'v2', 'transcript.json')]) {
      const saved = readJson(path);
      expect(saved).toMatchObject({ language: 'en', duration: 12 });
      expect(saved.words[0].text).toBe('imagine');
    }
  });
});

describe('a saved code-only version copies the page and its assets only (P8)', () => {
  it('leaves answers.md, the batch files and the old edits.json behind', async () => {
    const dir = copyFixture('showreel-project');
    const reelDir = join(dir, 'reels', SHOWREEL);
    const v2 = join(reelDir, 'v2');
    mkdirSync(join(v2, 'assets'));
    writeFileSync(join(v2, 'assets', 'logo.svg'), '<svg/>');
    for (const name of ['answers.md', 'comments.json', 'comments-intro.json']) writeFileSync(join(v2, name), 'stale');
    writeFileSync(join(v2, 'edits.json'), JSON.stringify({ base: 1, operations: [] }));
    const project = openProject(dir);
    await project.addOperation(SHOWREEL, CUBE_OFFSET);

    await project.saveEdits(SHOWREEL);

    const v3 = join(reelDir, 'v3');
    expect(readdirSync(v3).sort()).toEqual(['assets', 'edits.json', 'index.html', 'kinotta-edits.css', 'shots.json']);
    expect(readJson(join(v3, 'edits.json'))).toMatchObject({ base: 2, operations: [{ element: 'cube' }] });
  });
});

describe('an element pin follows its element (P9)', () => {
  it('flags a carried pin whose element is gone from the new version, and not one still there', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    await project.addComment(SHOWREEL, 2, { pin: { shot: '03', x: 0.5, y: 0.5, element: 'icons-word' }, text: 'Hold ICONS.' });
    await project.addComment(SHOWREEL, 2, { pin: { shot: '01', x: 0.5, y: 0.5, element: 'cube' }, text: 'Bounce more.' });
    await project.addComment(SHOWREEL, 2, { pin: { shot: '02', x: 0.5, y: 0.5, element: null }, text: 'Empty here.' });
    const reelDir = join(dir, 'reels', SHOWREEL);
    cpSync(join(reelDir, 'v2'), join(reelDir, 'v3'), { recursive: true });
    const page = join(reelDir, 'v3', 'index.html');
    writeFileSync(page, readFileSync(page, 'utf8').replaceAll('data-el="icons-word"', 'data-el="renamed-word"'));

    const v3 = await project.listComments(SHOWREEL, 3);

    const states = Object.fromEntries(v3.map((c) => [c.text, c.state]));
    expect(states).toEqual({ 'Hold ICONS.': 'element-removed', 'Bounce more.': undefined, 'Empty here.': undefined });
  });
});
