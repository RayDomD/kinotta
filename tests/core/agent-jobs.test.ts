import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openProject, type Project } from '../../server/core/index.ts';
import { launchAgent, agentArguments, agentCommand } from '../../server/core/_internal/runner.ts';
import { brollJobPrompt, makeBrollJobRequest } from '../../server/core/_internal/requests.ts';
import { brollTargets } from '../../server/core/model.ts';
import { copyFixture } from '../helpers/project.ts';

const projects: Project[] = [];
afterEach(async () => { for (const project of projects.splice(0)) await project.close(); });
const readJson = (file: string): any => JSON.parse(readFileSync(file, 'utf8'));
const delay = () => new Promise((done) => setTimeout(done, 25));
async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const end = Date.now() + 15_000;
  while (!(await check())) { if (Date.now() > end) throw new Error('Condition did not arrive'); await delay(); }
}
async function setup(mode = 'success', ceilingMs = 60_000) {
  const dir = mkdtempSync(join(tmpdir(), 'Kinotta space \u65e5\u672c\u8a9e '));
  cpSync(copyFixture('footage-project'), dir, { recursive: true });
  const fake = join(dir, 'fake agent.mjs');
  cpSync(resolve('tests/core/fake-broll-agent.mjs'), fake);
  let nextMode = mode;
  let release: (() => void) | undefined;
  let gate = Promise.resolve();
  const project = openProject(dir, {
    transcriber: async () => [{ text: 'hello', start: 0.5, end: 1 }],
    agent: { ceilingMs, quietMs: 100, launch: async (input) => {
      await gate;
      return launchAgent({ ...input, executable: { command: process.execPath, prefix: [fake, nextMode] } });
    } },
  });
  projects.push(project);
  await project.saveAgentSettings({ provider: 'claude' });
  return { dir, project, setMode: (value: string) => { nextMode = value; }, hold: () => { gate = new Promise<void>((done) => { release = done; }); }, release: () => release?.() };
}
const make = async (project: Project) => {
  const { slug } = await project.startReel({ video: 'media/talk.mp4', broll: 'heavy', pace: 'fast', videoType: 'demo', captions: 'phrases', notes: 'Show the product' });
  await project.whenTranscribed(slug);
  expect(project.transcriptionProgress(slug)?.error).toBeUndefined();
  expect(project.transcriptionProgress(slug)?.state).toBe('done');
  return slug;
};

describe('background b-roll request', () => {
  it.each(['explainer', 'interview', 'tutorial', 'demo', 'short', 'lecture', 'vlog', undefined] as const)('includes %s and the same targets as the preview', (videoType) => {
    for (const captions of ['off', 'phrases', 'word-by-word'] as const) {
      const request = makeBrollJobRequest('id', 'talk', 1, { videoType, captions, broll: 'heavy', pace: 'fast', notes: '  quoted "$HOME"  ' }, 60);
      expect(request.targets).toEqual(brollTargets('heavy', 'fast', 60));
      expect(request.options).toMatchObject({ captions, notes: 'quoted "$HOME"' });
      expect(brollJobPrompt(request)).toContain(JSON.stringify({ notes: 'quoted "$HOME"' }));
      expect(brollJobPrompt(request)).toContain(videoType ?? 'decide from the content without asking');
    }
  });
});

describe('managed b-roll jobs with a real fake process', { timeout: 90_000 }, () => {
  it('keeps v1 playable until validated output publishes v2, with durable events and exact Copy prompt', async () => {
    const test = await setup();
    test.hold();
    const events: any[] = [];
    const stop = test.project.subscribe((event) => events.push(event));
    try {
      const slug = await make(test.project);
      expect((await test.project.readVersion(slug, 1)).issues).toEqual([]);
      expect(existsSync(join(test.dir, 'reels', slug, 'v2'))).toBe(false);
      await expect(test.project.startAgentJob(slug)).rejects.toMatchObject({ code: 'frozen' });
      await until(async () => (await test.project.agentJob(slug))?.state === 'running');
      const job = (await test.project.agentJob(slug))!;
      const jobDir = join(test.dir, 'reels', slug, '.agent/jobs', job.id);
      expect((await test.project.copyAgentRequest(slug)).request).toBe(readFileSync(join(jobDir, 'prompt.txt'), 'utf8'));
      test.release();
      await test.project.whenAgentDone(slug);
      expect(await test.project.agentJob(slug), JSON.stringify(await test.project.agentJob(slug))).toMatchObject({ state: 'succeeded', version: 2, canRetry: false });
      expect((await test.project.readWorkingVersion(slug)).number).toBe(2);
      expect((await test.project.readVersion(slug, 2)).issues).toEqual([]);
      expect(readFileSync(join(jobDir, 'received-prompt.txt'), 'utf8')).toBe(readFileSync(join(jobDir, 'prompt.txt'), 'utf8'));
      expect(readJson(join(jobDir, 'node-inspection.json')).duration).toBeGreaterThan(0);
      expect(events.some((event) => event.type === 'agent-progress' && event.job.state === 'validating')).toBe(true);
      expect(events.some((event) => event.type === 'version-added' && event.version === 2)).toBe(true);
    } finally { test.release(); stop(); }
  });
  it.each(['exit1', 'provider-error', 'bad', 'escape', 'noseek', 'change-captions', 'symlink', 'codex-error'])('keeps v1 on %s and permits explicit Retry and Copy', async (mode) => {
    const test = await setup(mode);
    const slug = await make(test.project);
    await test.project.whenAgentDone(slug);
    expect(await test.project.agentJob(slug)).toMatchObject({ state: 'failed', canRetry: true, canCopy: true, error: expect.any(String) });
    expect(existsSync(join(test.dir, 'reels', slug, 'v2'))).toBe(false);
    expect((await test.project.readVersion(slug, 1)).issues).toEqual([]);
    expect((await test.project.copyAgentRequest(slug)).request).toContain('Show the product');
    if (mode === 'exit1') {
      const old = (await test.project.agentJob(slug))!.id;
      test.setMode('success');
      expect((await test.project.startAgentJob(slug, true)).id).not.toBe(old);
      await test.project.whenAgentDone(slug);
      expect(await test.project.agentJob(slug), JSON.stringify(await test.project.agentJob(slug))).toMatchObject({ state: 'succeeded' });
    }
  });
  it('replays Working edits made while the agent runs', async () => {
    const test = await setup(); test.hold();
    const slug = await make(test.project);
    try {
      const list = await test.project.addOperation(slug, { kind: 'word-text', at: 0.5, text: 'corrected', was: 'hello' });
      test.release(); await test.project.whenAgentDone(slug);
      expect(await test.project.agentJob(slug), JSON.stringify(await test.project.agentJob(slug))).toMatchObject({ state: 'succeeded' });
      const after = await test.project.readEditList(slug);
      expect(after.base).toBe(2);
      expect(after.operations).toMatchObject(list.operations);
      expect(after.flagged ?? {}).toEqual({});
    } finally { test.release(); }
  });
  it.each(['cancel', 'timeout', 'shutdown'])('%s stops a process tree before returning and never publishes', async (action) => {
    const test = await setup('hang', action === 'timeout' ? 4000 : 60_000);
    const slug = await make(test.project);
    const job = (await test.project.agentJob(slug))!;
    const pidFile = join(test.dir, 'reels', slug, '.agent/jobs', job.id, 'descendant.pid');
    await until(() => existsSync(pidFile));
    const pid = Number(readFileSync(pidFile, 'utf8'));
    if (action === 'cancel') await test.project.cancelAgentJob(slug);
    if (action === 'shutdown') await test.project.close();
    await test.project.whenAgentDone(slug);
    expect(() => process.kill(pid, 0)).toThrow();
    expect(await test.project.agentJob(slug)).toMatchObject({ state: action === 'timeout' ? 'failed' : 'cancelled', canRetry: true });
    expect(existsSync(join(test.dir, 'reels', slug, 'v2'))).toBe(false);
  });
  it('reports quiet elapsed status without inventing progress and remains cancellable', async () => {
    const test = await setup('hang');
    const slug = await make(test.project);
    await until(async () => (await test.project.agentJob(slug))?.quiet === true);
    expect(await test.project.agentJob(slug)).toMatchObject({ state: 'running', elapsedSeconds: expect.any(Number), quiet: true });
    await test.project.cancelAgentJob(slug);
  });
  it('marks an unfinished durable job interrupted on restart without using a PID', async () => {
    const test = await setup('bad');
    const slug = await make(test.project); await test.project.whenAgentDone(slug);
    const job = (await test.project.agentJob(slug))!;
    const stateFile = join(test.dir, 'reels', slug, '.agent/jobs', job.id, 'state.json');
    writeFileSync(stateFile, JSON.stringify({ ...job, state: 'running', pid: process.pid }));
    const reopened = openProject(test.dir); projects.push(reopened);
    expect(await reopened.agentJob(slug)).toMatchObject({ state: 'interrupted', canRetry: true });
    expect(() => process.kill(process.pid, 0)).not.toThrow();
  });
  it('accepts a Codex completed turn from a fresh fake process', async () => {
    const test = await setup('codex-success');
    await test.project.saveAgentSettings({ provider: 'codex' });
    const slug = await make(test.project); await test.project.whenAgentDone(slug);
    expect(await test.project.agentJob(slug)).toMatchObject({ provider: 'codex', state: 'succeeded', version: 2 });
  });
  it('recognizes an already published job after a crash before its final status write', async () => {
    const test = await setup();
    const slug = await make(test.project); await test.project.whenAgentDone(slug);
    const job = (await test.project.agentJob(slug))!;
    expect(job.state).toBe('succeeded');
    writeFileSync(join(test.dir, 'reels', slug, '.agent/jobs', job.id, 'state.json'), JSON.stringify({ ...job, state: 'validating' }));
    const reopened = openProject(test.dir); projects.push(reopened);
    expect(await reopened.agentJob(slug)).toMatchObject({ state: 'succeeded', version: 2, canRetry: false });
    expect(existsSync(join(test.dir, 'reels', slug, 'v3'))).toBe(false);
  });
  it('refuses stale output if an owner freeze publishes a new version mid-run', async () => {
    const test = await setup(); test.hold();
    const slug = await make(test.project);
    try {
      await test.project.addOperation(slug, { kind: 'word-text', at: 0.5, text: 'owner', was: 'hello' });
      await test.project.freezeEdits(slug);
      const before = readFileSync(join(test.dir, 'reels', slug, 'v2/index.html'), 'utf8');
      test.release(); await test.project.whenAgentDone(slug);
      expect(await test.project.agentJob(slug)).toMatchObject({ state: 'failed', error: expect.stringContaining('newer version') });
      expect(readFileSync(join(test.dir, 'reels', slug, 'v2/index.html'), 'utf8')).toBe(before);
      expect(existsSync(join(test.dir, 'reels', slug, 'v3'))).toBe(false);
    } finally { test.release(); }
  });
  it('fences publication when cancelled during validation', async () => {
    const test = await setup();
    let cancelled: Promise<unknown> | undefined;
    const stop = test.project.subscribe((event) => {
      if (event.type === 'agent-progress' && event.job.state === 'validating') cancelled = test.project.cancelAgentJob(event.reel);
    });
    try {
      const slug = await make(test.project); await test.project.whenAgentDone(slug); await cancelled;
      expect(await test.project.agentJob(slug)).toMatchObject({ state: 'cancelled' });
      expect(existsSync(join(test.dir, 'reels', slug, 'v2'))).toBe(false);
    } finally { stop(); }
  });
  it('defaults to Copy request without selecting or launching a detected CLI', async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir, { transcriber: async () => [], agent: { launch: async () => { throw new Error('must not launch'); } } });
    projects.push(project);
    expect(await project.agentSettings()).toEqual({ provider: 'copy' });
    const slug = await make(project); await project.whenAgentDone(slug);
    expect(await project.agentJob(slug)).toMatchObject({ state: 'copy-ready' });
  });
  it('uses provider flags and resolves the Windows npm Node entry without a shell', async () => {
    expect(agentArguments('claude')).toContain('Read,Write,Edit,Glob,Grep,Bash,PowerShell');
    expect(agentArguments('claude')).not.toContain('--dangerously-skip-permissions');
    // Only the skill's own commands run, and the copied skill cannot be rewritten first.
    expect(agentArguments('claude')).toEqual(expect.arrayContaining(['Bash(python skill/engine/build.py *)', 'PowerShell(python skill/scripts/shots.py *)', 'Edit(./skill/**)']));
    expect(agentArguments('claude').filter((arg) => /^(Bash|PowerShell)\((python3?|node) \*\)$/.test(arg))).toEqual([]);
    expect(agentArguments('codex')).toContain('workspace-write');
    if (process.platform === 'win32') {
      const command = await agentCommand('codex');
      expect(command.command).toBe(process.execPath);
      expect(command.prefix[0]).toMatch(/codex[\\/]bin[\\/]codex.js$/);
    }
  });
});
