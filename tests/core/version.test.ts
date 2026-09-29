import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture, emptyProject } from '../helpers/project.ts';

describe('readVersion', () => {
  it('reads shots with number, start, computed duration, title and description', async () => {
    const version = await openProject(copyFixture('showreel-project')).readVersion('product-showreel', 2);

    expect(version.number).toBe(2);
    expect(version.duration).toBe(15);
    expect(version.shots).toHaveLength(6);
    expect(version.shots[0]).toEqual({
      number: '01',
      start: 0,
      duration: 1.8,
      title: 'Cube lands',
      description: 'A deeper orange cube drops in, bounces once and settles in the centre.',
    });
    expect(version.shots.map((s) => s.number)).toEqual(['01', '02', '03', '04', '05', '06']);
    expect(version.shots.map((s) => s.start)).toEqual([0, 1.8, 3.6, 5.9, 8.4, 12.2]);
  });

  it('runs each shot to the next shot, and the last shot to the reel duration', async () => {
    const version = await openProject(copyFixture('showreel-project')).readVersion('product-showreel', 2);

    expect(version.shots[2]?.duration).toBeCloseTo(2.3, 5);
    expect(version.shots[5]?.duration).toBeCloseTo(2.8, 5);
  });

  it('flags the newest version', async () => {
    const project = openProject(copyFixture('showreel-project'));

    expect((await project.readVersion('product-showreel', 2)).isNewest).toBe(true);
    expect((await project.readVersion('product-showreel', 1)).isNewest).toBe(false);
  });

  it('passes overlays through as parsed, and leaves them empty when absent', async () => {
    const project = openProject(copyFixture('showreel-project'));

    expect((await project.readVersion('product-showreel', 2)).overlays).toEqual([
      { kind: 'B-ROLL', name: 'Hands on keyboard', start: 6.2, end: 9.8 },
      { kind: 'L3', name: 'Lower third: product name', start: 12.4, end: 14.6 },
    ]);
    expect((await project.readVersion('product-showreel', 1)).overlays).toEqual([]);
  });

  it('passes sections and changed sections through when present', async () => {
    const dir = emptyProject();
    const versionDir = join(dir, 'reels', 'talk', 'v1');
    mkdirSync(versionDir, { recursive: true });
    writeFileSync(
      join(versionDir, 'shots.json'),
      JSON.stringify({
        contract: 1,
        duration: 10,
        sections: [{ id: 'intro', name: 'Intro', start: 0, end: 10 }],
        changedSections: ['intro'],
        shots: [{ number: '01', start: 0, title: 'A', description: 'B', section: 'intro' }],
      }),
    );

    const version = await openProject(dir).readVersion('talk', 1);

    expect(version.sections).toEqual([{ id: 'intro', name: 'Intro', start: 0, end: 10 }]);
    expect(version.changedSections).toEqual(['intro']);
  });

  it('fails clearly for an unknown reel or version', async () => {
    const project = openProject(copyFixture('showreel-project'));

    await expect(project.readVersion('nope', 1)).rejects.toThrow(/reel "nope" not found/i);
    await expect(project.readVersion('product-showreel', 9)).rejects.toThrow(/version 9 .*not found/i);
  });

  it('fails clearly for a missing or unparsable shots.json', async () => {
    const dir = emptyProject();
    mkdirSync(join(dir, 'reels', 'r', 'v1'), { recursive: true });
    mkdirSync(join(dir, 'reels', 'r', 'v2'), { recursive: true });
    writeFileSync(join(dir, 'reels', 'r', 'v2', 'shots.json'), '{ not json');
    const project = openProject(dir);

    await expect(project.readVersion('r', 1)).rejects.toThrow(/shots\.json/);
    await expect(project.readVersion('r', 2)).rejects.toThrow(/shots\.json/);
  });

  it('rejects slugs that try to leave the reels folder', async () => {
    await expect(openProject(copyFixture('showreel-project')).readVersion('..', 1)).rejects.toThrow(/not found/i);
  });
});
