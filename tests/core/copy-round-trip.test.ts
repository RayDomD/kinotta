import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, cpSync, renameSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { openProject, type Project } from '../../server/core/index.ts';
import { DONE_MARKER } from '../../server/core/_internal/copy-watch.ts';
import type { ProjectEvent } from '../../server/core/_internal/types.ts';
import { copyFixture } from '../helpers/project.ts';

const projects: Project[] = [];
afterEach(async () => {
  for (const project of projects.splice(0)) await project.close();
});

const delay = (ms = 25) => new Promise((done) => setTimeout(done, ms));
async function until(check: () => boolean | Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > end) throw new Error('Condition did not arrive');
    await delay();
  }
}

let cachedPlan: string | null = null;
let cachedHtml: string | null = null;
let cachedShots: string | null = null;

function ensureCachedOutput(jobDir: string, fakeScript: string) {
  if (cachedPlan && cachedHtml && cachedShots) return;
  const res = spawnSync(process.execPath, [fakeScript, 'success'], {
    cwd: jobDir,
    input: 'prompt',
    env: { ...process.env, NODE_PATH: resolve('node_modules') },
    windowsHide: true,
  });
  expect(res.status).toBe(0);
  const out = join(jobDir, 'output');
  cachedPlan = readFileSync(join(out, 'plan.json'), 'utf8');
  cachedHtml = readFileSync(join(out, 'index.html'), 'utf8');
  cachedShots = readFileSync(join(out, 'shots.json'), 'utf8');
}

function writeValidOutput(outputDir: string, overrides: { shots?: string; plan?: string } = {}) {
  expect(cachedPlan).toBeTruthy();
  writeFileSync(join(outputDir, 'plan.json'), overrides.plan ?? cachedPlan!);
  writeFileSync(join(outputDir, 'index.html'), cachedHtml!);
  writeFileSync(join(outputDir, 'shots.json'), overrides.shots ?? cachedShots!);
}

async function setupCopyJob(options: { settleMs?: number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kinotta-copy-round-trip-'));
  cpSync(copyFixture('footage-project'), dir, { recursive: true });
  const fake = join(dir, 'fake agent.mjs');
  cpSync(resolve('tests/core/fake-broll-agent.mjs'), fake);
  const project = openProject(dir, {
    transcriber: async () => [{ text: 'hello', start: 0.5, end: 1.0 }],
    agent: {
      ceilingMs: 60_000,
      quietMs: 100,
      settleMs: options.settleMs ?? 50,
      launch: async () => { throw new Error('Copy job must not launch agent CLI'); },
    },
  });
  projects.push(project);
  await project.saveAgentSettings({ provider: 'copy' });
  const { slug } = await project.startReel({ video: 'media/talk.mp4', agentConfirmed: true });
  await project.whenTranscribed(slug);
  await project.whenAgentDone(slug);
  const job = (await project.agentJob(slug))!;
  expect(job.state).toBe('copy-ready');
  const jobDir = join(dir, 'reels', slug, '.agent/jobs', job.id);
  const outputDir = join(jobDir, 'output');
  ensureCachedOutput(jobDir, fake);
  return { dir, project, slug, job, jobDir, outputDir, fake };
}

describe('copy request round trip', () => {
  const TIMEOUT = 30_000;
  it('cancels an explicit acceptance while it is preparing, before it can publish', async () => {
    const { dir, project, slug, job, outputDir } = await setupCopyJob();
    writeValidOutput(outputDir);
    const accepting = project.acceptAgentOutput(slug, job.id);
    const cancelled = project.cancelAgentJob(slug);
    await accepting;
    expect(await cancelled).toMatchObject({ state: 'cancelled' });
    expect(existsSync(join(dir, 'reels', slug, 'v2'))).toBe(false);
  }, TIMEOUT);

  it('1. DONE triggers publish: validates, publishes v2, job becomes succeeded, version-added and agent-progress events fire', async () => {
    const { dir, project, slug } = await setupCopyJob({ settleMs: 50 });
    const events: ProjectEvent[] = [];
    const stop = project.subscribe((e) => events.push(e));

    const initialJob = (await project.agentJob(slug))!;
    const outputDir = join(dir, 'reels', slug, '.agent/jobs', initialJob.id, 'output');

    writeValidOutput(outputDir);
    writeFileSync(join(outputDir, DONE_MARKER), '');

    await until(async () => (await project.agentJob(slug))?.state === 'succeeded');
    const finalJob = (await project.agentJob(slug))!;

    expect(finalJob).toMatchObject({
      state: 'succeeded',
      version: 2,
      canRetry: false,
      canCopy: false,
    });
    expect(existsSync(join(dir, 'reels', slug, 'v2'))).toBe(true);
    const v2 = await project.readVersion(slug, 2);
    expect(v2.issues).toEqual([]);

    // Check events fired
    const validatingProgress = events.find(
      (e) => e.type === 'agent-progress' && e.reel === slug && e.job.state === 'validating',
    );
    expect(validatingProgress).toBeDefined();

    const succeededProgress = events.find(
      (e) => e.type === 'agent-progress' && e.reel === slug && e.job.state === 'succeeded' && e.job.version === 2,
    );
    expect(succeededProgress).toBeDefined();

    const versionAdded = events.find(
      (e) => e.type === 'version-added' && e.reel === slug && e.version === 2,
    );
    expect(versionAdded).toBeDefined();

    stop();
  }, TIMEOUT);

  it('2. DONE before all files settle still publishes the final files: resets timer and publishes final modified content', async () => {
    // Use settleMs: 200 so we can safely write a file before it settles
    const { dir, project, slug } = await setupCopyJob({ settleMs: 200 });
    const initialJob = (await project.agentJob(slug))!;
    const outputDir = join(dir, 'reels', slug, '.agent/jobs', initialJob.id, 'output');

    writeValidOutput(outputDir);
    writeFileSync(join(outputDir, DONE_MARKER), '');

    // Before settleMs expires, modify shots.json with a custom marker
    await delay(50);
    const updatedShots = {
      ...JSON.parse(cachedShots!),
      customMarker: 'settled-after-done',
    };
    writeFileSync(join(outputDir, 'shots.json'), JSON.stringify(updatedShots));

    // Wait until publication completes
    await until(async () => (await project.agentJob(slug))?.state === 'succeeded');
    const finalJob = (await project.agentJob(slug))!;
    expect(finalJob.state).toBe('succeeded');
    expect(finalJob.version).toBe(2);

    // Assert that the final modified file was published into v2
    const v2Shots = JSON.parse(readFileSync(join(dir, 'reels', slug, 'v2', 'shots.json'), 'utf8'));
    expect(v2Shots.customMarker).toBe('settled-after-done');
  }, TIMEOUT);

  it('3. Invalid output leaves failed with the reason and canRetry: true', async () => {
    const { dir, project, slug } = await setupCopyJob({ settleMs: 50 });
    const initialJob = (await project.agentJob(slug))!;
    const outputDir = join(dir, 'reels', slug, '.agent/jobs', initialJob.id, 'output');

    writeValidOutput(outputDir);
    // Corrupt shots.json with broken contents
    writeFileSync(join(outputDir, 'shots.json'), '{ "duration": 0, "shots": [] }');
    writeFileSync(join(outputDir, DONE_MARKER), '');

    await until(async () => (await project.agentJob(slug))?.state === 'failed');
    const failedJob = (await project.agentJob(slug))!;

    expect(failedJob).toMatchObject({
      state: 'failed',
      canRetry: true,
      error: expect.stringContaining('Agent output changed the reel timeline duration'),
    });
    expect(existsSync(join(dir, 'reels', slug, 'v2'))).toBe(false);
  }, TIMEOUT);

  it('4. A job finished while the server was stopped settles on open before publishing', async () => {
    const { dir, project, slug } = await setupCopyJob({ settleMs: 200 });
    const initialJob = (await project.agentJob(slug))!;
    const outputDir = join(dir, 'reels', slug, '.agent/jobs', initialJob.id, 'output');

    // Close project while still copy-ready (simulating server stopping)
    await project.close();

    // While server is stopped, write valid files and DONE marker
    writeValidOutput(outputDir);
    writeFileSync(join(outputDir, DONE_MARKER), '');

    // Reopen project
    const reopened = openProject(dir, {
      transcriber: async () => [{ text: 'hello', start: 0.5, end: 1.0 }],
      agent: { settleMs: 50 },
    });
    projects.push(reopened);

    // Reading the job or awaiting ready should have processed the completed job
    const job = await reopened.agentJob(slug);
    expect(job).toMatchObject({
      state: 'copy-ready',
      canRetry: true,
    });
    await delay(50);
    const updatedShots = {
      ...JSON.parse(cachedShots!),
      customMarker: 'settled-after-reopen',
    };
    writeFileSync(join(outputDir, 'shots.json'), JSON.stringify(updatedShots));

    await until(async () => (await reopened.agentJob(slug))?.state === 'succeeded');
    expect(await reopened.agentJob(slug)).toMatchObject({
      state: 'succeeded',
      version: 2,
      canRetry: false,
    });
    expect(existsSync(join(dir, 'reels', slug, 'v2'))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'reels', slug, 'v2', 'shots.json'), 'utf8')).customMarker).toBe('settled-after-reopen');
    expect(existsSync(join(dir, 'reels', slug, 'v2', DONE_MARKER))).toBe(false);
  }, TIMEOUT);

  it('fails marker removal errors with a reason and retry instead of stopping silently', async () => {
    const { dir, project, slug, outputDir } = await setupCopyJob({ settleMs: 50 });
    writeValidOutput(outputDir);
    mkdirSync(join(outputDir, DONE_MARKER));

    await until(async () => (await project.agentJob(slug))?.state === 'failed');
    expect(await project.agentJob(slug)).toMatchObject({
      state: 'failed',
      canRetry: true,
      error: expect.stringContaining('regular file'),
    });
    expect(existsSync(join(dir, 'reels', slug, 'v2'))).toBe(false);
  }, TIMEOUT);

  it('refuses a symlinked output directory without deleting outside DONE', async () => {
    const { dir, project, slug, jobDir, outputDir } = await setupCopyJob({ settleMs: 50 });
    await project.close();
    const outside = join(dir, 'external-output');
    mkdirSync(outside);
    writeFileSync(join(outside, DONE_MARKER), 'keep');
    renameSync(outputDir, join(jobDir, 'original-output'));
    symlinkSync(outside, outputDir, process.platform === 'win32' ? 'junction' : 'dir');

    const reopened = openProject(dir, { agent: { settleMs: 50 } });
    projects.push(reopened);
    expect(await reopened.agentJob(slug)).toMatchObject({
      state: 'failed',
      canRetry: true,
      error: expect.stringContaining('real private directory'),
    });
    expect(readFileSync(join(outside, DONE_MARKER), 'utf8')).toBe('keep');
  }, TIMEOUT);

  it('5. A job without DONE stays copy-ready: both while server is running and on startup', async () => {
    const { dir, project, slug } = await setupCopyJob({ settleMs: 50 });
    const initialJob = (await project.agentJob(slug))!;
    const outputDir = join(dir, 'reels', slug, '.agent/jobs', initialJob.id, 'output');

    // Put valid files in output, but NO DONE marker
    writeValidOutput(outputDir);

    // Wait longer than settleMs
    await delay(150);

    // While running, remains copy-ready
    const runningJob = await project.agentJob(slug);
    expect(runningJob?.state).toBe('copy-ready');
    expect(existsSync(join(dir, 'reels', slug, 'v2'))).toBe(false);

    // Stop server and reopen
    await project.close();
    const reopened = openProject(dir, {
      transcriber: async () => [{ text: 'hello', start: 0.5, end: 1.0 }],
      agent: { settleMs: 50 },
    });
    projects.push(reopened);

    // On startup, still remains copy-ready
    const restartedJob = await reopened.agentJob(slug);
    expect(restartedJob?.state).toBe('copy-ready');
    expect(existsSync(join(dir, 'reels', slug, 'v2'))).toBe(false);
  }, TIMEOUT);

  it('6. The marker never reaches the published version: cleaned up from output and absent from v2', async () => {
    const { dir, project, slug } = await setupCopyJob({ settleMs: 50 });
    const initialJob = (await project.agentJob(slug))!;
    const jobDir = join(dir, 'reels', slug, '.agent/jobs', initialJob.id);
    const outputDir = join(jobDir, 'output');

    writeValidOutput(outputDir);
    writeFileSync(join(outputDir, DONE_MARKER), 'marker-content');

    await until(async () => (await project.agentJob(slug))?.state === 'succeeded');

    // Assert DONE is NOT in v2
    const v2Dir = join(dir, 'reels', slug, 'v2');
    expect(existsSync(join(v2Dir, DONE_MARKER))).toBe(false);
    expect(readdirSync(v2Dir)).not.toContain(DONE_MARKER);

    // Assert DONE does not remain in output
    expect(existsSync(join(outputDir, DONE_MARKER))).toBe(false);
  }, TIMEOUT);
});
