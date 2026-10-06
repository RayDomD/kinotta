import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

const approve = (dir: string, reel: string, n: number): void =>
  writeFileSync(join(dir, 'reels', reel, `v${n}`, 'approval.json'), JSON.stringify({ approvedBy: 'you', at: '2026-10-05T00:00:00.000Z' }));

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
  it('refuses a Final and an Overlay of a version that is not approved, and renders a Draft of it', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const project = openProject(tinyProject());

    expect(await refusal(project, 'tiny', 1, 'final')).toMatch(/^v1 can't be rendered as a Final: it isn't approved/);
    expect(await refusal(project, 'tiny', 1, 'overlay')).toMatch(/^v1 can't be rendered as an Overlay: it isn't approved/);
    await renders(project, 'tiny', 1);
  });

  it('lets an approved version with no issues through to a Final', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = tinyProject();
    approve(dir, 'tiny', 1);
    const project = openProject(dir);

    const job = await project.whenRendered((await project.render({ reel: 'tiny', version: 1, preset: 'final' })).id);

    expect(job).toMatchObject({ state: 'done', output: 'reels/tiny/renders/tiny-v1-final-1080p30.mp4' });
  });

  it('refuses a footage version built before plans were kept, and renders a Draft of it', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = copyFixture('footage-project');
    approve(dir, FOOTAGE_REEL, 1);
    const project = openProject(dir);

    expect(await refusal(project, FOOTAGE_REEL, 1, 'final')).toBe("v1 can't be rendered as a Final: it was built before plans were kept.");
    await renders(project, FOOTAGE_REEL, 1);
  });

  it('refuses a version with contract issues, naming them, and renders a Draft of it', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = copyFixture('broken-project');
    approve(dir, BROKEN_REEL, 1);
    const project = openProject(dir);

    const reason = await refusal(project, BROKEN_REEL, 1, 'final');

    expect(reason).toMatch(/^v1 can't be rendered as a Final: it has 4 contract issues: /);
    expect(reason).toContain('shots.json: shot 05 is missing a title');
    expect(reason).toContain('scene product-card: element name "card" is used twice');
    await renders(project, BROKEN_REEL, 1);
  });

  it('counts footage issues as contract issues, and names every reason at once', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = copyFixture('footage-project');
    rmSync(join(dir, 'reels', FOOTAGE_REEL, 'transcript.json'));
    const project = openProject(dir);

    const reason = await refusal(project, FOOTAGE_REEL, 1, 'overlay');

    expect(reason).toMatch(/^v1 can't be rendered as an Overlay: it isn't approved \(the owner approves it in Kinotta\); it was built before plans were kept; it has \d+ contract issues?: /);
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
  it('refuses an unapproved Final and tells an agent to ask the owner to approve it in Kinotta', () => {
    const dir = tinyProject();

    const run = spawnSync(process.execPath, [LAUNCHER, 'render', 'tiny', 'v1', '--preset', 'final'], { cwd: dir, encoding: 'utf8', timeout: RENDER_TIMEOUT_MS });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("v1 can't be rendered as a Final: it isn't approved");
    expect(run.stderr).toContain('Only the owner approves. Ask them to approve v1 in Kinotta, then render again.');
    expect(run.stdout).toBe('');
  }, RENDER_TIMEOUT_MS);
});
