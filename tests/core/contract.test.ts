import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture, emptyProject } from '../helpers/project.ts';

const PAGE = (scenes: string): string => `<!DOCTYPE html><html><body>${scenes}<script>window.seek=function(){};</script></body></html>`;

/** A one-version reel written straight to disk, for rules the samples do not break. */
function writeVersion(shots: unknown, page: string | null, extra: Record<string, unknown> = { duration: 10 }) {
  const dir = emptyProject();
  const versionDir = join(dir, 'reels', 'r', 'v1');
  mkdirSync(versionDir, { recursive: true });
  writeFileSync(join(versionDir, 'shots.json'), JSON.stringify({ contract: 1, ...extra, shots }));
  if (page !== null) writeFileSync(join(versionDir, 'index.html'), page);
  return openProject(dir);
}

const SHOT = (number: string, start: number, title = `Shot ${number}`) => ({ number, start, title, description: 'd' });
const SCENE = (name: string, start: number, duration: number, els: string[] = ['x']) =>
  `<section data-scene="${name}" data-start="${start}" data-duration="${duration}">${els.map((e) => `<div data-el="${e}"></div>`).join('')}</section>`;

describe('contract issues', () => {
  it('finds none on a version that keeps the contract', async () => {
    const project = openProject(copyFixture('showreel-project'));

    expect((await project.readVersion('product-showreel', 2)).issues).toEqual([]);
    expect((await project.readVersion('product-showreel', 1)).issues).toEqual([]);
    expect((await project.readVersion('broll-cutdown', 1)).issues).toEqual([]);
    expect((await openProject(copyFixture('footage-project')).readVersion('founder-talk', 1)).issues).toEqual([]);
  });

  it('lists each planted problem of the broken sample in plain words, and still reads the shots', async () => {
    const version = await openProject(copyFixture('broken-project')).readVersion('launch-teaser', 1);

    expect(version.issues.map((i) => i.message)).toEqual([
      'shots.json: shot 05 is missing a title',
      'scene product-card: element name "card" is used twice',
      'shot 03: no named elements',
      'shot 04: starts at 9s but no scene covers that time',
    ]);
    expect(version.issues.find((i) => i.code === 'no-named-elements')).toMatchObject({ shot: '03', scene: 'ticker' });
    expect(version.issues.find((i) => i.code === 'scene-gap')).toMatchObject({ shot: '04' });
    expect(version.shots.map((s) => s.number)).toEqual(['01', '02', '03', '04', '05']);
    expect(version.duration).toBe(12);
  });

  it('reports a page that never defines seek as fine statically (only the browser can see it)', async () => {
    const version = await openProject(copyFixture('broken-project')).readVersion('no-seek', 1);

    expect(version.issues).toEqual([]);
  });

  it('opens a version with an unparsable or missing shots.json with zero shots and one issue', async () => {
    const dir = emptyProject();
    mkdirSync(join(dir, 'reels', 'r', 'v1'), { recursive: true });
    mkdirSync(join(dir, 'reels', 'r', 'v2'), { recursive: true });
    writeFileSync(join(dir, 'reels', 'r', 'v2', 'shots.json'), '{ not json');
    const project = openProject(dir);

    const missing = await project.readVersion('r', 1);
    const broken = await project.readVersion('r', 2);

    expect(missing.shots).toEqual([]);
    expect(missing.issues.map((i) => i.message)).toEqual(['shots.json: file not found']);
    expect(broken.shots).toEqual([]);
    expect(broken.issues.map((i) => i.message)).toEqual(['shots.json: not valid JSON']);
    expect(broken.sections).toHaveLength(1);
  });

  it('reports a missing duration and falls back to what the shots and page show', async () => {
    const project = writeVersion([SHOT('01', 0), SHOT('02', 4)], PAGE(SCENE('a', 0, 4) + SCENE('b', 4, 3)), {});

    const version = await project.readVersion('r', 1);

    expect(version.issues.map((i) => i.message)).toEqual(['shots.json: no duration']);
    expect(version.duration).toBe(7);
  });

  it('reports shot list problems: missing fields, repeated numbers, order, and starts past the end', async () => {
    const project = writeVersion(
      [SHOT('01', 0), { number: '02', title: 'No start' }, SHOT('03', 6), SHOT('03', 7), SHOT('04', 4), { start: 1, title: 'No number' }, SHOT('05', 12)],
      PAGE(SCENE('a', 0, 10)),
    );

    const version = await project.readVersion('r', 1);

    expect(version.issues.map((i) => i.message)).toEqual([
      'shots.json: shot 02 has no start time',
      'shots.json: shot number 03 is used twice',
      'shots.json: shot 6 in the list has no number',
      'shot 05: starts at 12s, at or after the end of the reel (10s)',
      'shots.json: shots are not in time order',
      'shot 05: starts at 12s but no scene covers that time',
    ]);
    expect(version.shots.map((s) => s.number)).toEqual(['01', '03', '04', '05']);
  });

  it('reports a shot list that is not a list', async () => {
    const project = writeVersion({ nope: true }, PAGE(SCENE('a', 0, 10)));

    const version = await project.readVersion('r', 1);

    expect(version.issues.map((i) => i.message)).toEqual(['shots.json: no list of shots']);
    expect(version.shots).toEqual([]);
  });

  it('reports scene markup problems: no page, no scenes, and scenes without numeric timing', async () => {
    const noPage = await writeVersion([SHOT('01', 0)], null).readVersion('r', 1);
    const noScenes = await writeVersion([SHOT('01', 0)], PAGE('<div data-scene="a">no timing</div>')).readVersion('r', 1);
    const partial = await writeVersion(
      [SHOT('01', 0)],
      PAGE(SCENE('a', 0, 5) + '<section data-scene="b" data-start="soon" data-duration="2"><i data-el="y"></i></section>'),
    ).readVersion('r', 1);

    expect(noPage.issues.map((i) => i.message)).toEqual(['the version has no index.html']);
    expect(noScenes.issues.map((i) => i.message)).toEqual([
      'the page has no scenes with data-start and data-duration',
      'scene a: data-start or data-duration is missing or not a number',
    ]);
    expect(partial.issues.map((i) => i.message)).toEqual(['scene b: data-start or data-duration is missing or not a number']);
  });

  it('counts repeated element names and accepts the same name in different scenes', async () => {
    const project = writeVersion(
      [SHOT('01', 0), SHOT('02', 5)],
      PAGE(SCENE('a', 0, 5, ['t', 't', 't', 'u']) + SCENE('b', 5, 5, ['t'])),
    );

    const version = await project.readVersion('r', 1);

    expect(version.issues.map((i) => i.message)).toEqual(['scene a: element name "t" is used 3 times']);
  });

  it('counts a shot that starts exactly where a scene starts as covered', async () => {
    const project = writeVersion([SHOT('01', 0), SHOT('02', 3.6)], PAGE(SCENE('a', 0, 3.6) + SCENE('b', 3.6, 6.4)));

    expect((await project.readVersion('r', 1)).issues).toEqual([]);
  });
});

describe('copyBatch with contract issues', () => {
  const REEL = 'launch-teaser';
  const BATCH = 'reels/launch-teaser/v1/comments.json';

  async function commented() {
    const dir = copyFixture('broken-project');
    const project = openProject(dir);
    await project.addComment(REEL, 1, { pin: { shot: '03', x: 0.4, y: 0.5, element: null }, text: 'Ticker is too fast.' });
    return { dir, project };
  }

  it('adds an Issues block after Notes and an issues array to the batch file', async () => {
    const { dir, project } = await commented();
    await project.setNote(REEL, 1, 'Tighten the middle.');

    const { text } = await project.copyBatch(REEL, 1, {
      includeIssues: true,
      runtimeIssues: ['shot 02: seek(3) threw: boom', 'shot 02: seek(3) threw: boom', 'shot 04: no named elements'],
    });

    expect(text).toBe(
      [
        'Kinotta comments: Launch teaser, v1',
        `Saved as ${BATCH}`,
        '',
        '1. Shot 03, 06.00s, position 40% 50%: Ticker is too fast.',
        '',
        'Notes',
        '- Tighten the middle.',
        '',
        'Contract issues',
        '- shots.json: shot 05 is missing a title',
        '- scene product-card: element name "card" is used twice',
        '- shot 03: no named elements',
        '- shot 04: starts at 9s but no scene covers that time',
        '- shot 02: seek(3) threw: boom',
        '- shot 04: no named elements',
        '',
      ].join('\n'),
    );
    const saved = JSON.parse(readFileSync(join(dir, BATCH), 'utf8'));
    expect(saved.issues).toEqual([
      'shots.json: shot 05 is missing a title',
      'scene product-card: element name "card" is used twice',
      'shot 03: no named elements',
      'shot 04: starts at 9s but no scene covers that time',
      'shot 02: seek(3) threw: boom',
      'shot 04: no named elements',
    ]);
  });

  it('leaves the text and file as before when issues are not included', async () => {
    const { dir, project } = await commented();

    const plain = await project.copyBatch(REEL, 1);
    const asked = await project.copyBatch(REEL, 1, { includeIssues: false, runtimeIssues: ['shot 02: x'] });

    expect(plain.text).toBe(
      ['Kinotta comments: Launch teaser, v1', `Saved as ${BATCH}`, '', '1. Shot 03, 06.00s, position 40% 50%: Ticker is too fast.', ''].join('\n'),
    );
    expect(asked.text).toBe(plain.text);
    expect(JSON.parse(readFileSync(join(dir, BATCH), 'utf8'))).not.toHaveProperty('issues');
  });

  it('adds nothing when the version has no issues to include', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    await project.addComment('product-showreel', 2, { pin: { shot: '03', x: 0.5, y: 0.6, element: 'icons-word' }, text: 'Hold it.' });

    const { text } = await project.copyBatch('product-showreel', 2, { includeIssues: true, runtimeIssues: [] });

    expect(text).not.toContain('Contract issues');
  });
});
