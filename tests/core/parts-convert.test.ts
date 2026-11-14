import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import type { PartsManifest } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const SLUG = 'product-showreel';
const SCENES = [
  { name: 'cube-lands', title: 'Cube lands', duration: 1.8 },
  { name: 'logo-lockup', title: 'Logo lockup', duration: 1.8 },
  { name: 'word-slams', title: 'Word slams', duration: 2.3 },
  { name: 'dashboard', title: 'All-in-one dashboard', duration: 2.5 },
  { name: 'icons-flows', title: 'Icons and flows', duration: 3.8 },
  { name: 'cta', title: 'Call to action', duration: 2.8 },
];

function writeRevision(reelDir: string, name: string, revision: string, label: string) {
  const folder = join(reelDir, 'shots', name, revision);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'shot.html'), `<section data-scene="${name}"><div data-el="label">${label}</div></section>`);
  writeFileSync(join(folder, 'shot.css'), `[data-scene="${name}"] [data-el="label"]{font-size:120px;position:absolute;left:140px;top:380px}`);
  writeFileSync(join(folder, 'shot.js'), `export function seek(local){}`);
}

/** What the skill asks the agent to write when it converts the single-page v2 and answers shot 03 with alternates. */
function convertWithAlternates(reelDir: string): PartsManifest {
  mkdirSync(join(reelDir, 'shared', 'r1'), { recursive: true });
  writeFileSync(join(reelDir, 'shared', 'r1', 'shared.css'), 'html,body{margin:0;background:#111}#stage{position:relative;width:1920px;height:1080px}');
  for (const scene of SCENES) writeRevision(reelDir, scene.name, 'r1', scene.title);
  writeRevision(reelDir, 'word-slams', 'r2', 'Words type on');
  writeRevision(reelDir, 'word-slams', 'r3', 'Words stack');
  const alternates = ['r1', 'r2', 'r3'].map((revision, index) => ({ revision, label: String.fromCharCode(65 + index), title: `Words ${index + 1}`, note: `Approach ${index + 1}`, duration: 2.3 }));
  const manifest: PartsManifest = {
    contract: 2,
    duration: SCENES.reduce((sum, scene) => sum + scene.duration, 0),
    shared: 'r1',
    shots: SCENES.map((scene) => ({ name: scene.name, revision: 'r1', duration: scene.duration, title: scene.title, description: `${scene.title}.`, ...(scene.name === 'word-slams' ? { alternates } : {}) })),
  };
  writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
  return manifest;
}

describe('converting a single-page reel to parts', () => {
  it('lets a comment on a code-built single-page reel ask for options and names it on the batch', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    const { comment } = await project.addComment(SLUG, 2, { pin: { shot: '03', x: 0.5, y: 0.5, element: null }, text: 'Not sure, show me some options', options: 3 });
    expect(comment.options).toBe(3);
    const batch = (await project.copyBatch(SLUG, 2)).text;
    expect(batch).toContain('Shot 03 · 3 alternates');
    expect(batch).toContain('Convert to parts');
  });

  it('builds the next version of the same reel as parts, offering the alternates on the shot that asked', async () => {
    const dir = copyFixture('showreel-project');
    const reelDir = join(dir, 'reels', SLUG);
    const project = openProject(dir);
    // Left unsent, so it carries into the converted version.
    await project.addComment(SLUG, 2, { pin: { shot: '03', x: 0.5, y: 0.5, element: null }, text: 'Not sure, show me some options', options: 3 });
    const reelsBefore = readdirSync(join(dir, 'reels')).sort();
    convertWithAlternates(reelDir);

    const built = await project.buildParts(SLUG, 'Codex');

    expect(built.version).toBe(3);
    expect(readdirSync(join(dir, 'reels')).sort()).toEqual(reelsBefore);
    const v3 = await project.readVersion(SLUG, 3);
    expect(v3.issues).toEqual([]);
    expect(v3.shots.map((shot) => shot.name)).toEqual(SCENES.map((scene) => scene.name));
    expect(v3.shots[2]!.alternates?.map((alternate) => alternate.label)).toEqual(['A', 'B', 'C']);
    const carried = await project.listComments(SLUG, 3);
    expect(carried).toHaveLength(1);
    expect(carried[0]!.pin).toMatchObject({ shot: '03', shotName: 'word-slams' });
    expect(carried[0]!.options).toBeUndefined();
    // The single-page versions stay exactly as they were.
    expect((await project.readVersion(SLUG, 2)).shots).toHaveLength(6);
  });
});
