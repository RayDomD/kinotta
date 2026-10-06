import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import type { ProjectEvent } from '../../server/core/index.ts';
import { startServer } from '../../server/main.ts';
import type { RunningServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'product-showreel';
const LAUNCHER = resolve(import.meta.dirname, '../../bin/kinotta.mjs');
const CLI_TIMEOUT_MS = 20_000;
const EVENT_WAIT_MS = 4000;
const QUIET_MS = 700;

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
const approvalFile = (dir: string, reel: string, n: number): string => join(dir, 'reels', reel, `v${n}`, 'approval.json');

/** Every file in a folder, by relative path, to its contents and mtime. */
function folderState(dir: string): Map<string, string> {
  const state = new Map<string, string>();
  const walk = (at: string, prefix: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path, `${prefix}${entry.name}/`);
      else state.set(`${prefix}${entry.name}`, `${statSync(path).mtimeMs}:${readFileSync(path, 'utf8')}`);
    }
  };
  walk(dir, '');
  return state;
}

function listen(project: ReturnType<typeof openProject>) {
  const events: ProjectEvent[] = [];
  const unsubscribe = project.subscribe((event) => events.push(event));
  const approvals = (): ProjectEvent[] => events.filter((e) => e.type === 'approval-changed');
  const nextApproval = async (count: number): Promise<ProjectEvent> => {
    const deadline = Date.now() + EVENT_WAIT_MS;
    while (Date.now() < deadline) {
      if (approvals().length >= count) return approvals()[count - 1]!;
      await sleep(25);
    }
    throw new Error(`No approval-changed event within ${EVENT_WAIT_MS} ms. Saw ${JSON.stringify(events)}`);
  };
  return { events, approvals, unsubscribe, nextApproval };
}

describe('approval', () => {
  it('approve writes approval.json; withdraw deletes it and leaves renders/ alone', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);

    const approved = await project.approveVersion(REEL, 2);

    expect(approved).toEqual({ approved: true, at: expect.any(String) });
    expect(JSON.parse(readFileSync(approvalFile(dir, REEL, 2), 'utf8'))).toEqual({ approvedBy: 'you', at: approved.at });

    const renders = join(dir, 'reels', REEL, 'renders');
    mkdirSync(renders);
    writeFileSync(join(renders, 'product-showreel-v2-draft-540p30.mp4'), 'video');
    expect(await project.withdrawApproval(REEL, 2)).toEqual({ approved: false });
    expect(existsSync(approvalFile(dir, REEL, 2))).toBe(false);
    expect(readdirSync(renders)).toEqual(['product-showreel-v2-draft-540p30.mp4']);
  });

  it('keeps the first approval time when a version is approved again', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);

    const first = await project.approveVersion(REEL, 2);
    await sleep(10);

    expect((await project.approveVersion(REEL, 2)).at).toBe(first.at);
  });

  it('approves more than one version of a reel, and lists which', async () => {
    const project = openProject(copyFixture('showreel-project'));

    expect((await project.listVersions(REEL)).map((v) => v.approved)).toEqual([false, false]);
    await project.approveVersion(REEL, 1);
    await project.approveVersion(REEL, 2);

    expect((await project.listVersions(REEL)).map((v) => v.approved)).toEqual([true, true]);
    await project.withdrawApproval(REEL, 1);
    expect((await project.listVersions(REEL)).map((v) => v.approved)).toEqual([false, true]);
  });

  it('leaves every other file in the version unchanged', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    const before = folderState(join(dir, 'reels', REEL, 'v2'));

    await project.approveVersion(REEL, 2);

    const after = folderState(join(dir, 'reels', REEL, 'v2'));
    after.delete('approval.json');
    expect(after).toEqual(before);
  });

  it('refuses an unknown reel or version', async () => {
    const project = openProject(copyFixture('showreel-project'));

    await expect(project.approveVersion('nope', 1)).rejects.toMatchObject({ code: 'not-found' });
    await expect(project.approveVersion(REEL, 9)).rejects.toMatchObject({ code: 'not-found' });
    await expect(project.withdrawApproval(REEL, 9)).rejects.toMatchObject({ code: 'not-found' });
  });

  it('approves a version with contract issues and warns, naming them', async () => {
    const dir = copyFixture('broken-project');
    const project = openProject(dir);
    const issues = (await project.readVersion('launch-teaser', 1)).issues;

    const approved = await project.approveVersion('launch-teaser', 1);

    expect(existsSync(approvalFile(dir, 'launch-teaser', 1))).toBe(true);
    expect(approved.warning).toContain(`${issues.length} contract`);
    for (const issue of issues) expect(approved.warning).toContain(issue.message);
  });

  it('does not carry an approval to the version a code-only Save builds', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    await project.approveVersion(REEL, 2);
    await project.addOperation(REEL, { kind: 'element-offset', clip: 'cta', element: '@clip', x: 0, y: 12, scale: 1 });

    expect(await project.saveEdits(REEL)).toEqual({ version: 3 });

    expect(existsSync(approvalFile(dir, REEL, 3))).toBe(false);
    expect((await project.listVersions(REEL)).map((v) => v.approved)).toEqual([false, true, false]);
  });
});

describe('approval-changed', () => {
  it('fires once when the editor approves and once when it withdraws', async () => {
    const project = openProject(copyFixture('showreel-project'));
    const { approvals, unsubscribe, nextApproval } = listen(project);
    try {
      await project.approveVersion(REEL, 2);
      expect(await nextApproval(1)).toEqual({ type: 'approval-changed', reel: REEL, version: 2, approved: true });
      await project.withdrawApproval(REEL, 2);
      expect(await nextApproval(2)).toEqual({ type: 'approval-changed', reel: REEL, version: 2, approved: false });
      await sleep(QUIET_MS);
      expect(approvals()).toHaveLength(2);
    } finally {
      unsubscribe();
    }
  });

  it('fires when approval.json is written or removed outside the editor', async () => {
    const dir = copyFixture('showreel-project');
    const { unsubscribe, nextApproval } = listen(openProject(dir));
    try {
      writeFileSync(approvalFile(dir, REEL, 1), JSON.stringify({ approvedBy: 'you', at: '2026-10-05T00:00:00.000Z' }));
      expect(await nextApproval(1)).toEqual({ type: 'approval-changed', reel: REEL, version: 1, approved: true });
      rmSync(approvalFile(dir, REEL, 1));
      expect(await nextApproval(2)).toEqual({ type: 'approval-changed', reel: REEL, version: 1, approved: false });
    } finally {
      unsubscribe();
    }
  });
});

describe('approval over HTTP', () => {
  const running: RunningServer[] = [];
  afterEach(async () => {
    for (const server of running.splice(0)) await server.close();
  });

  it('PUT approves, DELETE withdraws, and the version listing follows', async () => {
    const dir = copyFixture('showreel-project');
    const server = await startServer({ projectDir: dir, port: 0 });
    running.push(server);
    const url = `${server.url}/api/reels/${REEL}/versions/2/approval`;

    const put = await fetch(url, { method: 'PUT' });
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ approved: true });
    const listed = (await (await fetch(`${server.url}/api/reels/${REEL}/versions`)).json()) as { versions: Array<{ approved: boolean }> };
    expect(listed.versions.map((v) => v.approved)).toEqual([false, true]);

    const del = await fetch(url, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ approved: false });
    expect(existsSync(approvalFile(dir, REEL, 2))).toBe(false);

    expect((await fetch(`${server.url}/api/reels/${REEL}/versions/9/approval`, { method: 'PUT' })).status).toBe(404);
    expect((await fetch(url, { method: 'POST' })).status).toBe(405);
  });
});

describe('kinotta approve', () => {
  it('is not a command, and writes nothing', () => {
    const dir = copyFixture('showreel-project');

    const run = spawnSync(process.execPath, [LAUNCHER, 'approve', REEL, '2'], { cwd: dir, encoding: 'utf8', timeout: CLI_TIMEOUT_MS });

    expect(run.status).toBe(1);
    expect(existsSync(approvalFile(dir, REEL, 2))).toBe(false);
  });
});
