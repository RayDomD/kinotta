import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'founder-talk';

describe('footage reels', () => {
  it('reads the transcript as timed words', async () => {
    const version = await openProject(copyFixture('footage-project')).readVersion(REEL, 1);

    expect(version.transcript).toHaveLength(42);
    expect(version.transcript?.[0]).toEqual({ text: 'picture', start: 0.4, end: 0.7 });
    expect(version.transcriptProblem).toBeUndefined();
  });

  it('reports the footage reference from reel.json and that the file exists', async () => {
    const version = await openProject(copyFixture('footage-project')).readVersion(REEL, 1);

    expect(version.footage).toEqual({ path: 'media/talk.mp4', exists: true });
  });

  it('reports a missing footage file without failing', async () => {
    const dir = copyFixture('footage-project');
    rmSync(join(dir, 'media', 'talk.mp4'));

    const version = await openProject(dir).readVersion(REEL, 1);

    expect(version.footage).toEqual({ path: 'media/talk.mp4', exists: false });
    expect(version.shots).toHaveLength(4);
  });

  it('gives each shot the transcript words whose start falls inside its line span, and the joined text', async () => {
    const version = await openProject(copyFixture('footage-project')).readVersion(REEL, 1);
    const [first, second, third, fourth] = version.shots;

    expect(first?.words?.map((w) => w.text).join(' ')).toBe('picture two people editing the same doc on a plane');
    expect(first?.spoken).toBe('picture two people editing the same doc on a plane');
    expect(first?.words?.[0]).toEqual({ text: 'picture', start: 0.4, end: 0.7 });
    expect(second?.spoken).toBe('and every edit they make is a conflict waiting to happen');
    expect(third?.spoken).toBe('the lazy answer is last write wins, and you lose work');
    expect(fourth?.spoken).toBe('what you actually want is for both edits to survive');
    expect(version.shots.map((s) => s.type)).toEqual(['cutaway', 'panel', 'panel', 'cutaway']);
  });

  it('reports a missing transcript clearly and still reads the shots', async () => {
    const dir = copyFixture('footage-project');
    rmSync(join(dir, 'reels', REEL, 'transcript.json'));

    const version = await openProject(dir).readVersion(REEL, 1);

    expect(version.transcriptProblem).toMatch(/transcript\.json/);
    expect(version.transcript).toBeUndefined();
    expect(version.shots).toHaveLength(4);
    expect(version.shots[0]?.words).toBeUndefined();
    expect(version.shots[0]?.spoken).toBeUndefined();
  });

  it('reports an unreadable transcript clearly', async () => {
    const dir = copyFixture('footage-project');
    writeFileSync(join(dir, 'reels', REEL, 'transcript.json'), '{ not json');

    const version = await openProject(dir).readVersion(REEL, 1);

    expect(version.transcriptProblem).toMatch(/transcript\.json.*not valid/);
    expect(version.shots).toHaveLength(4);
  });

  it('leaves a code-only reel exactly as before', async () => {
    const version = await openProject(copyFixture('showreel-project')).readVersion('product-showreel', 2);

    expect(version.footage).toBeUndefined();
    expect(version.transcript).toBeUndefined();
    expect(version.transcriptProblem).toBeUndefined();
    expect(version.shots[0]).toEqual({
      number: '01',
      start: 0,
      duration: 1.8,
      title: 'Cube lands',
      description: 'A deeper orange cube drops in, bounces once and settles in the centre.',
    });
  });
});

describe('footageFile', () => {
  it('resolves the reel footage to an absolute path inside the project', async () => {
    const dir = copyFixture('footage-project');

    expect(await openProject(dir).footageFile(REEL)).toBe(join(dir, 'media', 'talk.mp4'));
  });

  it('is null for a code-only reel, an unknown reel and a missing file', async () => {
    const code = openProject(copyFixture('showreel-project'));
    expect(await code.footageFile('product-showreel')).toBeNull();
    expect(await code.footageFile('nope')).toBeNull();

    const dir = copyFixture('footage-project');
    rmSync(join(dir, 'media', 'talk.mp4'));
    expect(await openProject(dir).footageFile(REEL)).toBeNull();
  });

  it('refuses a footage path that leaves the project folder', async () => {
    const dir = copyFixture('footage-project');
    mkdirSync(join(dir, '..', 'kinotta-outside'), { recursive: true });
    writeFileSync(join(dir, '..', 'kinotta-outside', 'secret.mp4'), 'x');
    writeFileSync(join(dir, 'reels', REEL, 'reel.json'), JSON.stringify({ title: 'x', footage: '../kinotta-outside/secret.mp4' }));

    expect(await openProject(dir).footageFile(REEL)).toBeNull();
    expect((await openProject(dir).readVersion(REEL, 1)).footage).toEqual({ path: '../kinotta-outside/secret.mp4', exists: false });
  });
});
