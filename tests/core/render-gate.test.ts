import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import type { Project, RenderPreset } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const LAUNCHER = resolve(import.meta.dirname, '../../bin/kinotta.mjs');
const RENDER_TIMEOUT_MS = 180_000;
const FOOTAGE_REEL = 'founder-talk';
const BROKEN_REEL = 'launch-teaser';

/** A half-second code-only page that keeps the timing contract: a Final of it is quick. */
const TINY_PAGE = `<!DOCTYPE html><html><head><style>html,body{margin:0;background:#211b16}#box{position:absolute;top:40%;width:10vh;height:10vh;background:#e8741c}</style></head>
<body><section data-scene="box" data-start="0" data-duration="0.5"><div id="box" data-el="box"></div></section><script>window.DURATION=0.5;window.seek=function(t){document.getElementById('box').style.left=(t*80)+'vw';};seek(0);</script></body></html>`;

function tinyProject(): string {
  const dir = copyFixture('showreel-project');
  const reelDir = join(dir, 'reels', 'tiny');
  mkdirSync(join(reelDir, 'v1'), { recursive: true });
  writeFileSync(join(reelDir, 'reel.json'), JSON.stringify({ title: 'Tiny' }));
  writeFileSync(join(reelDir, 'v1', 'index.html'), TINY_PAGE);
  writeFileSync(join(reelDir, 'v1', 'shots.json'), JSON.stringify({ contract: 1, duration: 0.5, shots: [{ number: '01', start: 0, title: 'Box', description: 'A box.' }] }));
  return dir;
}

/** The reason a render is refused, or null when it is queued. */
async function refusal(project: Project, reel: string, version: number, preset: RenderPreset): Promise<string | null> {
  try {
    await project.render({ reel, version, preset });
    return null;
  } catch (err) {
    expect(err).toMatchObject({ code: 'invalid' });
    return (err as Error).message;
  }
}

async function renders(project: Project, reel: string, version: number): Promise<void> {
  const job = await project.whenRendered((await project.render({ reel, version, preset: 'draft' })).id);
  expect(job.error).toBeUndefined();
  expect(job.state).toBe('done');
}

describe('the render gate', () => {
  it('refuses a Final when a local graphic script makes independent page sound', async () => {
    const dir = tinyProject();
    const version = join(dir, 'reels', 'tiny', 'v1');
    writeFileSync(join(version, 'index.html'), TINY_PAGE.replace('</body>', '<script src="sound.js"></script></body>'));
    writeFileSync(join(version, 'sound.js'), 'new Audio("hit.wav").play();');
    const project = openProject(dir);
    expect(await refusal(project, 'tiny', 1, 'final')).toContain('shared mix');
    expect(project.renderJobs()).toEqual([]);
  });

  it('renders a Final of a version that is not approved: pressing Render is the decision', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const project = openProject(tinyProject());

    const job = await project.whenRendered((await project.render({ reel: 'tiny', version: 1, preset: 'final' })).id);

    expect(job).toMatchObject({ state: 'done', output: 'reels/tiny/renders/tiny-v1-final-1080p30.mp4' });
  });

  it('refuses an older footage version built before plans were kept, renders a Draft of it, and lets the newest through', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = copyFixture('footage-project');
    // A newer version built the same way: no plan of its own, so it plays the reel's current plan, which is its own.
    cpSync(join(dir, 'reels', FOOTAGE_REEL, 'v1'), join(dir, 'reels', FOOTAGE_REEL, 'v2'), { recursive: true });
    const project = openProject(dir);

    expect(await refusal(project, FOOTAGE_REEL, 1, 'final')).toBe("v1 can't be rendered as a Final: it was built before plans were kept.");
    await renders(project, FOOTAGE_REEL, 1);
    const newest = await project.render({ reel: FOOTAGE_REEL, version: 2, preset: 'final' });
    expect(newest.state).toBe('queued');
    await project.cancelRender(newest.id);
  });

  it('refuses a version with contract issues, naming them, and renders a Draft of it', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const project = openProject(copyFixture('broken-project'));

    const reason = await refusal(project, BROKEN_REEL, 1, 'final');

    expect(reason).toMatch(/^v1 can't be rendered as a Final: it has 4 contract issues: /);
    expect(reason).toContain('shots.json: shot 05 is missing a title');
    expect(reason).toContain('scene product-card: element name "card" is used twice');
    await renders(project, BROKEN_REEL, 1);
  });

  it('counts footage issues as contract issues, and names every reason at once', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = copyFixture('footage-project');
    rmSync(join(dir, 'reels', FOOTAGE_REEL, 'transcript.json'));
    cpSync(join(dir, 'reels', FOOTAGE_REEL, 'v1'), join(dir, 'reels', FOOTAGE_REEL, 'v2'), { recursive: true });
    const project = openProject(dir);

    const reason = await refusal(project, FOOTAGE_REEL, 1, 'overlay');

    expect(reason).toMatch(/^v1 can't be rendered as an Overlay: it was built before plans were kept; it has \d+ contract issues?: /);
    expect(reason).toContain('has no transcript.json');
    await renders(project, FOOTAGE_REEL, 1);
  });

  it('warns about footage issues when a footage version is approved', async () => {
    const dir = copyFixture('footage-project');
    rmSync(join(dir, 'reels', FOOTAGE_REEL, 'transcript.json'));

    const approved = await openProject(dir).approveVersion(FOOTAGE_REEL, 1);

    expect(approved.warning).toContain('has no transcript.json');
  });
});

describe('kinotta render and the gate', () => {
  it('prints why a Final is refused, with no talk of approval', () => {
    const dir = copyFixture('broken-project');

    const run = spawnSync(process.execPath, [LAUNCHER, 'render', BROKEN_REEL, 'v1', '--preset', 'final'], { cwd: dir, encoding: 'utf8', timeout: RENDER_TIMEOUT_MS });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("v1 can't be rendered as a Final: it has 4 contract issues");
    expect(run.stderr).not.toMatch(/approv/i);
    expect(run.stdout).toBe('');
  }, RENDER_TIMEOUT_MS);
});
