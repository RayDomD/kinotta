import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyFixture } from '../helpers/project.ts';

// Holds the safety check open so a test can change the project or job during watcher startup.
const gate = vi.hoisted(() => ({ release: () => {}, held: Promise.resolve(), entered: () => {} }));
const watchCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock('../../server/core/_internal/copy-watch.ts', async (importActual) => {
  const actual = await importActual<typeof import('../../server/core/_internal/copy-watch.ts')>();
  return {
    ...actual,
    assertSafeCopyOutput: async (...args: Parameters<typeof actual.assertSafeCopyOutput>) => {
      await actual.assertSafeCopyOutput(...args);
      gate.entered();
      await gate.held;
    },
    watchCopyOutput: (...args: Parameters<typeof actual.watchCopyOutput>) => {
      watchCalls.count += 1;
      return actual.watchCopyOutput(...args);
    },
  };
});

const { openProject } = await import('../../server/core/index.ts');
type Project = ReturnType<typeof openProject>;

const projects: Project[] = [];
afterEach(async () => {
  gate.release();
  await Promise.all(projects.splice(0).map((p) => p.close()));
  watchCalls.count = 0;
});

async function startCopyJob() {
  const dir = mkdtempSync(join(tmpdir(), 'kinotta-copy-watch-race-'));
  cpSync(copyFixture('footage-project'), dir, { recursive: true });
  const project = openProject(dir, {
    transcriber: async () => [{ text: 'hello', start: 0.5, end: 1.0 }],
    agent: {
      ceilingMs: 60_000,
      quietMs: 100,
      settleMs: 50,
      launch: async () => { throw new Error('Copy job must not launch agent CLI'); },
    },
  });
  projects.push(project);
  await project.saveAgentSettings({ provider: 'copy' });
  const entered = new Promise<void>((resolveEntered) => { gate.entered = resolveEntered; });
  gate.held = new Promise<void>((resolveHeld) => { gate.release = resolveHeld; });
  const { slug } = await project.startReel({ video: 'media/talk.mp4', agentConfirmed: true });
  await project.whenTranscribed(slug);
  await entered;
  return { project, slug };
}

describe('copy watcher startup race', () => {
  it('does not install a watcher after the project closes while the output check is pending', async () => {
    const { project } = await startCopyJob();
    const closing = project.close();
    gate.release();
    await closing;
    await new Promise((r) => setTimeout(r, 100));
    expect(watchCalls.count).toBe(0);
  }, 30_000);

  it('does not install a watcher after the job leaves copy-ready while the output check is pending', async () => {
    const { project, slug } = await startCopyJob();
    const job = (await project.agentJob(slug))!;
    expect(job.state).toBe('copy-ready');
    const accepting = new Promise<void>((resolveEntered) => { gate.entered = resolveEntered; });
    const accepted = project.acceptAgentOutput(slug, job.id);
    await accepting;
    expect(await project.agentJob(slug)).toMatchObject({ id: job.id, state: 'validating' });
    gate.release();
    await accepted;
    await new Promise((r) => setTimeout(r, 100));
    expect(watchCalls.count).toBe(0);
  }, 30_000);

  it('does not install a watcher for a replaced job while the output check is pending', async () => {
    const { project, slug } = await startCopyJob();
    const original = (await project.agentJob(slug))!;
    expect(original.state).toBe('copy-ready');
    // The replacement uses the fake failing launcher, so it cannot install a copy watcher itself.
    await project.saveAgentSettings({ provider: 'claude', confirmed: true });
    const replacement = await project.startAgentJob(slug, true);
    expect(replacement.id).not.toBe(original.id);
    await project.whenAgentDone(slug);
    expect(await project.agentJob(slug)).toMatchObject({ id: replacement.id, state: 'failed' });
    gate.release();
    await new Promise((r) => setTimeout(r, 100));
    expect(watchCalls.count).toBe(0);
  }, 30_000);
});
