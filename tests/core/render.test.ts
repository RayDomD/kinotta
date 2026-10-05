import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KinottaError, openProject } from '../../server/core/index.ts';
import type { ProjectEvent, RenderJob } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const LAUNCHER = resolve(import.meta.dirname, '../../bin/kinotta.mjs');
const SHOWREEL = 'product-showreel';
const TINY = 'tiny';
const RENDER_TIMEOUT_MS = 120_000;

/** A one-second code-only page with no #stage, like the hand-built fixture pages: drawn at 1920x1080. */
const TINY_PAGE = `<!DOCTYPE html><html><head><style>html,body{margin:0;background:#211b16}#box{position:absolute;top:40%;width:10vh;height:10vh;background:#e8741c}</style></head>
<body><div id="box"></div><script>window.DURATION=1;window.seek=function(t){document.getElementById('box').style.left=(t*80)+'vw';};seek(0);</script></body></html>`;
const TINY_SHOTS = { contract: 1, duration: 1, shots: [{ number: '01', start: 0, title: 'Box', description: 'A box slides across.' }] };

/** The showreel sample plus a one-second code-only reel, `tiny`, whose v1 renders fast. */
function project(page = TINY_PAGE): string {
  const dir = copyFixture('showreel-project');
  const reelDir = join(dir, 'reels', TINY);
  mkdirSync(join(reelDir, 'v1'), { recursive: true });
  writeFileSync(join(reelDir, 'reel.json'), JSON.stringify({ title: 'Tiny' }));
  writeFileSync(join(reelDir, 'v1', 'index.html'), page);
  writeFileSync(join(reelDir, 'v1', 'shots.json'), JSON.stringify(TINY_SHOTS));
  return dir;
}

const rendersDir = (dir: string, reel: string): string => join(dir, 'reels', reel, 'renders');
const filesIn = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).sort() : []);

function probe(file: string): { width: number; height: number; frames: number; rate: string } {
  const run = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames,r_frame_rate', '-of', 'json', file], { encoding: 'utf8' });
  const stream = (JSON.parse(run.stdout) as { streams: Array<{ width: number; height: number; nb_read_frames: string; r_frame_rate: string }> }).streams[0]!;
  return { width: stream.width, height: stream.height, frames: Number(stream.nb_read_frames), rate: stream.r_frame_rate };
}

/** x264 writes its settings into the stream, so the CRF a file was made with can be read back from its bytes. */
const crfOf = (file: string): string | undefined => /crf=(\d+\.\d)/.exec(readFileSync(file).toString('latin1'))?.[1];

function renderEvents(project: ReturnType<typeof openProject>): { jobs: RenderJob[]; stop: () => void } {
  const jobs: RenderJob[] = [];
  const stop = project.subscribe((event: ProjectEvent) => {
    if (event.type === 'render-progress') jobs.push(event.job);
  });
  return { jobs, stop };
}

describe('Draft render of a code-only reel', () => {
  it('renders the showreel v1 to its named file at half size, 30 fps, CRF 28', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);

    const queued = await project.render({ reel: SHOWREEL, version: 1, preset: 'draft' });
    const job = await project.whenRendered(queued.id);

    expect(job).toMatchObject({ state: 'done', reel: SHOWREEL, version: 1, preset: 'draft', progress: 1 });
    expect(job.output).toBe(`reels/${SHOWREEL}/renders/${SHOWREEL}-v1-draft-540p30.mp4`);
    const file = join(dir, job.output!);
    expect(probe(file)).toEqual({ width: 960, height: 540, frames: 15 * 30, rate: '30/1' });
    expect(crfOf(file)).toBe('28.0');
    expect(filesIn(rendersDir(dir, SHOWREEL))).toEqual([`${SHOWREEL}-v1-draft-540p30.mp4`]);
  });

  it('reports the job queued, running with growing progress, then done', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = project();
    const proj = openProject(dir);
    const { jobs, stop } = renderEvents(proj);

    const queued = await proj.render({ reel: TINY, version: 1, preset: 'draft' });
    await proj.whenRendered(queued.id);
    stop();

    expect(queued.state).toBe('queued');
    const states = jobs.map((job) => job.state);
    expect(states[0]).toBe('queued');
    expect(states.at(-1)).toBe('done');
    expect(states).toContain('running');
    const running = jobs.filter((job) => job.state === 'running').map((job) => job.progress);
    expect(running.length).toBeGreaterThan(2);
    expect(running).toEqual([...running].sort((a, b) => a - b));
    expect(jobs.at(-1)!.remaining).toBe(0);
  });

  it('replaces the file when the same version is rendered again with the same settings', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = project();
    const proj = openProject(dir);

    const first = await proj.whenRendered((await proj.render({ reel: TINY, version: 1, preset: 'draft' })).id);
    const firstTime = statSync(join(dir, first.output!)).mtimeMs;
    const second = await proj.whenRendered((await proj.render({ reel: TINY, version: 1, preset: 'draft' })).id);

    expect(second.output).toBe(first.output);
    expect(statSync(join(dir, second.output!)).mtimeMs).toBeGreaterThan(firstTime);
    expect(filesIn(rendersDir(dir, TINY))).toEqual([`${TINY}-v1-draft-540p30.mp4`]);
  });

  it('runs one job at a time, in the order they were queued', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = project();
    const proj = openProject(dir);
    const { jobs, stop } = renderEvents(proj);

    const a = await proj.render({ reel: TINY, version: 1, preset: 'draft' });
    const b = await proj.render({ reel: TINY, version: 1, preset: 'draft' });
    expect(proj.renderJobs().map((job) => [job.id, job.state])).toEqual([
      [a.id, expect.stringMatching(/queued|running/)],
      [b.id, 'queued'],
    ]);
    await proj.whenRendered(b.id);
    stop();

    const order = jobs.filter((job) => job.state !== 'queued').map((job) => `${job.id === a.id ? 'a' : 'b'}:${job.state}`);
    const lastOfA = order.lastIndexOf('a:done');
    const firstOfB = order.indexOf('b:running');
    expect(lastOfA).toBeGreaterThanOrEqual(0);
    expect(firstOfB).toBeGreaterThan(lastOfA);
    expect(proj.renderJobs()).toEqual([]);
  });

  it('leaves no file in renders/ when the render fails, and says why', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = project(TINY_PAGE.replace(/window\.seek=[^;]*;\};seek\(0\);/, ''));
    const proj = openProject(dir);

    const job = await proj.whenRendered((await proj.render({ reel: TINY, version: 1, preset: 'draft' })).id);

    expect(job.state).toBe('failed');
    expect(job.error).toMatch(/seek/);
    expect(job.output).toBeUndefined();
    expect(filesIn(rendersDir(dir, TINY))).toEqual([]);
  });

  it('refuses an unknown reel or version', async () => {
    const proj = openProject(project());

    await expect(proj.render({ reel: 'nope', version: 1, preset: 'draft' })).rejects.toMatchObject({ code: 'not-found' });
    await expect(proj.render({ reel: TINY, version: 9, preset: 'draft' })).rejects.toMatchObject({ code: 'not-found' });
    await expect(proj.render({ reel: TINY, version: 1, preset: 'draft' }).then((job) => proj.whenRendered(job.id))).resolves.toBeDefined();
  }, RENDER_TIMEOUT_MS);

  it('refuses Final and Overlay, and footage reels, which this slice does not render yet', async () => {
    const proj = openProject(project());
    const footage = openProject(copyFixture('footage-project'));

    await expect(proj.render({ reel: TINY, version: 1, preset: 'final' })).rejects.toBeInstanceOf(KinottaError);
    await expect(proj.render({ reel: TINY, version: 1, preset: 'overlay' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(footage.render({ reel: 'founder-talk', version: 1, preset: 'draft' })).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('kinotta render', () => {
  function cli(dir: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
    const run = spawnSync(process.execPath, [LAUNCHER, 'render', ...args], { cwd: dir, encoding: 'utf8', timeout: RENDER_TIMEOUT_MS });
    return { status: run.status, stdout: run.stdout, stderr: run.stderr };
  }

  it('renders a Draft in its own process, printing progress and the output path, then exits', { timeout: RENDER_TIMEOUT_MS }, () => {
    const dir = project();

    const run = cli(dir, [TINY, 'v1', '--preset', 'draft']);

    expect(run.status).toBe(0);
    const out = join(dir, 'reels', TINY, 'renders', `${TINY}-v1-draft-540p30.mp4`);
    expect(existsSync(out)).toBe(true);
    const lines = run.stdout.trim().split(/\r?\n/);
    expect(lines.some((line) => /^Rendering tiny v1 \(draft\): \d+%$/.test(line))).toBe(true);
    expect(lines.at(-1)).toBe(`Rendered ${out}`);
  });

  it('prints the usage for a missing version or preset, and the reason for an unknown reel', () => {
    const dir = project();

    for (const args of [[TINY], [TINY, 'v1'], [TINY, 'v1', '--preset', 'best'], [TINY, 'one', '--preset', 'draft']]) {
      const run = cli(dir, args);
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('Usage: kinotta render <reel> v<n> --preset draft|final|overlay');
    }
    const unknown = cli(dir, ['nope', 'v1', '--preset', 'draft']);
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('Reel "nope" not found');
  }, RENDER_TIMEOUT_MS);
});
