import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import type { Transcriber } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const SLOW_MS = 90_000;
const VIDEO = 'media/talk.mp4';
const WORDS = [
  { text: 'hello', start: 0.5, end: 0.9 },
  { text: 'there', start: 1, end: 1.4 },
];
const fakeTranscriber: Transcriber = async () => WORDS;
const readJson = (path: string): any => JSON.parse(readFileSync(path, 'utf8'));

describe('startReelFromBrief', () => {
  it('writes reel.json with the title and brief and returns a request naming the reel and the brief', async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);

    const { slug, request } = await project.startReelFromBrief({ title: 'Launch teaser', brief: '  A 20 second teaser for the launch.  ' });

    expect(slug).toBe('launch-teaser');
    const reelDir = join(dir, 'reels', slug);
    expect(readJson(join(reelDir, 'reel.json'))).toEqual({ title: 'Launch teaser', brief: 'A 20 second teaser for the launch.' });
    expect(readdirSync(reelDir)).toEqual(['reel.json']);
    expect(request).toContain('Launch teaser');
    expect(request).toContain('reels/launch-teaser');
    expect(request).toContain('A 20 second teaser for the launch.');
    expect(request).not.toMatch(/claude|codex|gemini|agy/i);
  });

  it('keeps slugs unique and refuses an empty title or brief without writing anything', async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    const before = readdirSync(join(dir, 'reels')).sort();

    const first = await project.startReelFromBrief({ title: 'Teaser', brief: 'one' });
    const second = await project.startReelFromBrief({ title: 'Teaser', brief: 'two' });
    await expect(project.startReelFromBrief({ title: ' ', brief: 'x' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(project.startReelFromBrief({ title: 'Teaser', brief: ' ' })).rejects.toMatchObject({ code: 'invalid' });

    expect([first.slug, second.slug]).toEqual(['teaser', 'teaser-2']);
    expect(readdirSync(join(dir, 'reels')).sort()).toEqual([...before, 'teaser', 'teaser-2'].sort());
  });

  it('lists the reel with its brief and request and no version, then with a version once shots.json is written', async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    const { slug, request } = await project.startReelFromBrief({ title: 'Teaser', brief: 'Short.' });

    const waiting = (await project.listReels()).reels.find((r) => r.slug === slug)!;
    expect(waiting).toMatchObject({ title: 'Teaser', newestVersion: null, brief: { text: 'Short.', request } });

    const versionDir = join(dir, 'reels', slug, 'v1');
    mkdirSync(versionDir);
    writeFileSync(join(versionDir, 'index.html'), '<html></html>');
    writeFileSync(join(versionDir, 'shots.json'), JSON.stringify({ duration: 4, shots: [{ number: '01', start: 0, title: 'Open', description: 'd' }] }));

    const built = (await project.listReels()).reels.find((r) => r.slug === slug)!;
    expect(built.newestVersion).toBe(1);
    expect((await project.listVersions(slug)).map((v) => v.number)).toEqual([1]);
  });

  it('does not give a reel started another way a brief', async () => {
    const reels = (await openProject(copyFixture('showreel-project')).listReels()).reels;

    expect(reels.length).toBeGreaterThan(0);
    for (const reel of reels) expect(reel).not.toHaveProperty('brief');
  });
});

describe('a reel with no clips', () => {
  async function started() {
    const dir = copyFixture('footage-project');
    const project = openProject(dir, { transcriber: fakeTranscriber });
    const { slug } = await project.startReel({ video: VIDEO, title: 'Bare' });
    return { dir, project, slug };
  }

  it('asks for b-roll with a request naming the reel, and a version with shots does not', { timeout: SLOW_MS }, async () => {
    const { project, slug } = await started();
    const version = await project.readVersion(slug, 1);

    expect(version.shots).toEqual([]);
    expect(version.brollRequest).toContain('Bare');
    expect(version.brollRequest).toContain(`reels/${slug}/v2`);
    expect(version.brollRequest).not.toMatch(/claude|codex|gemini|agy/i);
    expect(await project.readVersion('founder-talk', 1)).not.toHaveProperty('brollRequest');
  });

  it('takes a word pin on a transcript word, keeps it in the batch, and refuses a word that is not spoken', { timeout: SLOW_MS }, async () => {
    const { dir, project, slug } = await started();
    const pin = { kind: 'word', shot: '', time: 1, word: 'there' } as const;

    const { comment } = await project.addComment(slug, 1, { pin, text: 'Land this word.' });
    await expect(project.addComment(slug, 1, { pin: { ...pin, word: 'nope' }, text: 'x' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(project.addComment(slug, 1, { pin: { kind: 'word', shot: '01', time: 1, word: 'there' }, text: 'x' })).rejects.toMatchObject({ code: 'invalid' });

    expect(comment.pin).toMatchObject({ kind: 'word', shot: '', time: 1, word: 'there', section: null });
    const batch = await project.copyBatch(slug, 1);
    expect(batch.text).toContain('1. 01.00s, word “there”: Land this word.');
    expect(batch.text).not.toContain('Shot ');
    expect(existsSync(join(dir, batch.file))).toBe(true);
    expect(readJson(join(dir, batch.file)).comments[0]).toMatchObject({ shot: null, word: 'there', time: 1 });
  });
});
