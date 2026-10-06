import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import type { Project, RenderJob } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const SHOWREEL = 'product-showreel';
const SLOW = 'slow';
const RENDER_TIMEOUT_MS = 300_000;
/** Mean difference per channel (0 to 255) allowed between the same frame of two renders. */
const FRAME_TOLERANCE = 2;
const SEGMENTS = 4;

/** A four-second code-only page whose seek throws past `failAt` seconds, when given. */
function slowPage(failAt?: number): string {
  const guard = failAt === undefined ? '' : `if(t>${failAt})throw new Error('broken at '+t);`;
  return `<!DOCTYPE html><html><head><style>html,body{margin:0;background:#211b16}#box{position:absolute;top:40%;width:10vh;height:10vh;background:#e8741c}</style></head>
<body><div id="box"></div><script>window.DURATION=4;window.seek=function(t){${guard}document.getElementById('box').style.left=(t*20)+'vw';};seek(0);</script></body></html>`;
}

function project(page = slowPage()): string {
  const dir = copyFixture('showreel-project');
  const reelDir = join(dir, 'reels', SLOW);
  mkdirSync(join(reelDir, 'v1'), { recursive: true });
  writeFileSync(join(reelDir, 'reel.json'), JSON.stringify({ title: 'Slow' }));
  writeFileSync(join(reelDir, 'v1', 'index.html'), page);
  writeFileSync(join(reelDir, 'v1', 'shots.json'), JSON.stringify({ contract: 1, duration: 4, shots: [{ number: '01', start: 0, title: 'Box', description: 'A box.' }] }));
  return dir;
}

const rendersDir = (dir: string, reel: string): string => join(dir, 'reels', reel, 'renders');
const filesIn = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).sort() : []);

function frameCount(file: string): number {
  const run = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return Number(run.stdout.trim());
}

/** One video frame, by its index, as raw RGB. */
function frameAt(file: string, index: number): Buffer {
  const run = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', `select=eq(n\\,${index})`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 * 1024 * 1024 });
  return run.stdout;
}

function meanDifference(a: Buffer, b: Buffer): number {
  expect(a.length).toBe(b.length);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
}

async function renderWith(dir: string, segments: number, reel: string): Promise<{ job: RenderJob; events: RenderJob[]; workSeen: boolean }> {
  const proj: Project = openProject(dir, { renderSegments: segments });
  const events: RenderJob[] = [];
  const stop = proj.subscribe((event) => event.type === 'render-progress' && events.push(event.job));
  const queued = await proj.render({ reel, version: 1, preset: 'draft' });
  let workSeen = false;
  const watch = setInterval(() => (workSeen ||= existsSync(join(rendersDir(dir, reel), `.work-${queued.id}`))), 50);
  const job = await proj.whenRendered(queued.id).finally(() => clearInterval(watch));
  stop();
  return { job, events, workSeen };
}

describe('parallel segments', () => {
  it('renders the showreel in segments to the same frames as one page, and removes its work folder', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const singleDir = copyFixture('showreel-project');
    const splitDir = copyFixture('showreel-project');

    const single = await renderWith(singleDir, 1, SHOWREEL);
    const split = await renderWith(splitDir, SEGMENTS, SHOWREEL);

    expect(single.workSeen).toBe(false);
    expect(split.workSeen).toBe(true);
    expect(split.job.output).toBe(single.job.output);
    const one = join(singleDir, single.job.output!);
    const many = join(splitDir, split.job.output!);
    const frames = frameCount(one);
    expect(frameCount(many)).toBe(frames);
    // The first and last frames, and both sides of each segment boundary.
    const boundaries = Array.from({ length: SEGMENTS - 1 }, (_, i) => Math.round(((i + 1) * frames) / SEGMENTS));
    for (const index of [0, ...boundaries.flatMap((b) => [b - 1, b]), frames - 1]) {
      expect(meanDifference(frameAt(many, index), frameAt(one, index))).toBeLessThan(FRAME_TOLERANCE);
    }
    expect(filesIn(rendersDir(splitDir, SHOWREEL))).toEqual([`${SHOWREEL}-v1-draft-540p30.mp4`]);
  });

  it('reports one growing percentage across the segments, with an estimate', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const { job, events } = await renderWith(project(), SEGMENTS, SLOW);

    expect(job.state).toBe('done');
    const running = events.filter((event) => event.state === 'running' && event.progress > 0);
    expect(running.length).toBeGreaterThan(SEGMENTS);
    expect(running.map((event) => event.progress)).toEqual(running.map((event) => event.progress).sort((a, b) => a - b));
    expect(running.some((event) => typeof event.remaining === 'number' && event.remaining > 0)).toBe(true);
  });

  it('fails with the failing segment\'s reason and leaves no work folder', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = project(slowPage(3));

    const { job, workSeen } = await renderWith(dir, SEGMENTS, SLOW);

    expect(workSeen).toBe(true);
    expect(job.state).toBe('failed');
    expect(job.error).toMatch(/broken at/);
    expect(filesIn(rendersDir(dir, SLOW))).toEqual([]);
  });

  it('cancels every segment and leaves no work folder', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = project();
    const proj = openProject(dir, { renderSegments: SEGMENTS });
    const started = new Promise<string>((resolveId) => {
      const stop = proj.subscribe((event) => {
        if (event.type !== 'render-progress' || event.job.state !== 'running' || event.job.progress === 0) return;
        stop();
        resolveId(event.job.id);
      });
    });

    await proj.render({ reel: SLOW, version: 1, preset: 'draft' });
    const id = await started;
    expect(existsSync(join(rendersDir(dir, SLOW), `.work-${id}`))).toBe(true);
    const job = await proj.cancelRender(id);

    expect(job.state).toBe('cancelled');
    expect(filesIn(rendersDir(dir, SLOW))).toEqual([]);
  });
});
