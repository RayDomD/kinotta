import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import type { Project, ProjectEvent, RenderJob } from '../../server/core/index.ts';
import { startServer, type RunningServer } from '../../server/main.ts';
import { copyFixture, emptyProject } from '../helpers/project.ts';

const LAUNCHER = resolve(import.meta.dirname, '../../bin/kinotta.mjs');
const PORT_FILE = '.kinotta-server.json';
const SHOWREEL = 'product-showreel';
const TINY = 'tiny';
const RENDER_TIMEOUT_MS = 180_000;
/** Cancel stops the processes and removes the files; it must not wait for the render to finish. */
const CANCEL_WITHIN_MS = 15_000;

const TINY_PAGE = `<!DOCTYPE html><html><head><style>html,body{margin:0;background:#211b16}#box{position:absolute;top:40%;width:10vh;height:10vh;background:#e8741c}</style></head>
<body><div id="box"></div><script>window.DURATION=1;window.seek=function(t){document.getElementById('box').style.left=(t*80)+'vw';};seek(0);</script></body></html>`;
const TINY_SHOTS = { contract: 1, duration: 1, shots: [{ number: '01', start: 0, title: 'Box', description: 'A box slides across.' }] };

/** The showreel sample (its v1 is a 15-second Draft) plus a one-second code-only reel, `tiny`. */
function project(): string {
  const dir = copyFixture('showreel-project');
  const reelDir = join(dir, 'reels', TINY);
  mkdirSync(join(reelDir, 'v1'), { recursive: true });
  writeFileSync(join(reelDir, 'reel.json'), JSON.stringify({ title: 'Tiny' }));
  writeFileSync(join(reelDir, 'v1', 'index.html'), TINY_PAGE);
  writeFileSync(join(reelDir, 'v1', 'shots.json'), JSON.stringify(TINY_SHOTS));
  return dir;
}

const rendersDir = (dir: string, reel: string): string => join(dir, 'reels', reel, 'renders');
const filesIn = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).sort() : []);

/** Resolves with the first `render-progress` job that passes the test. */
function nextJob(project: Project, test: (job: RenderJob) => boolean): Promise<RenderJob> {
  return new Promise((resolveJob) => {
    const stop = project.subscribe((event: ProjectEvent) => {
      if (event.type !== 'render-progress' || !test(event.job)) return;
      stop();
      resolveJob(event.job);
    });
  });
}

const running: RunningServer[] = [];
afterEach(async () => {
  for (const server of running.splice(0)) await server.close();
});

async function serve(dir: string): Promise<RunningServer> {
  const server = await startServer({ projectDir: dir, port: 0 });
  running.push(server);
  return server;
}

/** Runs `kinotta <args>` without blocking this process, which may be hosting the server it talks to. */
function cli(args: string[], cwd: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [LAUNCHER, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    child.on('close', (status) => resolveRun({ status, stdout, stderr }));
  });
}

describe('cancelling a render', () => {
  it('drops a queued job at once, and it never runs', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const proj = openProject(project());
    const seen: RenderJob[] = [];
    const stop = proj.subscribe((event) => event.type === 'render-progress' && seen.push(event.job));

    const first = await proj.render({ reel: SHOWREEL, version: 1, preset: 'draft' });
    const second = await proj.render({ reel: TINY, version: 1, preset: 'draft' });
    const cancelled = await proj.cancelRender(second.id);

    expect(cancelled).toMatchObject({ id: second.id, state: 'cancelled' });
    expect(proj.renderJobs().map((job) => job.id)).toEqual([first.id]);
    await expect(proj.whenRendered(second.id)).resolves.toMatchObject({ state: 'cancelled' });
    await proj.cancelRender(first.id);
    stop();
    expect(seen.filter((job) => job.id === second.id).map((job) => job.state)).toEqual(['queued', 'cancelled']);
  });

  it('stops a running job, leaving no output file and no .work-<job> folder', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = project();
    const proj = openProject(dir);
    const started = nextJob(proj, (job) => job.state === 'running' && job.progress > 0);

    const queued = await proj.render({ reel: SHOWREEL, version: 1, preset: 'draft' });
    await started;
    // Parallel segments (T54) work here; a cancel removes the folder whatever is in it.
    const work = join(rendersDir(dir, SHOWREEL), `.work-${queued.id}`);
    mkdirSync(work);
    writeFileSync(join(work, 'segment-0.mp4'), 'partial');
    const asked = Date.now();
    const job = await proj.cancelRender(queued.id);

    expect(Date.now() - asked).toBeLessThan(CANCEL_WITHIN_MS);
    expect(job).toMatchObject({ state: 'cancelled', remaining: null });
    expect(job.output).toBeUndefined();
    expect(filesIn(rendersDir(dir, SHOWREEL))).toEqual([]);
    expect(proj.renderJobs()).toEqual([]);
    await expect(proj.whenRendered(queued.id)).resolves.toMatchObject({ state: 'cancelled' });
  });

  it('returns a finished job unchanged, and refuses an unknown one', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const proj = openProject(project());

    const done = await proj.whenRendered((await proj.render({ reel: TINY, version: 1, preset: 'draft' })).id);

    await expect(proj.cancelRender(done.id)).resolves.toMatchObject({ state: 'done', output: done.output });
    await expect(proj.cancelRender('nope')).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('the renders API', () => {
  it('queues with POST, lists with GET and cancels with DELETE', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = project();
    const { url } = await serve(dir);
    const post = (body: unknown): Promise<Response> => fetch(`${url}/api/renders`, { method: 'POST', body: JSON.stringify(body) });

    const created = await post({ reel: SHOWREEL, version: 1, preset: 'draft' });
    const job = (await created.json()) as RenderJob;
    const listed = (await (await fetch(`${url}/api/renders`)).json()) as { jobs: RenderJob[] };
    const deleted = await fetch(`${url}/api/renders/${job.id}`, { method: 'DELETE' });

    expect(created.status).toBe(201);
    expect(job).toMatchObject({ reel: SHOWREEL, version: 1, preset: 'draft', state: 'queued' });
    expect(listed.jobs.map((entry) => entry.id)).toEqual([job.id]);
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({ id: job.id, state: 'cancelled' });
    expect(filesIn(rendersDir(dir, SHOWREEL))).toEqual([]);
  });

  it('refuses a malformed request, an unapproved Final and an unknown job', async () => {
    const { url } = await serve(project());
    const post = (body: unknown): Promise<Response> => fetch(`${url}/api/renders`, { method: 'POST', body: JSON.stringify(body) });

    const malformed = await post({ reel: TINY, version: 'one', preset: 'draft' });
    const unapproved = await post({ reel: TINY, version: 1, preset: 'final' });
    const unknown = await fetch(`${url}/api/renders/nope`, { method: 'DELETE' });

    expect(malformed.status).toBe(422);
    expect(unapproved.status).toBe(422);
    expect(((await unapproved.json()) as { error: string }).error).toMatch(/isn't approved/);
    expect(unknown.status).toBe(404);
  });
});

describe('the port file', () => {
  it('names the running server while it runs, and is removed when it closes', async () => {
    const dir = project();
    const server = await startServer({ projectDir: dir, port: 0 });

    expect(JSON.parse(readFileSync(join(dir, PORT_FILE), 'utf8'))).toEqual({ port: server.port, pid: process.pid });
    await server.close();
    expect(existsSync(join(dir, PORT_FILE))).toBe(false);
  });

  it("leaves a later server's port file when an earlier one closes", async () => {
    const dir = project();
    const earlier = await startServer({ projectDir: dir, port: 0 });
    const later = await serve(dir);

    await earlier.close();

    expect(JSON.parse(readFileSync(join(dir, PORT_FILE), 'utf8'))).toMatchObject({ port: later.port });
  });
});

describe('kinotta render across processes', () => {
  it("joins the running editor's queue and waits behind the render it started", { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = project();
    const server = await serve(dir);
    const first = (await (await fetch(`${server.url}/api/renders`, { method: 'POST', body: JSON.stringify({ reel: SHOWREEL, version: 1, preset: 'draft' }) })).json()) as RenderJob;

    const run = await cli(['render', TINY, 'v1', '--preset', 'draft', '--project', dir], emptyProject());

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('Waiting behind 1 render');
    const showreel = await server.project.whenRendered(first.id);
    expect(showreel.state).toBe('done');
    const tinyFile = join(rendersDir(dir, TINY), `${TINY}-v1-draft-540p30.mp4`);
    expect(run.stdout.trim().split(/\r?\n/).at(-1)).toBe(`Rendered ${tinyFile}`);
    expect(statSync(tinyFile).mtimeMs).toBeGreaterThan(statSync(join(dir, showreel.output!)).mtimeMs);
    // The editor's port file is still there: the CLI only joined.
    expect(JSON.parse(readFileSync(join(dir, PORT_FILE), 'utf8'))).toMatchObject({ port: server.port });
  });

  it('renders on its own without an editor, then exits and removes its port file', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = project();

    const run = await cli(['render', TINY, 'v1', '--preset', 'draft', '--project', dir], emptyProject());

    expect(run.status).toBe(0);
    expect(existsSync(join(rendersDir(dir, TINY), `${TINY}-v1-draft-540p30.mp4`))).toBe(true);
    expect(existsSync(join(dir, PORT_FILE))).toBe(false);
  });

  it("ignores a stale port file: a dead process, no server on the port, or another project's server", { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = project();
    const dead = spawnSync(process.execPath, ['-e', '']).pid!;
    const closed = await startServer({ projectDir: emptyProject(), port: 0 });
    await closed.close();
    const other = await serve(emptyProject());

    for (const stale of [{ port: closed.port, pid: dead }, { port: closed.port, pid: process.pid }, { port: other.port, pid: process.pid }]) {
      writeFileSync(join(dir, PORT_FILE), JSON.stringify(stale));
      const run = await cli(['render', TINY, 'v1', '--preset', 'draft'], dir);
      expect(run.stderr).toBe('');
      expect(run.status).toBe(0);
      expect(existsSync(join(dir, PORT_FILE))).toBe(false);
    }
  });
});
