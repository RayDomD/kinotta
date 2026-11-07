import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, rmdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openProject, type Project } from '../../server/core/index.ts';
import { launchAgent, agentArguments, agentCommand } from '../../server/core/_internal/runner.ts';
import { brollJobPrompt, makeBrollJobRequest } from '../../server/core/_internal/requests.ts';
import { brollTargets } from '../../server/core/model.ts';
import { copyFixture } from '../helpers/project.ts';
import { tempDir } from '../helpers/temp.ts';

const projects: Project[] = [];
afterEach(async () => { for (const project of projects.splice(0)) await project.close(); });
const readJson = (file: string): any => JSON.parse(readFileSync(file, 'utf8'));
const delay = () => new Promise((done) => setTimeout(done, 25));
async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const end = Date.now() + 15_000;
  while (!(await check())) { if (Date.now() > end) throw new Error('Condition did not arrive'); await delay(); }
}
async function setup(mode = 'success', ceilingMs = 60_000, confirmed = true, afterLaunch?: (cwd: string) => void) {
  const dir = tempDir('Kinotta space \u65e5\u672c\u8a9e ');
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
      await launchAgent({ ...input, executable: { command: process.execPath, prefix: [fake, nextMode] } });
      afterLaunch?.(input.cwd);
    } },
  });
  projects.push(project);
  await project.saveAgentSettings({ provider: 'claude', ...(confirmed ? { confirmed: true } : {}) });
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
      for (const copy of [false, true]) {
        expect(brollJobPrompt(request, copy)).toContain('skill/SKILL.md for hard rules');
        expect(brollJobPrompt(request, copy)).toContain('skill/stages/02-first-build.md for the first-build procedure');
        expect(brollJobPrompt(request, copy)).toContain('You may correct misheard words in output/transcript.json by changing word text only (including punctuation and case). Keep every word, its order, its start/end timings and all other fields; every word text must remain non-empty.');
      }
    }
  });
});

describe('managed b-roll jobs with a real fake process', { timeout: 90_000 }, () => {
  it('removes a stray DONE from managed output before validation and publication', async () => {
    const test = await setup('done');
    const slug = await make(test.project);
    await test.project.whenAgentDone(slug);
    const job = (await test.project.agentJob(slug))!;
    const jobDir = join(test.dir, 'reels', slug, '.agent/jobs', job.id);
    expect(job).toMatchObject({ state: 'succeeded', version: 2 });
    expect(existsSync(join(jobDir, 'output/DONE'))).toBe(false);
    expect(existsSync(join(test.dir, 'reels', slug, 'v2/DONE'))).toBe(false);
    expect(readFileSync(join(jobDir, 'received-prompt.txt'), 'utf8')).not.toContain('output/DONE');
    expect(readFileSync(join(jobDir, 'prompt.txt'), 'utf8')).toContain('output/DONE');
  });

  it('publishes corrected transcript words in v2 and displays them in v2 captions', async () => {
    const test = await setup('success', 60_000, true, (cwd) => {
      const file = join(cwd, 'output/transcript.json');
      const transcript = readJson(file);
      transcript.words[0].text = 'Claude,';
      writeFileSync(file, JSON.stringify(transcript));
      const build = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['skill/engine/build.py', '--plan', 'output/plan.json', 'output/index.html'], { cwd, encoding: 'utf8', windowsHide: true });
      expect(build.status, build.stderr).toBe(0);
    });
    const slug = await make(test.project);
    await test.project.whenAgentDone(slug);
    expect(await test.project.agentJob(slug)).toMatchObject({ state: 'succeeded', version: 2 });
    const reel = join(test.dir, 'reels', slug);
    expect(readJson(join(reel, 'v1/transcript.json')).words[0].text).toBe('hello');
    expect(readJson(join(reel, 'v2/transcript.json')).words[0].text).toBe('Claude,');
    expect((await test.project.readVersion(slug, 2)).transcript?.[0].text).toBe('Claude,');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(join(reel, 'v2/index.html')).href);
      await page.evaluate(async () => { await (window as unknown as { seek: (time: number) => unknown }).seek(0.75); });
      expect(await page.locator('body').innerText()).toContain('Claude,');
    } finally { await browser.close(); }
  });

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
      expect(readFileSync(join(jobDir, 'received-prompt.txt'), 'utf8')).toContain('This is a managed run.');
      expect(readFileSync(join(jobDir, 'received-prompt.txt'), 'utf8')).not.toContain('output/DONE');
      expect(readFileSync(join(jobDir, 'prompt.txt'), 'utf8')).toContain('output/DONE');
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
  it.each(['before append', 'after append', 'after owner restore'] as const)('recovers published cuts idempotently after a stop %s', async (crashPoint) => {
    const test = await setup('cuts');
    const slug = await make(test.project); await test.project.whenAgentDone(slug);
    const job = (await test.project.agentJob(slug))!;
    expect(job.state).toBe('succeeded');
    const reelDir = join(test.dir, 'reels', slug);
    const original = (await test.project.readEditList(slug)).operations[0]!;
    await test.project.close();
    // Reconstruct the durable disk state at the stop: published v2, pending batch, unfinished status.
    writeFileSync(join(reelDir, 'v2/cuts.json'), JSON.stringify({ cuts: [{ from: 1.5, to: 2.5, reason: 'Long pause before the answer' }] }));
    if (crashPoint === 'before append') rmSync(join(reelDir, 'edit-list.json'));
    if (crashPoint === 'after owner restore') {
      const stored = readJson(join(reelDir, 'edit-list.json'));
      writeFileSync(join(reelDir, 'edit-list.json'), JSON.stringify({ ...stored, operations: [], undo: [...stored.undo, stored.operations] }));
    }
    writeFileSync(join(reelDir, '.agent/jobs', job.id, 'state.json'), JSON.stringify({ ...job, state: 'validating' }));
    const reopened = openProject(test.dir); projects.push(reopened);
    expect(await reopened.agentJob(slug)).toMatchObject({ state: 'succeeded', version: 2 });
    const operations = (await reopened.readEditList(slug)).operations;
    if (crashPoint === 'after owner restore') expect(operations).toEqual([]);
    else expect(operations).toEqual([original]);
    expect(existsSync(join(reelDir, 'v2/cuts.json'))).toBe(false);
    expect(existsSync(join(reelDir, 'v3'))).toBe(false);
  });
  it.each([
    ['whole reel', [{ from: 0, to: 12, reason: 'Everything' }], 'whole reel'],
    ['whole reel batch', [{ from: 0, to: 6, reason: 'First' }, { from: 6, to: 12, reason: 'Second' }], 'whole reel'],
    ['blank reason', [{ from: 1.5, to: 2.5, reason: '   ' }], 'non-empty'],
    ['tiny cut', [{ from: 1.5, to: 1.501, reason: 'Too short' }], 'stretch of footage'],
  ])('fails a %s batch before publication with its refusal', async (_, cuts, reason) => {
    const test = await setup('cuts', 60_000, true, (cwd) => writeFileSync(join(cwd, 'output/cuts.json'), JSON.stringify({ cuts })));
    const slug = await make(test.project); await test.project.whenAgentDone(slug);
    expect(await test.project.agentJob(slug)).toMatchObject({ state: 'failed', error: expect.stringContaining(reason as string) });
    expect(existsSync(join(test.dir, 'reels', slug, 'v2'))).toBe(false);
  });
  it('fails visibly on append storage failure and retains pending cuts', async () => {
    const test = await setup('cuts', 60_000, true, (cwd) => {
      // An occupied target permits validation/publication but makes the journal rename fail.
      mkdirSync(resolve(cwd, '../../..', 'edit-list.json'));
    });
    const slug = await make(test.project); await test.project.whenAgentDone(slug);
    expect(await test.project.agentJob(slug)).toMatchObject({ state: 'failed', canRetry: true, error: expect.any(String) });
    const reelDir = join(test.dir, 'reels', slug);
    expect(existsSync(join(reelDir, 'v2/cuts.json'))).toBe(true);
    await test.project.close();
    // Recovery also surfaces a repeated storage failure instead of declaring success.
    const reopened = openProject(test.dir); projects.push(reopened);
    expect(await reopened.agentJob(slug)).toMatchObject({ state: 'failed', error: expect.any(String) });
    expect(existsSync(join(reelDir, 'v2/cuts.json'))).toBe(true);
    await reopened.close();
    rmdirSync(join(reelDir, 'edit-list.json'));
    const recovered = openProject(test.dir); projects.push(recovered);
    expect(await recovered.agentJob(slug)).toMatchObject({ state: 'succeeded', version: 2 });
    expect((await recovered.readEditList(slug)).operations).toHaveLength(1);
    expect(existsSync(join(reelDir, 'v2/cuts.json'))).toBe(false);
  });
  it('skips only cuts superseded by an owner edit and appends the rest', async () => {
    const test = await setup('cuts', 60_000, true, (cwd) => writeFileSync(join(cwd, 'output/cuts.json'), JSON.stringify({ cuts: [
      { from: 1.5, to: 2.5, reason: 'Owner already cut this' },
      { from: 3, to: 4, reason: 'Another pause' },
    ] })));
    test.hold();
    const slug = await make(test.project);
    try {
      await test.project.addOperation(slug, { kind: 'snip', from: 1.4, to: 2.6, by: 'you' });
      test.release(); await test.project.whenAgentDone(slug);
      expect(await test.project.agentJob(slug)).toMatchObject({ state: 'succeeded' });
      expect((await test.project.readEditList(slug)).operations).toMatchObject([
        { kind: 'snip', from: 1.4, to: 2.6, by: 'you' },
        { kind: 'snip', from: 3, to: 4, reason: 'Another pause' },
      ]);
    } finally { test.release(); }
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
  it('honors an explicit Copy request without launching an installed CLI', async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir, { transcriber: async () => [], agent: { launch: async () => { throw new Error('must not launch'); } } });
    projects.push(project);
    await project.saveAgentSettings({ provider: 'copy' });
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


describe('new reel agent confirmation', { timeout: 90_000 }, () => {
  it.each([
    ['claude', false, false, false], ['codex', false, false, false],
    ['claude', true, false, true], ['codex', true, false, true],
    ['claude', false, true, true], ['codex', false, true, true],
    ['copy', false, false, true],
  ] as const)('%s with project yes %s and build yes %s starts job %s', async (provider, confirmed, agentConfirmed, starts) => {
    const fixture = await setup(provider === 'codex' ? 'codex-success' : 'success', 60_000, confirmed);
    await fixture.project.saveAgentSettings({ provider });
    const { slug } = await fixture.project.startReel({ video: 'media/talk.mp4', agentConfirmed });
    await fixture.project.whenTranscribed(slug);
    expect(fixture.project.transcriptionProgress(slug)?.state).toBe('done');
    expect((await fixture.project.readVersion(slug, 1)).issues).toEqual([]);
    if (starts) {
      await fixture.project.whenAgentDone(slug);
      expect(await fixture.project.agentJob(slug)).toMatchObject({ provider, state: provider === 'copy' ? 'copy-ready' : 'succeeded' });
    } else {
      expect(await fixture.project.agentJob(slug)).toBeNull();
      // Add b-roll is an explicit request and does not require the automatic-build confirmation.
      await fixture.project.startAgentJob(slug);
      await fixture.project.whenAgentDone(slug);
      expect(await fixture.project.agentJob(slug)).toMatchObject({ provider, state: 'succeeded' });
    }
    expect((await fixture.project.agentSettings()).confirmed).toBe(confirmed ? true : undefined);
  });
});


describe('Simple Regenerate', { timeout: 90_000 }, () => {
  it('sends only new or changed pins after reload and preserves Working during publication', async () => {
    const test = await setup();
    const slug = await make(test.project);
    await test.project.whenAgentDone(slug);
    const first = (await test.project.addComment(slug, 2, { text: 'Make this warmer', pin: { kind: 'frame', shot: '', time: 0.5, x: 0.5, y: 0.5, element: null } })).comment;
    const unchanged = (await test.project.addComment(slug, 2, { text: 'Keep this blue', pin: { kind: 'frame', shot: '', time: 1, x: 0.5, y: 0.5, element: null } })).comment;
    const job = await test.project.startAgentJob(slug, false, 'regenerate');
    await test.project.whenAgentDone(slug);
    const request = readJson(join(test.dir, 'reels', slug, '.agent/jobs', job.id, 'request.json'));
    expect(request.kind).toBe('regenerate');
    expect(request.pins.map((pin: any) => pin.id)).toEqual([first.id, unchanged.id]);
    await test.project.close();
    const reopened = openProject(test.dir, { agent: { launch: async (input) => {
      await new Promise<void>((done, reject) => { release = done; input.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }); });
      await launchAgent({ ...input, executable: { command: process.execPath, prefix: [join(test.dir, 'fake agent.mjs'), 'success'] } });
    } } });
    projects.push(reopened);
    let release: (() => void) | undefined;
    const carried = (await reopened.listComments(slug, 3)).find((pin) => pin.text === 'Make this warmer')!;
    await reopened.editComment(slug, 3, carried.id, 'Make this much warmer');
    const fresh = (await reopened.addComment(slug, 3, { text: 'Add a title', pin: { kind: 'frame', shot: '', time: 2, x: 0.5, y: 0.5, element: null } })).comment;
    const next = await reopened.startAgentJob(slug, false, 'regenerate');
    try {
      await until(() => !!release);
      const changed = readJson(join(test.dir, 'reels', slug, '.agent/jobs', next.id, 'request.json'));
      expect(changed.pins.map((pin: any) => ({ id: pin.id, text: pin.text }))).toEqual([{ id: carried.id, text: 'Make this much warmer' }, { id: fresh.id, text: 'Add a title' }]);
      expect(JSON.stringify(changed)).not.toContain('Keep this blue');
      await expect(reopened.startAgentJob(slug, false, 'regenerate')).rejects.toMatchObject({ code: 'frozen' });
      const edits = await reopened.addOperation(slug, { kind: 'word-text', at: 0.5, text: 'owner correction', was: 'hello' });
      expect((await reopened.readWorkingVersion(slug)).number).toBe(3);
      release!(); await reopened.whenAgentDone(slug);
      expect(await reopened.agentJob(slug)).toMatchObject({ kind: 'regenerate', state: 'succeeded', version: 4, pins: [{ text: 'Make this much warmer', state: 'done' }, { text: 'Add a title', state: 'done' }] });
      expect((await reopened.readEditList(slug)).operations).toMatchObject(edits.operations);
      expect((await reopened.readEditList(slug)).flagged ?? {}).toEqual({});
      await expect(reopened.startAgentJob(slug, false, 'regenerate')).rejects.toThrow('No new or changed pins');
    } finally { release?.(); }
  });
});


describe('Regenerate failure and Retry', { timeout: 90_000 }, () => {
  it.each(['exit1', 'bad', 'timeout'])('keeps the cut on %s and retries the submitted pins', async (mode) => {
    const test = await setup(mode === 'timeout' ? 'hang' : mode, mode === 'timeout' ? 4000 : 60_000, true, mode === 'bad' ? (cwd) => writeFileSync(join(cwd, 'output/shots.json'), '{}') : undefined);
    await test.project.saveAgentSettings({ provider: 'copy' });
    const slug = await make(test.project); await test.project.whenAgentDone(slug);
    await test.project.saveAgentSettings({ provider: 'claude' });
    const pin = (await test.project.addComment(slug, 1, { text: 'Add a title', pin: { kind: 'frame', shot: '', time: 0.5, x: 0.5, y: 0.5, element: null } })).comment;
    const events: any[] = [];
    test.project.subscribe((event) => { if (event.type === 'agent-progress') events.push(event.job); });
    await test.project.startAgentJob(slug, false, 'regenerate');
    await test.project.whenAgentDone(slug);
    expect(await test.project.agentJob(slug)).toMatchObject({ kind: 'regenerate', state: 'failed', canRetry: true, canCopy: true, pins: [{ id: pin.id, state: 'failed' }] });
    expect((await test.project.readWorkingVersion(slug)).number).toBe(1);
    expect((await test.project.listVersions(slug)).map((version) => version.number)).toEqual([1]);
    expect((await test.project.copyAgentRequest(slug)).request).toContain('Add a title');
    expect(events.some((job) => job.pins?.[0]?.state === 'waiting')).toBe(true);
    expect(events.some((job) => job.pins?.[0]?.state === 'running')).toBe(true);
    if (mode === 'exit1') {
      await test.project.editComment(slug, 1, pin.id, 'Change after failure');
      test.setMode('success');
      const retry = await test.project.startAgentJob(slug, true);
      const request = readJson(join(test.dir, 'reels', slug, '.agent/jobs', retry.id, 'request.json'));
      expect(request).toMatchObject({ kind: 'regenerate', pins: [{ text: 'Add a title' }] });
      await test.project.whenAgentDone(slug);
      expect(await test.project.agentJob(slug)).toMatchObject({ state: 'succeeded', version: 2 });
    }
  });
});


describe('Regenerate success markers', { timeout: 90_000 }, () => {
  it.each(['invalid JSON', 'read error'])('lists and adds comments without regenerated flags when the marker has %s', async (failure) => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir); projects.push(project);
    const slug = 'product-showreel';
    const pin = { shot: '03', x: 0.5, y: 0.5, element: null };
    const existing = (await project.addComment(slug, 2, { text: 'Keep the title', pin })).comment;
    const agentDir = join(dir, 'reels', slug, '.agent');
    mkdirSync(agentDir, { recursive: true });
    const marker = join(agentDir, 'regenerate-pins.json');
    if (failure === 'invalid JSON') writeFileSync(marker, '{not json');
    else mkdirSync(marker);

    expect(await project.listComments(slug, 2)).toEqual([existing]);
    const added = await project.addComment(slug, 2, { text: 'Warm up the background', pin });
    expect(added.comments).toHaveLength(2);
    expect(added.comments.map((comment) => comment.text)).toEqual(['Keep the title', 'Warm up the background']);
    expect(added.comments.every((comment) => !Object.hasOwn(comment, 'regenerated'))).toBe(true);
    expect(await project.listComments(slug, 2)).toEqual(added.comments);
  });

  it.each(['failed', 'cancelled'])('accepts fresh Regenerate after a %s run and marks pins only on success', async (state) => {
    const test = await setup(state === 'failed' ? 'exit1' : 'hang');
    await test.project.saveAgentSettings({ provider: 'copy' });
    const slug = await make(test.project); await test.project.whenAgentDone(slug);
    await test.project.saveAgentSettings({ provider: 'claude' });
    const pin = (await test.project.addComment(slug, 1, { text: 'Add a warm title', pin: { kind: 'frame', shot: '', time: 0.5, x: 0.5, y: 0.5, element: null } })).comment;
    const first = await test.project.startAgentJob(slug, false, 'regenerate');
    const agentDir = join(test.dir, 'reels', slug, '.agent');
    if (state === 'cancelled') {
      await until(() => existsSync(join(agentDir, 'jobs', first.id, 'descendant.pid')));
      await test.project.cancelAgentJob(slug);
    }
    await test.project.whenAgentDone(slug);
    expect(await test.project.agentJob(slug)).toMatchObject({ state, canRetry: true });
    test.setMode('success');
    const fresh = await test.project.startAgentJob(slug, false, 'regenerate');
    expect(fresh.id).not.toBe(first.id);
    expect(readJson(join(agentDir, 'jobs', fresh.id, 'request.json'))).toMatchObject({ kind: 'regenerate', pins: [{ id: pin.id, text: 'Add a warm title' }] });
    await test.project.whenAgentDone(slug);
    expect(await test.project.agentJob(slug)).toMatchObject({ state: 'succeeded', version: 2 });
    const carried = (await test.project.listComments(slug, 2)).find((comment) => comment.text === 'Add a warm title')!;
    expect(readJson(join(agentDir, 'regenerate-pins.json'))).toEqual({ [carried.id]: 'Add a warm title' });
    await expect(test.project.startAgentJob(slug, false, 'regenerate')).rejects.toThrow('No new or changed pins');
  });

  it('reports which pins were already regenerated, through a carry-forward hop, until the note changes', async () => {
    const test = await setup();
    await test.project.saveAgentSettings({ provider: 'copy' });
    const slug = await make(test.project); await test.project.whenAgentDone(slug);
    await test.project.saveAgentSettings({ provider: 'claude' });
    const sent = (await test.project.addComment(slug, 1, { text: 'Add a warm title', pin: { kind: 'frame', shot: '', time: 0.5, x: 0.5, y: 0.5, element: null } })).comment;
    expect(sent.regenerated).toBeUndefined();
    await test.project.startAgentJob(slug, false, 'regenerate');
    await test.project.whenAgentDone(slug);
    expect(await test.project.agentJob(slug)).toMatchObject({ state: 'succeeded', version: 2 });
    const afterRun = (await test.project.listComments(slug, 2)).find((comment) => comment.text === 'Add a warm title')!;
    expect(afterRun.regenerated).toBe(true);
    const fresh = (await test.project.addComment(slug, 2, { text: 'Brighten it', pin: { kind: 'frame', shot: '', time: 1, x: 0.5, y: 0.5, element: null } })).comment;
    expect(fresh.regenerated).toBeUndefined();
    const edited = await test.project.editComment(slug, 2, afterRun.id, 'Add a cool title');
    expect(edited.comments.find((comment) => comment.id === afterRun.id)!.regenerated).toBeUndefined();
    expect((await test.project.listComments(slug, 2)).find((comment) => comment.id === afterRun.id)!.regenerated).toBeUndefined();
    // A second run carries the unsent pins to v3; the note that was not edited again stays regenerated across the hop.
    await test.project.startAgentJob(slug, false, 'regenerate');
    await test.project.whenAgentDone(slug);
    expect(await test.project.agentJob(slug)).toMatchObject({ state: 'succeeded', version: 3 });
    expect((await test.project.listComments(slug, 3)).filter((comment) => comment.regenerated).map((comment) => comment.text).sort()).toEqual(['Add a cool title', 'Brighten it']);
  });
});
