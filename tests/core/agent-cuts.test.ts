import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openProject, type Project, AGENT_CUT_BY } from '../../server/core/index.ts';
import { validateAgentOutput } from '../../server/core/_internal/agent-output.ts';
import { launchAgent } from '../../server/core/_internal/runner.ts';
import { copyFixture } from '../helpers/project.ts';

const projects: Project[] = [];
afterEach(async () => {
  for (const project of projects.splice(0)) await project.close();
});

const delay = () => new Promise((done) => setTimeout(done, 25));
async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const end = Date.now() + 15_000;
  while (!(await check())) {
    if (Date.now() > end) throw new Error('Condition did not arrive');
    await delay();
  }
}

describe('cuts.json validation in validateAgentOutput', () => {
  function createOutputFixture(cutsContent?: string) {
    const dir = mkdtempSync(join(tmpdir(), 'kinotta-cuts-val-'));
    const plan = {
      duration: 10,
      clips: [{ id: '01', clip: '01.html', in: 0, out: 3 }],
      sections: [{ id: 's1', start: 0, end: 10 }],
    };
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
    writeFileSync(join(dir, '01.html'), '<div>clip</div>');
    writeFileSync(
      join(dir, 'transcript.json'),
      JSON.stringify({
        words: [
          { text: 'Hello', start: 1, end: 2 },
          { text: 'world', start: 4, end: 5 },
        ],
      })
    );
    writeFileSync(
      join(dir, 'shots.json'),
      JSON.stringify({
        duration: 10,
        shots: [{ number: '01', start: 0, duration: 10, title: 'Shot 01' }],
      })
    );
    // index.html with minimal page contract
    writeFileSync(
      join(dir, 'index.html'),
      `<!DOCTYPE html><html><head><script>window.DURATION=10;window.seek=()=>Promise.resolve();</script></head><body><section data-scene="01" data-start="0" data-duration="10"><div data-el="el">hello</div></section></body></html>`
    );
    if (cutsContent !== undefined) {
      writeFileSync(join(dir, 'cuts.json'), cutsContent);
    }
    return dir;
  }

  it('accepts missing cuts.json', async () => {
    const dir = createOutputFixture();
    const controller = new AbortController();
    await expect(validateAgentOutput(dir, controller.signal)).resolves.toBeUndefined();
  });

  it('accepts valid cuts.json with non-overlapping cuts outside word boundaries', async () => {
    const dir = createOutputFixture(
      JSON.stringify({
        cuts: [
          { from: 0, to: 0.8, reason: 'Leading silence' },
          { from: 2.2, to: 3.8, reason: 'Mid pause' },
          { from: 5.5, to: 9.9, reason: 'Ending silence' },
        ],
      })
    );
    const controller = new AbortController();
    await expect(validateAgentOutput(dir, controller.signal)).resolves.toBeUndefined();
  });

  it('accepts empty cuts array', async () => {
    const dir = createOutputFixture(JSON.stringify({ cuts: [] }));
    const controller = new AbortController();
    await expect(validateAgentOutput(dir, controller.signal)).resolves.toBeUndefined();
  });

  it('accepts cuts ending or starting exactly at word boundaries (not strictly between)', async () => {
    // word 1: [1, 2], word 2: [4, 5]
    // cut 1 ends at 1.0 (exact word start), cut 2 starts at 2.0 (exact word end) and ends at 4.0 (exact word start)
    const dir = createOutputFixture(
      JSON.stringify({
        cuts: [
          { from: 0.2, to: 1.0, reason: 'Up to first word' },
          { from: 2.0, to: 4.0, reason: 'Between words' },
        ],
      })
    );
    const controller = new AbortController();
    await expect(validateAgentOutput(dir, controller.signal)).resolves.toBeUndefined();
  });

  it('rejects invalid JSON in cuts.json', async () => {
    const dir = createOutputFixture('{ invalid json');
    const controller = new AbortController();
    await expect(validateAgentOutput(dir, controller.signal)).rejects.toThrow('Agent output cuts.json is not valid JSON.');
  });

  it.each([
    ['not an object', 'null'],
    ['cuts not array', '{"cuts": "invalid"}'],
    ['cuts as object', '{"cuts": {}}'],
  ])('rejects non-array cuts (%s)', async (_, content) => {
    const dir = createOutputFixture(content);
    const controller = new AbortController();
    await expect(validateAgentOutput(dir, controller.signal)).rejects.toThrow('Agent output cuts must be an array of at most 200 items.');
  });

  it('rejects more than 200 cuts', async () => {
    const cuts = Array.from({ length: 201 }, (_, i) => ({
      from: i * 0.04,
      to: (i + 1) * 0.04,
      reason: 'Cut ' + i,
    }));
    const dir = createOutputFixture(JSON.stringify({ cuts }));
    const controller = new AbortController();
    await expect(validateAgentOutput(dir, controller.signal)).rejects.toThrow('Agent output cuts must be an array of at most 200 items.');
  });

  it.each([
    ['negative from', [{ from: -0.5, to: 0.8, reason: 'Negative' }]],
    ['from >= to', [{ from: 3, to: 2, reason: 'Backwards' }]],
    ['from == to', [{ from: 2.5, to: 2.5, reason: 'Zero length' }]],
    ['to exceeds plan duration', [{ from: 8, to: 12, reason: 'Too long' }]],
    ['from not finite', [{ from: NaN, to: 2, reason: 'NaN' }]],
    ['to not finite', [{ from: 1, to: Infinity, reason: 'Infinity' }]],
    ['from as string', [{ from: '1', to: 2, reason: 'String' }]],
  ])('rejects invalid cut times (%s)', async (_, cuts) => {
    const dir = createOutputFixture(JSON.stringify({ cuts }));
    const controller = new AbortController();
    await expect(validateAgentOutput(dir, controller.signal)).rejects.toThrow('Agent output cut times must be finite numbers with 0 <= from < to <= plan duration.');
  });

  it.each([
    ['missing reason', [{ from: 2.5, to: 3.5 }]],
    ['empty string reason', [{ from: 2.5, to: 3.5, reason: '' }]],
    ['reason not string', [{ from: 2.5, to: 3.5, reason: 123 }]],
    ['reason > 120 characters', [{ from: 2.5, to: 3.5, reason: 'a'.repeat(121) }]],
  ])('rejects invalid cut reason (%s)', async (_, cuts) => {
    const dir = createOutputFixture(JSON.stringify({ cuts }));
    const controller = new AbortController();
    await expect(validateAgentOutput(dir, controller.signal)).rejects.toThrow('Agent output cut reason must be a non-empty string of at most 120 characters.');
  });

  it('rejects cuts not sorted by from', async () => {
    const dir = createOutputFixture(
      JSON.stringify({
        cuts: [
          { from: 5.5, to: 6.5, reason: 'Second' },
          { from: 2.5, to: 3.5, reason: 'First' },
        ],
      })
    );
    const controller = new AbortController();
    await expect(validateAgentOutput(dir, controller.signal)).rejects.toThrow('Agent output cuts must be sorted by from and not overlap.');
  });

  it('rejects overlapping cuts', async () => {
    const dir = createOutputFixture(
      JSON.stringify({
        cuts: [
          { from: 2.2, to: 3.5, reason: 'First' },
          { from: 3.0, to: 4.0, reason: 'Overlaps first' },
        ],
      })
    );
    const controller = new AbortController();
    await expect(validateAgentOutput(dir, controller.signal)).rejects.toThrow('Agent output cuts must be sorted by from and not overlap.');
  });

  it('rejects cut starting strictly inside a transcript word', async () => {
    // word is [1, 2]
    const dir = createOutputFixture(
      JSON.stringify({
        cuts: [{ from: 1.5, to: 3.5, reason: 'Starts inside Hello' }],
      })
    );
    const controller = new AbortController();
    await expect(validateAgentOutput(dir, controller.signal)).rejects.toThrow(/starts inside a transcript word/);
  });

  it('rejects cut ending strictly inside a transcript word', async () => {
    // word is [1, 2]
    const dir = createOutputFixture(
      JSON.stringify({
        cuts: [{ from: 0.5, to: 1.5, reason: 'Ends inside Hello' }],
      })
    );
    const controller = new AbortController();
    await expect(validateAgentOutput(dir, controller.signal)).rejects.toThrow(/ends inside a transcript word/);
  });
});

describe('edit-list reason validation on operations', () => {
  async function createReel() {
    const dir = mkdtempSync(join(tmpdir(), 'kinotta-edit-reason-'));
    cpSync(copyFixture('footage-project'), dir, { recursive: true });
    const project = openProject(dir);
    projects.push(project);
    const { slug } = await project.startReel({ video: 'media/talk.mp4' });
    await project.whenTranscribed(slug);
    return { dir, project, slug };
  }

  it('accepts reason on snip operation and persists it in the edit list', async () => {
    const { project, slug } = await createReel();
    const list = await project.addOperation(slug, {
      kind: 'snip',
      from: 1.5,
      to: 2.5,
      by: 'you',
      reason: 'Paused to think',
    });
    expect(list.operations).toHaveLength(1);
    expect(list.operations[0]).toMatchObject({
      kind: 'snip',
      from: 1.5,
      to: 2.5,
      reason: 'Paused to think',
    });
  });

  it('accepts snip operation without reason', async () => {
    const { project, slug } = await createReel();
    const list = await project.addOperation(slug, {
      kind: 'snip',
      from: 1.5,
      to: 2.5,
      by: 'you',
    });
    expect(list.operations).toHaveLength(1);
    expect((list.operations[0] as any).reason).toBeUndefined();
  });

  it('refuses reason on non-snip operations', async () => {
    const { project, slug } = await createReel();
    await expect(
      project.addOperation(slug, {
        kind: 'cut',
        at: 2.0,
        by: 'you',
        reason: 'Cut here',
      } as any)
    ).rejects.toMatchObject({
      code: 'invalid',
      message: 'That kind of edit cannot carry a reason.',
    });
  });

  it.each([
    ['empty reason', ''],
    ['whitespace only reason', '   '],
    ['reason too long', 'a'.repeat(121)],
    ['non-string reason', 12345],
  ])('refuses invalid reason on snip (%s)', async (_, reason) => {
    const { project, slug } = await createReel();
    await expect(
      project.addOperation(slug, {
        kind: 'snip',
        from: 1.5,
        to: 2.5,
        by: 'you',
        reason: reason as any,
      })
    ).rejects.toMatchObject({
      code: 'invalid',
      message: 'A snip reason must be a non-empty string of at most 120 characters.',
    });
  });
});

describe('publishing cuts through validateAndPublish paths', { timeout: 90_000 }, () => {
  async function setupJob(mode = 'cuts') {
    const dir = mkdtempSync(join(tmpdir(), 'kinotta-cuts-pub-'));
    cpSync(copyFixture('footage-project'), dir, { recursive: true });
    const fake = join(dir, 'fake agent.mjs');
    cpSync(resolve('tests/core/fake-broll-agent.mjs'), fake);
    let nextMode = mode;
    const project = openProject(dir, {
      transcriber: async () => [{ text: 'hello', start: 0.5, end: 1.0 }],
      agent: {
        ceilingMs: 60_000,
        quietMs: 100,
        launch: async (input) => {
          return launchAgent({
            ...input,
            executable: { command: process.execPath, prefix: [fake, nextMode] },
          });
        },
      },
    });
    projects.push(project);
    await project.saveAgentSettings({ provider: 'claude', confirmed: true });
    return { dir, project, setMode: (m: string) => { nextMode = m; } };
  }

  it('managed run publishes agent cuts with by agent-cut and reason, removing cuts.json from v2', async () => {
    const fixture = await setupJob('cuts');
    const { slug } = await fixture.project.startReel({
      video: 'media/talk.mp4',
      broll: 'heavy',
      pace: 'fast',
      agentConfirmed: true,
    });
    await fixture.project.whenTranscribed(slug);
    await fixture.project.whenAgentDone(slug);

    const job = await fixture.project.agentJob(slug);
    expect(job).toMatchObject({ state: 'succeeded', version: 2 });

    const editList = await fixture.project.readEditList(slug);
    expect(editList.operations).toHaveLength(1);
    expect(editList.operations[0]).toMatchObject({
      kind: 'snip',
      from: 1.5,
      to: 2.5,
      by: AGENT_CUT_BY,
      reason: 'Long pause before the answer',
    });

    // cuts.json was deleted from v2 folder
    const v2CutsFile = join(fixture.dir, 'reels', slug, 'v2', 'cuts.json');
    expect(existsSync(v2CutsFile)).toBe(false);

    // Snip is ordinary: can be removed / restored
    const afterRemove = await fixture.project.removeOperation(slug, editList.operations[0].id);
    expect(afterRemove.operations).toHaveLength(0);

    // Can undo
    const afterUndo = await fixture.project.undoEdit(slug);
    expect(afterUndo.operations).toHaveLength(1);
    expect(afterUndo.operations[0].id).toBe(editList.operations[0].id);
  });

  it.each([false, true])('acceptAgentOutput publishes agent cuts once with concurrent DONE watcher %s', async (withDone) => {
    const fixture = await setupJob('cuts');
    await fixture.project.saveAgentSettings({ provider: 'copy' });

    const { slug } = await fixture.project.startReel({
      video: 'media/talk.mp4',
      broll: 'heavy',
      pace: 'fast',
      agentConfirmed: true,
    });
    await fixture.project.whenTranscribed(slug);
    await fixture.project.whenAgentDone(slug);

    const job = await fixture.project.agentJob(slug);
    expect(job).toMatchObject({ state: 'copy-ready' });

    // Run the fake agent in the job directory so it writes valid clips, index.html, shots.json, and cuts.json
    const jobDir = join(fixture.dir, 'reels', slug, '.agent/jobs', job!.id);
    const fake = join(fixture.dir, 'fake agent.mjs');
    const res = spawnSync(process.execPath, [fake, 'cuts'], { cwd: jobDir, input: 'prompt', env: { ...process.env, NODE_PATH: resolve('node_modules') }, windowsHide: true });
    expect(res.status).toBe(0);

    if (withDone) writeFileSync(join(jobDir, 'output/DONE'), '');
    // Make a manual accept arrive while the watcher is already validating.
    let concurrentAccept: ReturnType<typeof fixture.project.acceptAgentOutput> | undefined;
    const stop = fixture.project.subscribe((event) => {
      if (withDone && event.type === 'agent-progress' && event.job.state === 'validating') {
        concurrentAccept = fixture.project.acceptAgentOutput(slug, job!.id);
      }
    });
    let acceptedJob;
    try {
      if (withDone) {
        await until(() => concurrentAccept !== undefined);
        acceptedJob = await concurrentAccept!;
      } else {
        acceptedJob = await fixture.project.acceptAgentOutput(slug, job!.id);
      }
    } finally { stop(); }
    expect(acceptedJob, JSON.stringify(acceptedJob)).toMatchObject({ state: 'succeeded', version: 2 });

    const editList = await fixture.project.readEditList(slug);
    expect(editList.operations).toHaveLength(1);
    expect(editList.operations[0]).toMatchObject({
      kind: 'snip',
      from: 1.5,
      to: 2.5,
      by: AGENT_CUT_BY,
      reason: 'Long pause before the answer',
    });

    // cuts.json was deleted from v2 folder
    const v2CutsFile = join(fixture.dir, 'reels', slug, 'v2', 'cuts.json');
    expect(existsSync(v2CutsFile)).toBe(false);
    expect(await fixture.project.acceptAgentOutput(slug, job!.id)).toMatchObject({ state: 'succeeded', version: 2 });
    expect(await fixture.project.agentJob(slug)).toMatchObject({ state: 'succeeded', version: 2 });
    expect(existsSync(join(fixture.dir, 'reels', slug, 'v3'))).toBe(false);
    expect(existsSync(join(fixture.dir, 'reels', slug, 'v2/DONE'))).toBe(false);
  });
});
